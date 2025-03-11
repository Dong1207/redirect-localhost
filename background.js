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
  console.log(...args);

  if (!debugToPage) return;

  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0]) return;

    chrome.scripting
      .executeScript({
        target: {tabId: tabs[0].id},
        func: (args) => console.log("[REDIRECT-EXTENSION]", ...args),
        args: [args],
      })
      .catch((err) => console.error("Failed to log to page console:", err));
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
      await injectDebugScript();
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

  // Add to history (keep limited size)
  redirectHistory.unshift({
    timestamp: Date.now(),
    fromUrl,
    toUrl,
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

// Listen for redirect events
if (chrome.webRequest?.onBeforeRedirect) {
  chrome.webRequest.onBeforeRedirect.addListener(
    (details) => recordRedirect(details.url, details.redirectUrl),
    {urls: ["<all_urls>"]}
  );
}

// Debug redirect matches
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const requestUrl = info.request.url;
    const redirectUrl = info.redirect?.url || "Unknown destination";

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

      debugLog("Rule matched:", {
        url: requestUrl,
        redirectUrl,
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
    // Only request permission and inject script if we're enabling debugging
    const granted = await chrome.permissions.request({
      permissions: ["scripting"],
    });
    if (granted) {
      try {
        await injectDebugScript();
        return {success: true, debugEnabled: true};
      } catch (error) {
        console.error("Debug script injection error:", error);
        debugToPage = false;
        await chrome.storage.local.set({debugToPage: false});
        return {success: false, debugEnabled: false, error: error.message};
      }
    } else {
      debugToPage = false;
      await chrome.storage.local.set({debugToPage: false});
      return {success: false, debugEnabled: false, error: "Permission denied"};
    }
  } else if (!debugToPage && wasEnabled) {
    // Disable debug mode and remove scripts
    try {
      await chrome.scripting.unregisterContentScripts({
        ids: ["redirect-debug"],
      });
    } catch (error) {
      console.log("Error removing debug script:", error);
    }
  }

  return {success: true, debugEnabled: debugToPage};
}

// Inject debug script with proper handling of duplicates
async function injectDebugScript() {
  try {
    // First check if the script is already registered
    const existingScripts = await chrome.scripting
      .getRegisteredContentScripts({ids: ["redirect-debug"]})
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
    await chrome.storage.local.set({debugToPage: false});
  }
}
