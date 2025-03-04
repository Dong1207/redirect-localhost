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

        if (DEBUG) {
          console.log(
            `Processing rule ${index + 1}: ${rule.fromUrl} -> ${rule.toUrl}`
          );
        }

        // Parse the wildcard in the from URL
        const fromUrl = rule.fromUrl;
        const toUrl = rule.toUrl;
        const wildcardIndex = fromUrl.indexOf("**");

        // No wildcard, use exact URL matching
        if (wildcardIndex === -1) {
          // ...existing code for no wildcard...
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

        // If no wildcard in target URL, we can't perform a wildcard substitution
        if (targetWildcardIndex === -1) {
          if (DEBUG) {
            console.log(
              `Rule ${index + 1}: Target URL has no wildcard, using direct URL`
            );
          }

          // Since there's no wildcard in the target URL, we'll use a simpler approach
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

        // If both URLs have wildcards, we can use regex substitution
        const targetPrefix = toUrl.substring(0, targetWildcardIndex);
        const targetSuffix = toUrl.substring(targetWildcardIndex + 2);

        // Create a regex pattern with non-greedy matching to capture the wildcard part
        let regexPattern;
        if (suffix) {
          // If there's a suffix, we need to capture everything between prefix and suffix
          regexPattern = escapeRegExp(prefix) + "(.*?)" + escapeRegExp(suffix);
        } else {
          // If no suffix, capture everything after the prefix - use greedy matching
          regexPattern = escapeRegExp(prefix) + "(.*)";
        }

        // For the declarativeNetRequest API, the substitution uses $1, $2, etc. for captures
        const regexSubstitution = targetPrefix + "$1" + targetSuffix;

        if (DEBUG) {
          console.log(`Rule ${index + 1} detailed pattern:`, {
            fromUrl,
            toUrl,
            prefix,
            suffix,
            targetPrefix,
            targetSuffix,
            regexPattern,
            regexSubstitution,
          });

          try {
            // Test with a realistic value
            const testContent = "avada-joy.min.js?v=1741081694801";
            const testUrl = prefix + testContent + (suffix || "");
            const testRegex = new RegExp(regexPattern);
            const match = testRegex.exec(testUrl);

            if (match) {
              const captured = match[1];
              const expectedResult = targetPrefix + captured + targetSuffix;
              console.log(`Test redirect simulation:`, {
                originalUrl: testUrl,
                capturedContent: captured,
                expectedRedirectUrl: expectedResult,
              });
            } else {
              console.warn(
                `Test pattern didn't match: ${testUrl} with regex ${regexPattern}`
              );
            }
          } catch (e) {
            console.error("Error testing regex pattern:", e);
          }
        }

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

    if (DEBUG) {
      console.log("New rules to apply:", JSON.stringify(newRules, null, 2));
    }

    // Update the rules
    const currentRuleIds = await getCurrentRuleIds();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: currentRuleIds,
      addRules: newRules,
    });

    console.log("Rules successfully updated!");

    // Add a log to check all active rules
    checkActiveRules();
  } catch (error) {
    console.error("Error updating redirect rules:", error);
  }
}

// Function to check and log all active rules
async function checkActiveRules() {
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log("Current active rules:", rules);

    // Log detailed information about each rule
    for (const rule of rules) {
      console.log(`Rule ${rule.id} details:`, {
        condition: rule.condition,
        action: rule.action,
      });

      // If it's a regex rule, try to explain it
      if (rule.condition.regexFilter) {
        const regexFilter = rule.condition.regexFilter;
        console.log(`Rule ${rule.id} regex explanation:`, {
          regexFilter,
          meaning: "Matches URLs that follow this pattern",
        });
      }

      // If it's a regex substitution, explain how it works
      if (rule.action.redirect && rule.action.redirect.regexSubstitution) {
        const substitution = rule.action.redirect.regexSubstitution;
        console.log(`Rule ${rule.id} substitution explanation:`, {
          substitution,
          meaning:
            "Will redirect to this URL pattern, replacing $1, $2, etc. with captured content",
        });
      }
    }
  } catch (error) {
    console.error("Error checking active rules:", error);
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
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const requestUrl = info.request.url;
    const redirectUrl = info.redirect
      ? info.redirect.url
      : "Unknown destination";

    console.log("Rule matched:", info);
    console.log(`Redirect detected: ${requestUrl} -> ${redirectUrl}`);

    try {
      // Try to find the rule that matched and log detailed info
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      const matchedRule = rules.find((rule) => rule.id === info.rule.ruleId);

      if (matchedRule) {
        console.log("Matched rule details:", matchedRule);

        // For regex rules, test the matching manually to debug
        if (matchedRule.condition.regexFilter) {
          const regex = new RegExp(matchedRule.condition.regexFilter);
          const match = regex.exec(requestUrl);

          if (match) {
            const captures = match.slice(1);
            console.log("Regex test results:", {
              matches: true,
              captureGroups: captures,
            });

            // If using regexSubstitution, show what the result should be
            if (matchedRule.action.redirect.regexSubstitution) {
              const sub = matchedRule.action.redirect.regexSubstitution;
              let expected = sub;

              // Replace $1, $2, etc. with actual captured values
              captures.forEach((capture, i) => {
                expected = expected.replace(`$${i + 1}`, capture);
              });

              console.log("Expected redirect URL:", expected);

              // If redirect URL is unknown, there might be an issue
              if (redirectUrl === "Unknown destination") {
                console.warn("Redirect URL is unknown. Potential issues:");
                console.warn("1. The regex might not be matching as expected");
                console.warn("2. The substitution pattern might be incorrect");
                console.warn("3. There might be a syntax error in the rule");
              }
            }
          } else {
            console.warn(
              "Rule matched but regex test failed. This shouldn't happen!"
            );
          }
        }
      } else {
        console.warn(
          `Couldn't find matching rule with ID: ${info.rule.ruleId}`
        );
      }
    } catch (err) {
      console.error("Error analyzing rule match:", err);
    }

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
      const fromUrl = rule.fromUrl;
      const toUrl = rule.toUrl;
      const wildcardIndex = fromUrl.indexOf("**");

      // No wildcard in from URL
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
        console.log(`URL doesn't start with prefix: ${prefix}`);
        sendResponse({matched: false});
        return true;
      }

      // If there's a suffix, ensure the URL ends with it
      if (suffix && !inputUrl.endsWith(suffix)) {
        console.log(`URL doesn't end with suffix: ${suffix}`);
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

      console.log({
        prefix,
        suffix,
        wildcardContent,
        resultUrl,
      });

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
  } else if (message.action === "getActiveRules") {
    // Added functionality to inspect active rules
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
  return true;
});
