let redirectCount = 0;
let debugToPage = false;

// Helper function to log to both extension console and optionally page console
function debugLog(...args) {
  console.log(...args); // Always log to extension console

  if (debugToPage) {
    // Try to log to the active tab's console
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;
        chrome.scripting
          .executeScript({
            target: {tabId},
            func: function (logArgs) {
              console.log("[REDIRECT-EXTENSION]", ...logArgs);
            },
            args: [args],
          })
          .catch((err) => console.error("Failed to log to page console:", err));
      }
    });
  }
}

// Initialize the extension with better error handling
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.local.get(
    ["redirectRules", "enabled", "redirectCount", "debugToPage"],
    (result) => {
      if (!result.redirectRules) {
        chrome.storage.local.set({
          redirectRules: [],
          enabled: false,
          redirectCount: 0,
          debugToPage: false,
        });
      } else {
        // If we have existing data, restore the counts and settings
        redirectCount = result.redirectCount || 0;

        // Restore debug mode with better error handling
        if (result.debugToPage === true) {
          chrome.permissions.contains(
            {permissions: ["scripting"]},
            async (hasPermission) => {
              if (hasPermission) {
                debugToPage = true;
                try {
                  await injectDebugScript();
                } catch (error) {
                  console.error("Failed to restore debug mode:", error);
                  debugToPage = false;
                  chrome.storage.local.set({debugToPage: false});
                }
              } else {
                // If no permission, reset debug setting
                debugToPage = false;
                chrome.storage.local.set({debugToPage: false});
              }
            }
          );
        }
      }

      updateRedirectRules();
    }
  );
});

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes) => {
  if (changes.redirectRules || changes.enabled) {
    updateRedirectRules();
  }
});

// Update the declarativeNetRequest rules based on stored settings
async function updateRedirectRules() {
  try {
    const {redirectRules, enabled} = await chrome.storage.local.get([
      "redirectRules",
      "enabled",
    ]);

    if (!enabled || !redirectRules || redirectRules.length === 0) {
      // Clear all redirect rules if disabled or no rules exist
      const currentRuleIds = await getCurrentRuleIds();
      if (currentRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: currentRuleIds,
        });
      }
      return;
    }

    // Create new rules - filter out disabled rules
    const newRules = redirectRules
      .filter((rule) => !rule.disabled) // Skip disabled rules
      .map((rule, index) => {
        if (!rule.fromUrl || !rule.toUrl) return null;
        console.log("rule", rule);

        const resourceTypes =
          rule.resourceTypes && rule.resourceTypes.length > 0
            ? rule.resourceTypes
            : [
                "main_frame",
                "sub_frame",
                "stylesheet",
                "script",
                "image",
                "xmlhttprequest",
                "other",
              ];

        // Parse the wildcard in the from URL
        const fromUrl = rule.fromUrl;
        const toUrl = rule.toUrl;
        const wildcardIndex = fromUrl.indexOf("**");

        // No wildcard, use exact URL matching
        if (wildcardIndex === -1) {
          return {
            id: index + 1,
            priority: 1,
            action: {
              type: "redirect",
              redirect: {url: toUrl},
            },
            condition: {
              urlFilter: fromUrl,
              resourceTypes: resourceTypes,
            },
          };
        }

        // Split the URL into prefix and suffix
        const prefix = fromUrl.substring(0, wildcardIndex);
        const suffix = fromUrl.substring(wildcardIndex + 2);

        // Find the wildcard position in the target URL
        const targetWildcardIndex = toUrl.indexOf("**");

        // If no wildcard in target URL, use direct URL matching
        if (targetWildcardIndex === -1) {
          return {
            id: index + 1,
            priority: 1,
            action: {
              type: "redirect",
              redirect: {url: toUrl},
            },
            condition: {
              urlFilter: fromUrl.replace("**", "*"), // Simple wildcard for matching
              resourceTypes: resourceTypes,
            },
          };
        }

        // If both URLs have wildcards, use regex pattern matching
        const targetPrefix = toUrl.substring(0, targetWildcardIndex);
        const targetSuffix = toUrl.substring(targetWildcardIndex + 2);

        // Create a regex pattern with appropriate matching to capture the wildcard part
        let regexPattern;
        if (suffix) {
          // With suffix, capture everything between prefix and suffix
          regexPattern =
            "^" + escapeRegExp(prefix) + "(.*?)" + escapeRegExp(suffix) + "$";
        } else {
          // No suffix, capture everything after the prefix
          regexPattern = "^" + escapeRegExp(prefix) + "(.*)$";
        }

        // The substitution pattern for the declarativeNetRequest API
        const regexSubstitution = targetPrefix + "\\1" + targetSuffix;

        return {
          id: index + 1,
          priority: 1,
          action: {
            type: "redirect",
            redirect: {regexSubstitution: regexSubstitution},
          },
          condition: {
            regexFilter: regexPattern,
            resourceTypes: resourceTypes,
          },
        };
      })
      .filter(Boolean);

    console.log(
      "Generated declarativeNetRequest rules:",
      JSON.stringify(newRules, null, 2)
    );

    // Update the rules
    const currentRuleIds = await getCurrentRuleIds();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: currentRuleIds,
      addRules: newRules,
    });
  } catch (error) {
    console.error("Error updating redirect rules:", error);
  }
}

// Helper to escape special regex characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper to get current rule IDs
async function getCurrentRuleIds() {
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.map((rule) => rule.id);
  } catch (error) {
    console.error("Error getting current rule IDs:", error);
    return [];
  }
}

// Track redirected requests
chrome.webRequest?.onBeforeRedirect?.addListener(
  () => {
    redirectCount++;
    chrome.storage.local.set({redirectCount});
  },
  {urls: ["<all_urls>"]}
);

// Log when a rule is matched (if debugging is enabled)
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const requestUrl = info.request.url;
    const redirectUrl = info.redirect
      ? info.redirect.url
      : "Unknown destination";

    debugLog("Rule matched:", {
      info: info,
      url: requestUrl,
      redirectUrl: redirectUrl,
      ruleId: info.rule.ruleId,
    });

    redirectCount++;
    chrome.storage.local.set({redirectCount});
  });
}

// Message handling from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Get redirect count
  if (message.action === "getRedirectCount") {
    sendResponse({count: redirectCount});
    return true;
  }

  // Test URL matching
  else if (message.action === "testUrlMatch") {
    const {inputUrl, rule} = message;
    try {
      const fromUrl = rule.fromUrl;
      const toUrl = rule.toUrl;
      const wildcardIndex = fromUrl.indexOf("**");

      // No wildcard in from URL - exact matching
      if (wildcardIndex === -1) {
        const matches = inputUrl === fromUrl;
        sendResponse({matched: matches, redirectUrl: matches ? toUrl : null});
        return true;
      }

      // Parse the wildcard pattern
      const prefix = fromUrl.substring(0, wildcardIndex);
      const suffix = fromUrl.substring(wildcardIndex + 2);

      // Check if URL matches the pattern
      if (!inputUrl.startsWith(prefix)) {
        sendResponse({matched: false});
        return true;
      }

      // If there's a suffix, ensure the URL ends with it
      if (suffix && !inputUrl.endsWith(suffix)) {
        sendResponse({matched: false});
        return true;
      }

      // Extract the wildcard content
      let wildcardContent;
      if (suffix) {
        const startPos = prefix.length;
        const endPos = inputUrl.length - suffix.length;
        wildcardContent = inputUrl.substring(startPos, endPos);
      } else {
        wildcardContent = inputUrl.substring(prefix.length);
      }

      // Check if target URL has a wildcard
      const targetWildcardIndex = toUrl.indexOf("**");
      let resultUrl;

      if (targetWildcardIndex === -1) {
        // No wildcard in target URL, use as-is
        resultUrl = toUrl;
      } else {
        // Replace the wildcard in target URL with captured content
        resultUrl =
          toUrl.substring(0, targetWildcardIndex) +
          wildcardContent +
          toUrl.substring(targetWildcardIndex + 2);
      }

      sendResponse({
        matched: true,
        redirectUrl: resultUrl,
        wildcardContent,
      });
    } catch (error) {
      console.error("Error testing URL match:", error);
      sendResponse({matched: false, error: error.message});
    }
    return true;
  }

  // Get active rules
  else if (message.action === "getActiveRules") {
    chrome.declarativeNetRequest
      .getDynamicRules()
      .then((rules) => {
        sendResponse({rules});
      })
      .catch((error) => {
        sendResponse({error: error.message});
      });
    return true;
  }

  // Toggle debug to page - improved version
  if (message.action === "toggleDebugToPage") {
    const wasEnabled = debugToPage;
    debugToPage = message.enabled;

    // Save debug state to storage
    chrome.storage.local.set({debugToPage});

    if (debugToPage && !wasEnabled) {
      // Only request permission and inject script if we're enabling debugging
      chrome.permissions.request(
        {permissions: ["scripting"]},
        async (granted) => {
          if (granted) {
            try {
              await injectDebugScript();
              sendResponse({success: true, debugEnabled: true});
            } catch (error) {
              console.error("Debug script injection error:", error);
              debugToPage = false;
              chrome.storage.local.set({debugToPage: false});
              sendResponse({
                success: false,
                debugEnabled: false,
                error: error.message,
              });
            }
          } else {
            debugToPage = false;
            chrome.storage.local.set({debugToPage: false});
            sendResponse({
              success: false,
              debugEnabled: false,
              error: "Permission denied",
            });
          }
        }
      );
      return true; // Keep the message channel open for async response
    } else if (!debugToPage && wasEnabled) {
      // Disable debug mode and remove scripts
      try {
        chrome.scripting
          .unregisterContentScripts({
            ids: ["redirect-debug"],
          })
          .catch((err) =>
            console.log("Failed to unregister debug script:", err)
          );
      } catch (error) {
        console.log("Error removing debug script:", error);
      }
    }

    sendResponse({success: true, debugEnabled: debugToPage});
    return true;
  }

  return true;
});

// Inject debug script with proper handling of duplicates
async function injectDebugScript() {
  try {
    // First check if the script is already registered
    const existingScripts = await chrome.scripting
      .getRegisteredContentScripts({
        ids: ["redirect-debug"],
      })
      .catch(() => []);

    // If the script already exists, unregister it first
    if (existingScripts && existingScripts.length > 0) {
      await chrome.scripting.unregisterContentScripts({
        ids: ["redirect-debug"],
      });
    }

    // Now we can safely register the script
    await chrome.scripting.registerContentScripts([
      {
        id: "redirect-debug",
        js: ["debug-inject.js"],
        matches: ["<all_urls>"],
        runAt: "document_start",
      },
    ]);

    console.log("Debug script successfully registered");
  } catch (error) {
    console.error("Failed to register debug script:", error);
    // Reset debug mode if script registration fails
    debugToPage = false;
    chrome.storage.local.set({debugToPage: false});
  }
}
