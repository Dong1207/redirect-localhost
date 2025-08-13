let redirectCount = 0;
let debugToPage = false;
let redirectHistory = [];

// Initialize the extension
chrome.runtime.onInstalled.addListener(async () => {
  // Load stored settings using Promise-based approach
  const storedData = await chrome.storage.local.get([
    "redirectRules",
    "enabled",
    "redirectCount",
    "debugToPage",
    "redirectHistory",
  ]);

  if (!storedData.redirectRules) {
    // Initial setup for new installations
    await chrome.storage.local.set({
      redirectRules: [],
      enabled: false,
      redirectCount: 0,
      debugToPage: false,
      redirectHistory: [],
    });
  } else {
    // Restore state from storage
    redirectCount = storedData.redirectCount || 0;
    redirectHistory = storedData.redirectHistory || [];

    // Handle debug mode restoration
    if (storedData.debugToPage === true) {
      tryRestoreDebugMode();
    }
  }

  // Set up the redirect rules
  await updateRedirectRules();
});

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "local") return;

  if (changes.redirectRules || changes.enabled) {
    updateRedirectRules();
  }
});

// Helper function for logging to both extension console and page
function debugLog(...args) {
  console.log("[EXTENSION-REDIRECT]", ...args);

  if (!debugToPage) return;

  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0]) return;
    
    try {
      // Check if the URL is valid before trying to construct a URL object
      if (!tabs[0].url || !tabs[0].url.startsWith('http')) {
        return; // Skip non-http URLs silently
      }
      
      // Check if the tab URL is http/https
      const tabUrl = new URL(tabs[0].url);
      if (tabUrl.protocol !== 'http:' && tabUrl.protocol !== 'https:') {
        return; // Skip non-http/https pages
      }
      
      // Try to send message to the content script
      chrome.tabs.sendMessage(tabs[0].id, {
        source: "redirect-extension-debug",
        args: args
      }).catch(error => {
        // If message fails (content script not injected), try to inject and execute directly
        chrome.scripting
          .executeScript({
            target: {tabId: tabs[0].id},
            func: (args) => console.log("[EXTENSION-REDIRECT]", ...args),
            args: [args],
          })
          .catch((err) => {
            // Don't log errors for expected cases like invalid URLs
            if (err.message && (
                err.message.includes("Cannot access") || 
                err.message.includes("Invalid URL") ||
                err.message.includes("chrome-extension://")
              )) {
              // These are expected errors, don't log them
              return;
            }
            console.error("Failed to log to page console:", err);
          });
      });
    } catch (error) {
      // Don't log errors for expected cases like invalid URLs
      if (error instanceof TypeError && error.message.includes('Invalid URL')) {
        // This is expected for chrome:// URLs, new tabs, etc.
        return;
      }
      console.error("Error in debugLog:", error);
    }
  });
}

// Restore debug mode if it was previously enabled
async function tryRestoreDebugMode() {
  try {
    const permissionCheck = await chrome.permissions.contains({
      permissions: ["scripting"],
    });
    if (permissionCheck) {
      debugToPage = true;
    } else {
      await chrome.storage.local.set({debugToPage: false});
    }
  } catch (error) {
    console.error("Error restoring debug mode:", error);
    await chrome.storage.local.set({debugToPage: false});
  }
}

// Update the declarativeNetRequest rules
async function updateRedirectRules() {
  try {
    const {redirectRules, enabled} = await chrome.storage.local.get([
      "redirectRules",
      "enabled",
    ]);

    // Clear rules if disabled or no rules exist
    if (!enabled || !redirectRules?.length) {
      const currentRuleIds = await getCurrentRuleIds();
      if (currentRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: currentRuleIds,
        });
      }
      return;
    }

    // Build new rule set from enabled rules
    const newRules = redirectRules
      .filter((rule) => !rule.disabled && rule.fromUrl && rule.toUrl)
      .map((rule, index) => createRuleObject(rule, index + 1))
      .filter(Boolean);

    // Apply the rules
    const currentRuleIds = await getCurrentRuleIds();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: currentRuleIds,
      addRules: newRules,
    });

    debugLog("Updated redirect rules:", newRules.length);
  } catch (error) {
    console.error("Error updating redirect rules:", error);
  }
}

// Create a declarativeNetRequest rule object from our rule format
function createRuleObject(rule, id) {
  // Default resource types for all rules
  const resourceTypes = [
    "main_frame",
    "sub_frame",
    "stylesheet",
    "script",
    "image",
    "xmlhttprequest",
    "other",
  ];

  const {fromUrl, toUrl} = rule;
  
  // Basic URL validation
  if (!fromUrl || !toUrl || 
      !fromUrl.startsWith('http://') && !fromUrl.startsWith('https://') ||
      !toUrl.startsWith('http://') && !toUrl.startsWith('https://')) {
    // Return null for invalid URLs, which will be filtered out
    return null;
  }
  
  const wildcardIndex = fromUrl.indexOf("**");

  // No wildcard case - simple URL matching
  if (wildcardIndex === -1) {
    return {
      id,
      priority: 1,
      action: {type: "redirect", redirect: {url: toUrl}},
      condition: {urlFilter: fromUrl, resourceTypes},
    };
  }

  // Extract parts for wildcard matching
  const prefix = fromUrl.substring(0, wildcardIndex);
  const suffix = fromUrl.substring(wildcardIndex + 2);
  const targetWildcardIndex = toUrl.indexOf("**");

  // No wildcard in target URL
  if (targetWildcardIndex === -1) {
    return {
      id,
      priority: 1,
      action: {type: "redirect", redirect: {url: toUrl}},
      condition: {
        urlFilter: fromUrl.replace("**", "*"),
        resourceTypes,
      },
    };
  }

  // Both URLs have wildcards - use regex
  const targetPrefix = toUrl.substring(0, targetWildcardIndex);
  const targetSuffix = toUrl.substring(targetWildcardIndex + 2);

  // Create pattern based on whether there's a suffix
  const regexPattern = suffix
    ? `^${escapeRegExp(prefix)}(.*?)${escapeRegExp(suffix)}$`
    : `^${escapeRegExp(prefix)}(.*)$`;

  return {
    id,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {regexSubstitution: `${targetPrefix}\\1${targetSuffix}`},
    },
    condition: {regexFilter: regexPattern, resourceTypes},
  };
}

// Helper functions
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getCurrentRuleIds() {
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.map((rule) => rule.id);
  } catch (error) {
    console.error("Error getting rule IDs:", error);
    return [];
  }
}

// Track redirects and maintain history
function recordRedirect(fromUrl, toUrl, ruleDetails = "Unknown rule") {
  redirectCount++;

  // Ensure we have valid URLs
  const validFromUrl = fromUrl || "Unknown source";
  const validToUrl = toUrl || "Unknown destination";

  // Add to history (keep limited size)
  redirectHistory.unshift({
    timestamp: Date.now(),
    fromUrl: validFromUrl,
    toUrl: validToUrl,
    ruleDetails,
  });

  // Limit history size to 100 entries
  if (redirectHistory.length > 100) {
    redirectHistory = redirectHistory.slice(0, 100);
  }

  // Save to storage
  chrome.storage.local.set({
    redirectCount,
    redirectHistory,
  });
}

// Debug redirect matches
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const requestUrl = info.request.url;
    // Provide more detailed information when redirect URL is not available
    let redirectUrl = "Unknown destination";
    if (info.redirect && info.redirect.url) {
      redirectUrl = info.redirect.url;
    } else if (info.redirect && info.redirect.regexSubstitution) {
      redirectUrl = `Regex substitution: ${info.redirect.regexSubstitution}`;
    }

    try {
      // Get rule details for better context
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      const matchedRule = rules.find((r) => r.id === info.rule.ruleId);
      const ruleDetails = matchedRule
        ? `Rule #${matchedRule.id}: ${
            matchedRule.condition.regexFilter ||
            matchedRule.condition.urlFilter ||
            ""
          }`
        : "Unknown rule";

      // Only log redirects that are processed by our extension
      debugLog("Redirect processed:", {
        from: requestUrl,
        to: redirectUrl,
        ruleId: info.rule.ruleId,
        details: ruleDetails,
      });

      recordRedirect(requestUrl, redirectUrl, ruleDetails);
    } catch (error) {
      console.error("Error in rule matched debug handler:", error);
      recordRedirect(requestUrl, redirectUrl);
    }
  });
}

// Message handling with unified handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    // Get redirect count
    getRedirectCount: () => ({count: redirectCount}),

    // Get redirect history
    getRedirectHistory: () => ({history: redirectHistory}),

    // Clear redirect history
    clearRedirectHistory: () => {
      redirectHistory = [];
      chrome.storage.local.set({redirectHistory: []});
      return {success: true};
    },

    // Test URL match against a rule
    testUrlMatch: () => {
      const {inputUrl, rule} = message;
      return testUrlWithRule(inputUrl, rule);
    },

    // Get active redirect rules
    getActiveRules: async () => {
      try {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        return {rules};
      } catch (error) {
        return {error: error.message};
      }
    },

    // Toggle debug to page console
    toggleDebugToPage: () => handleDebugToggle(message.enabled),
  };

  // Handle the message based on action type
  const handler = handlers[message.action];
  if (!handler) return false;

  // For async handlers, we need to return true to keep the message channel open
  const isAsync = handler.constructor.name === "AsyncFunction";

  if (isAsync) {
    handler().then(sendResponse);
    return true;
  } else {
    sendResponse(handler());
    return false;
  }
});

// Test if a URL matches a rule
function testUrlWithRule(inputUrl, rule) {
  try {
    const {fromUrl, toUrl} = rule;
    const wildcardIndex = fromUrl.indexOf("**");

    // Handle exact matches (no wildcard)
    if (wildcardIndex === -1) {
      return {
        matched: inputUrl === fromUrl,
        redirectUrl: inputUrl === fromUrl ? toUrl : null,
      };
    }

    // Handle wildcard matches
    const prefix = fromUrl.substring(0, wildcardIndex);
    const suffix = fromUrl.substring(wildcardIndex + 2);

    // Check if URL matches the pattern
    if (!inputUrl.startsWith(prefix)) {
      return {matched: false};
    }

    // If there's a suffix, ensure the URL ends with it
    if (suffix && !inputUrl.endsWith(suffix)) {
      return {matched: false};
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

    return {
      matched: true,
      redirectUrl: resultUrl,
      wildcardContent,
    };
  } catch (error) {
    console.error("Error testing URL match:", error);
    return {matched: false, error: error.message};
  }
}

// Handle debug toggle
async function handleDebugToggle(enabled) {
  const wasEnabled = debugToPage;
  debugToPage = enabled;

  // Save debug state to storage
  await chrome.storage.local.set({debugToPage});

  if (debugToPage && !wasEnabled) {
    // Request permission when enabling debugging
    const granted = await chrome.permissions.request({
      permissions: ["scripting"],
    });
    if (granted) {
      return {success: true, debugEnabled: true};
    } else {
      debugToPage = false;
      await chrome.storage.local.set({debugToPage: false});
      return {success: false, debugEnabled: false, error: "Permission denied"};
    }
  } else if (!debugToPage && wasEnabled) {
    // No additional cleanup needed when disabling debug
  }

  return {success: true, debugEnabled: debugToPage};
}
