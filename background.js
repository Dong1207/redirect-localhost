let debugToPage = false;
let redirectHistory = [];
let stateLoaded = false;

// Restore in-memory state from storage on every SW wake
async function loadState() {
  if (stateLoaded) return;
  const data = await chrome.storage.local.get([
    "debugToPage",
    "redirectHistory",
  ]);
  redirectHistory = data.redirectHistory || [];
  if (data.debugToPage === true) {
    await tryRestoreDebugMode();
  }
  stateLoaded = true;
}

// Load state immediately on SW start
loadState();

// Open side panel when clicking the extension icon
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})
  .catch(err => console.error("Failed to set panel behavior:", err));

// Initialize storage defaults on first install
chrome.runtime.onInstalled.addListener(async () => {
  const storedData = await chrome.storage.local.get(["redirectRules"]);

  if (!storedData.redirectRules) {
    await chrome.storage.local.set({
      redirectRules: [],
      enabled: false,
      debugToPage: false,
      redirectHistory: [],
    });
  }

  await loadState();
  await updateRedirectRules();
});

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "local") return;

  if (changes.redirectRules || changes.enabled || changes.sections) {
    updateRedirectRules();
  }
});

// Log to extension console and optionally to page console
function debugLog(...args) {
  console.log("[EXTENSION-REDIRECT]", ...args);

  if (!debugToPage) return;

  // Serialize args to strings for safe injection into page context
  const serializedArgs = args.map((arg) =>
    typeof arg === "object" ? JSON.stringify(arg) : String(arg)
  );

  chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id || !tab.url?.startsWith("http")) return;

    chrome.scripting
      .executeScript({
        target: {tabId: tab.id},
        func: (logArgs) => {
          console.log("[EXTENSION-REDIRECT]", ...logArgs);
        },
        args: [serializedArgs],
      })
      .catch((err) => {
        console.warn("[EXTENSION-REDIRECT] Failed to log to page:", err.message);
      });
  });
}

async function tryRestoreDebugMode() {
  try {
    const hasPermission = await chrome.permissions.contains({
      permissions: ["scripting"],
    });
    debugToPage = hasPermission;
    if (!hasPermission) {
      await chrome.storage.local.set({debugToPage: false});
    }
  } catch {
    debugToPage = false;
    await chrome.storage.local.set({debugToPage: false});
  }
}

// Update the declarativeNetRequest rules
async function updateRedirectRules() {
  try {
    const {redirectRules, enabled, sections} = await chrome.storage.local.get([
      "redirectRules",
      "enabled",
      "sections",
    ]);

    const currentRuleIds = await getCurrentRuleIds();

    if (!enabled || !redirectRules?.length) {
      if (currentRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: currentRuleIds,
        });
      }
      return;
    }

    const sectionState = sections || {};

    const newRules = redirectRules
      .filter((rule) => {
        if (rule.disabled || !rule.fromUrl || !rule.toUrl) return false;
        const section = rule.section || "Default";
        return sectionState[section]?.enabled !== false;
      })
      .map((rule, index) => createRuleObject(rule, index + 1))
      .filter(Boolean);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: currentRuleIds,
      addRules: newRules,
    });

    debugLog("Updated redirect rules:", newRules.length);
  } catch (error) {
    console.error("Error updating redirect rules:", error);
  }
}

function createRuleObject(rule, id) {
  const resourceTypes = [
    "main_frame", "sub_frame", "stylesheet", "script",
    "image", "xmlhttprequest", "other",
  ];

  const {fromUrl, toUrl} = rule;

  // Fix: proper operator precedence with parentheses
  if (!fromUrl || !toUrl ||
      (!fromUrl.startsWith("http://") && !fromUrl.startsWith("https://")) ||
      (!toUrl.startsWith("http://") && !toUrl.startsWith("https://"))) {
    return null;
  }

  const wildcardIndex = fromUrl.indexOf("**");

  if (wildcardIndex === -1) {
    return {
      id,
      priority: 1,
      action: {type: "redirect", redirect: {url: toUrl}},
      condition: {urlFilter: fromUrl, resourceTypes},
    };
  }

  const prefix = fromUrl.substring(0, wildcardIndex);
  const suffix = fromUrl.substring(wildcardIndex + 2);
  const targetWildcardIndex = toUrl.indexOf("**");

  if (targetWildcardIndex === -1) {
    return {
      id,
      priority: 1,
      action: {type: "redirect", redirect: {url: toUrl}},
      condition: {urlFilter: fromUrl.replace("**", "*"), resourceTypes},
    };
  }

  const targetPrefix = toUrl.substring(0, targetWildcardIndex);
  const targetSuffix = toUrl.substring(targetWildcardIndex + 2);

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

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getCurrentRuleIds() {
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.map((rule) => rule.id);
  } catch {
    return [];
  }
}

async function recordRedirect(fromUrl, toUrl, ruleDetails = "Unknown rule") {
  await loadState();

  redirectHistory.unshift({
    timestamp: Date.now(),
    fromUrl: fromUrl || "Unknown source",
    toUrl: toUrl || "Unknown destination",
    ruleDetails,
  });

  if (redirectHistory.length > 100) {
    redirectHistory = redirectHistory.slice(0, 100);
  }

  chrome.storage.local.set({redirectHistory});
}

// Track redirects via webRequest.onBeforeRedirect
// declarativeNetRequest redirects show as 307 Internal Redirect
chrome.webRequest.onBeforeRedirect.addListener(
  async (details) => {
    // 307 Internal Redirect = extension-initiated (declarativeNetRequest)
    if (details.statusCode !== 307) return;

    await loadState();
    debugLog("Redirect:", details.url, "→", details.redirectUrl);
    await recordRedirect(details.url, details.redirectUrl);
  },
  {urls: ["<all_urls>"]}
);

// Async message handlers
const asyncHandlers = {
  getRedirectHistory: async () => {
    await loadState();
    return {history: [...redirectHistory]};
  },
  getActiveRules: async () => {
    try {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      return {rules};
    } catch (error) {
      return {error: error.message};
    }
  },
  toggleDebugToPage: async (message) => {
    const wasEnabled = debugToPage;
    debugToPage = message.enabled;
    await chrome.storage.local.set({debugToPage: message.enabled});

    if (message.enabled && !wasEnabled) {
      const hasPermission = await chrome.permissions.contains({
        permissions: ["scripting"],
      });
      if (!hasPermission) {
        debugToPage = false;
        await chrome.storage.local.set({debugToPage: false});
        return {success: false, debugEnabled: false, error: "Permission missing"};
      }
    }

    return {success: true, debugEnabled: debugToPage};
  },
};

// Sync message handlers
const syncHandlers = {
  clearRedirectHistory: () => {
    redirectHistory = [];
    chrome.storage.local.set({redirectHistory: []});
    return {success: true};
  },
  testUrlMatch: (message) => testUrlWithRule(message.inputUrl, message.rule),
  rulesUpdated: () => ({success: true}),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const asyncHandler = asyncHandlers[message.action];
  if (asyncHandler) {
    asyncHandler(message).then(sendResponse);
    return true;
  }

  const syncHandler = syncHandlers[message.action];
  if (syncHandler) {
    sendResponse(syncHandler(message));
    return false;
  }

  return false;
});

function testUrlWithRule(inputUrl, rule) {
  try {
    const {fromUrl, toUrl} = rule;
    const wildcardIndex = fromUrl.indexOf("**");

    if (wildcardIndex === -1) {
      const matched = inputUrl === fromUrl;
      return {matched, redirectUrl: matched ? toUrl : null};
    }

    const prefix = fromUrl.substring(0, wildcardIndex);
    const suffix = fromUrl.substring(wildcardIndex + 2);

    if (!inputUrl.startsWith(prefix)) return {matched: false};
    if (suffix && !inputUrl.endsWith(suffix)) return {matched: false};

    const wildcardContent = suffix
      ? inputUrl.substring(prefix.length, inputUrl.length - suffix.length)
      : inputUrl.substring(prefix.length);

    const targetWildcardIndex = toUrl.indexOf("**");
    const redirectUrl = targetWildcardIndex === -1
      ? toUrl
      : toUrl.substring(0, targetWildcardIndex) + wildcardContent + toUrl.substring(targetWildcardIndex + 2);

    return {matched: true, redirectUrl, wildcardContent};
  } catch (error) {
    return {matched: false, error: error.message};
  }
}
