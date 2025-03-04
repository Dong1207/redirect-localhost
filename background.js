let redirectCount = 0;
const DEBUG = true;

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

    if (DEBUG) {
      console.log("Updating redirect rules:", {enabled, redirectRules});
    }

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

        const resourceTypes =
          rule.resourceTypes && rule.resourceTypes.length > 0
            ? rule.resourceTypes
            : [
                "main_frame",
                "sub_frame",
                "stylesheet",
                "script",
                "image",
                "font",
                "object",
                "xmlhttprequest",
                "ping",
                "csp_report",
                "media",
                "websocket",
                "other",
              ];

        // Convert the rule with wildcards to a regex pattern
        let urlFilter = rule.fromUrl;

        if (DEBUG) {
          console.log(
            `Processing rule ${index + 1}: ${rule.fromUrl} -> ${rule.toUrl}`
          );
        }

        // Replace ** with a special marker that won't be escaped
        urlFilter = urlFilter.replace(/\*\*/g, "DOUBLE_WILDCARD");

        // Escape special regex characters
        urlFilter = escapeRegExp(urlFilter);

        // Replace the marker back with a proper wildcard pattern
        urlFilter = urlFilter.replace(/DOUBLE_WILDCARD/g, ".*");

        // Create the regexSubstitution pattern for the destination URL
        let toUrl = rule.toUrl;

        // Count wildcards in fromUrl
        const wildcardCount = (rule.fromUrl.match(/\*\*/g) || []).length;

        // Add detailed logging about wildcards
        if (DEBUG) {
          console.log(
            `Rule ${index + 1} has ${wildcardCount} wildcards in fromUrl: ${
              rule.fromUrl
            }`
          );
        }

        // Replace wildcards in toUrl with capture groups
        for (let i = 1; i <= wildcardCount; i++) {
          const beforeReplace = toUrl;
          toUrl = toUrl.replace(/\*\*/, `$${i}`);

          if (DEBUG && beforeReplace !== toUrl) {
            console.log(
              `Replaced wildcard in toUrl: "${beforeReplace}" -> "${toUrl}"`
            );
          }
        }

        if (DEBUG) {
          console.log(`Rule ${index + 1} regex:`, {
            regexFilter: urlFilter,
            regexSubstitution: toUrl,
          });
        }

        return {
          id: index + 1, // Rule IDs start from 1
          priority: 1,
          action: {
            type: "redirect",
            redirect: {
              regexSubstitution: toUrl,
            },
          },
          condition: {
            regexFilter: urlFilter,
            resourceTypes: resourceTypes,
          },
        };
      })
      .filter(Boolean); // Remove any null entries

    if (DEBUG) {
      console.log("New rules to apply:", newRules);
    }

    // Update the rules
    const currentRuleIds = await getCurrentRuleIds();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: currentRuleIds,
      addRules: newRules,
    });

    console.log("Rules successfully updated!");
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

// Handle redirect counts using a different approach
chrome.webRequest?.onBeforeRedirect?.addListener(
  () => {
    redirectCount++;
    chrome.storage.local.set({redirectCount});
  },
  {urls: ["<all_urls>"]}
);

// Enhanced logging for rule matching
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    console.log("Rule matched:", info);
    console.log(
      `Redirect detected: ${info.request.url} -> ${
        info.redirect?.url || "Unknown destination"
      }`
    );

    // Try to find the rule that matched
    chrome.declarativeNetRequest
      .getDynamicRules()
      .then((rules) => {
        const matchedRule = rules.find((rule) => rule.id === info.rule.ruleId);
        if (matchedRule) {
          console.log("Matched rule details:", matchedRule);
        }
      })
      .catch((err) => console.error("Error fetching rule details:", err));

    redirectCount++;
    chrome.storage.local.set({redirectCount});
  });
}

// Provide an interface for popup.js to get current redirect count
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getRedirectCount") {
    sendResponse({count: redirectCount});
  } else if (message.action === "testUrlMatch") {
    const {inputUrl, rule} = message;
    try {
      // Create same pattern used in declarativeNetRequest rules
      let urlFilterPattern = rule.fromUrl;
      urlFilterPattern = urlFilterPattern.replace(/\*\*/g, "DOUBLE_WILDCARD");
      urlFilterPattern = escapeRegExp(urlFilterPattern);
      urlFilterPattern = urlFilterPattern.replace(/DOUBLE_WILDCARD/g, "(.*)");

      const regex = new RegExp(urlFilterPattern);
      console.log(
        `Testing URL: ${inputUrl} against pattern: ${urlFilterPattern}`
      );

      const match = inputUrl.match(regex);

      if (!match) {
        console.log("No match found");
        sendResponse({matched: false});
        return true;
      }

      // Extract captured groups
      const captures = match.slice(1);
      console.log("Captured groups:", captures);

      // Create destination URL
      let toUrl = rule.toUrl;
      captures.forEach((capture, i) => {
        toUrl = toUrl.replace(/\*\*/, capture);
      });

      console.log("Redirected URL would be:", toUrl);
      sendResponse({matched: true, redirectUrl: toUrl, captures: captures});
    } catch (error) {
      console.error("Error testing URL match:", error);
      sendResponse({matched: false, error: error.message});
    }
    return true;
  }
  return true;
});
