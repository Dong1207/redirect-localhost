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
        chrome.scripting.executeScript({
          target: {tabId},
          func: function(logArgs) {
            console.log("[REDIRECT-EXTENSION]", ...logArgs);
          },
          args: [args]
        }).catch(err => console.error("Failed to log to page console:", err));
      }
    });
  }
}

// Initialize the extension
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.local.get(
    ["redirectRules", "enabled", "redirectCount"],
    (result) => {
      if (!result.redirectRules) {
        chrome.storage.local.set({
          redirectRules: [],
          enabled: false,
          redirectCount: 0,
        });
      } else {
        // If we have existing data, restore the redirect count
        redirectCount = result.redirectCount || 0;
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

    // Create new rules
    const newRules = redirectRules
      .map((rule, index) => {
        if (!rule.fromUrl || !rule.toUrl) return null;

        const resourceTypes = rule.resourceTypes && rule.resourceTypes.length > 0
          ? rule.resourceTypes
          : ["main_frame", "sub_frame", "stylesheet", "script", "image", "xmlhttprequest", "other"];

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
          regexPattern = escapeRegExp(prefix) + "(.*?)" + escapeRegExp(suffix);
        } else {
          // No suffix, capture everything after the prefix
          regexPattern = escapeRegExp(prefix) + "(.*)";
        }

        // The substitution pattern for the declarativeNetRequest API
        const regexSubstitution = targetPrefix + "$1" + targetSuffix;

        return {
          id: index + 1,
          priority: 1,
          action: {
            type: "redirect",
            redirect: {
              regexSubstitution: regexSubstitution,
            },
          },
          condition: {
            regexFilter: regexPattern,
            resourceTypes: resourceTypes,
          },
        };
      })
      .filter(Boolean);

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
    const redirectUrl = info.redirect ? info.redirect.url : "Unknown destination";
    
    debugLog("Rule matched:", {
      url: requestUrl,
      redirectUrl: redirectUrl,
      ruleId: info.rule.ruleId
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
  
  // Toggle debug to page
  else if (message.action === "toggleDebugToPage") {
    debugToPage = message.enabled;
    
    if (debugToPage) {
      // Request scripting permission if needed
      chrome.permissions.request({
        permissions: ["scripting"]
      }, (granted) => {
        if (granted) {
          injectDebugScript();
        } else {
          debugToPage = false;
          console.log("Scripting permission denied, debug to page disabled");
        }
      });
    }
    
    sendResponse({success: true});
    return true;
  }
  
  return true;
});

// Inject debug script
async function injectDebugScript() {
  try {
    await chrome.scripting.registerContentScripts([{
      id: "redirect-debug",
      js: ["debug-inject.js"],
      matches: ["<all_urls>"],
      runAt: "document_start"
    }]);
  } catch (error) {
    console.error("Failed to register debug script:", error);
  }
}
