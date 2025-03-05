document.addEventListener("DOMContentLoaded", () => {
  const enableToggle = document.getElementById("enableToggle");
  const redirectCountElem = document.getElementById("redirectCount");
  const rulesContainer = document.getElementById("rulesContainer");
  const addRuleBtn = document.getElementById("addRuleBtn");
  const ruleTemplate = document.getElementById("ruleTemplate");

  let redirectRules = [];

  // Add new control buttons
  const debugBtn = document.getElementById("debugBtn");
  const diagBtn = document.getElementById("diagBtn");
  const debugPanel = document.getElementById("debugPanel");
  const debugToPageToggle = document.getElementById("debugToPageToggle");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const checkRulesBtn = document.getElementById("checkRulesBtn");
  const testCurrentPageBtn = document.getElementById("testCurrentPageBtn");
  const exportRulesBtn = document.getElementById("exportRulesBtn");
  const importRulesBtn = document.getElementById("importRulesBtn");
  const testUrlInput = document.getElementById("testUrlInput");
  const testUrlBtn = document.getElementById("testUrlBtn");
  const testUrlResult = document.getElementById("testUrlResult");

  // Initialize popup
  loadSettings();
  updateRedirectCount();
  setupTabs();
  loadRedirectHistory();

  // Add event listeners
  enableToggle.addEventListener("change", toggleRedirect);
  addRuleBtn.addEventListener("click", addNewRule);
  debugBtn.addEventListener("click", toggleDebugPanel);
  diagBtn.addEventListener("click", showDiagnosticDialog);

  // Debug panel event listeners
  clearHistoryBtn.addEventListener("click", clearRedirectHistory);
  checkRulesBtn.addEventListener("click", checkActiveRules);
  testCurrentPageBtn.addEventListener("click", testCurrentPageUrl);
  exportRulesBtn.addEventListener("click", exportRules);
  importRulesBtn.addEventListener("click", importRules);
  testUrlBtn.addEventListener("click", testUrl);

  // Set up debug toggle
  chrome.storage.local.get(["debugToPage"], (result) => {
    debugToPageToggle.checked = result.debugToPage === true;
  });

  debugToPageToggle.addEventListener("change", () => {
    const enabled = debugToPageToggle.checked;
    chrome.runtime.sendMessage(
      {
        action: "toggleDebugToPage",
        enabled: enabled,
      },
      (response) => {
        if (
          response &&
          response.debugEnabled !== undefined &&
          response.debugEnabled !== enabled
        ) {
          debugToPageToggle.checked = response.debugEnabled;
        }
      }
    );
    chrome.storage.local.set({debugToPage: enabled});
  });

  // Load settings from storage
  function loadSettings() {
    chrome.storage.local.get(["redirectRules", "enabled"], (result) => {
      // Set enabled state
      enableToggle.checked = result.enabled || false;

      // Load rules
      redirectRules = result.redirectRules || [];
      displayRules();
    });
  }

  // Toggle redirect functionality
  function toggleRedirect() {
    chrome.storage.local.set({enabled: enableToggle.checked});
  }

  // Get and display redirect count
  function updateRedirectCount() {
    chrome.storage.local.get(["redirectCount"], (result) => {
      redirectCountElem.textContent = result.redirectCount || 0;
    });

    // Get count from background service worker
    chrome.runtime.sendMessage({action: "getRedirectCount"}, (response) => {
      if (response && response.count !== undefined) {
        redirectCountElem.textContent = response.count;
      }
    });
  }

  // Display all rules in the UI
  function displayRules() {
    // Clear existing rules
    rulesContainer.innerHTML = "";

    // Add each rule to the UI
    redirectRules.forEach((rule, index) => {
      const ruleElement = createRuleElement(rule, index);
      rulesContainer.appendChild(ruleElement);
    });
  }

  // Test if a URL would be redirected by a rule
  function testRedirect(inputUrl, rule) {
    if (!rule.fromUrl || !rule.toUrl) return null;

    // Use the background script's matching logic for consistency
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "testUrlMatch",
          inputUrl: inputUrl,
          rule: rule,
        },
        (response) => {
          if (response && response.matched) {
            resolve(response.redirectUrl);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  // Create a rule element from template
  function createRuleElement(rule = {}, index) {
    const ruleClone = document.importNode(ruleTemplate.content, true);
    const ruleItem = ruleClone.querySelector(".rule-item");

    // Set rule values
    const fromUrlInput = ruleItem.querySelector(".from-url-input");
    const toUrlInput = ruleItem.querySelector(".to-url-input");

    fromUrlInput.value = rule.fromUrl || "";
    toUrlInput.value = rule.toUrl || "";

    // Handle disabled state if it exists in the rule
    if (rule.disabled === true) {
      ruleItem.dataset.disabled = "true";
    }

    // Update rule title
    updateRuleTitle(ruleItem, rule);

    // Set resource types checkboxes
    if (rule.resourceTypes && rule.resourceTypes.length > 0) {
      const checkboxes = ruleItem.querySelectorAll(".resource-types input");
      checkboxes.forEach((cb) => {
        cb.checked = rule.resourceTypes.includes(cb.value);
      });
    }

    // Add advanced options toggle
    const advancedBtn = ruleItem.querySelector(".advanced-btn");
    const advancedSections = ruleItem.querySelector(".advanced-sections");

    advancedBtn.addEventListener("click", () => {
      if (advancedSections.style.display === "none") {
        advancedSections.style.display = "block";
        advancedBtn.innerHTML =
          '<i class="fas fa-cog"></i> Hide Advanced Options';
      } else {
        advancedSections.style.display = "none";
        advancedBtn.innerHTML = '<i class="fas fa-cog"></i> Advanced Options';
      }
    });

    // Add event listeners to inputs for saving changes
    fromUrlInput.addEventListener("change", () => {
      updateRule(index);
      updateRuleTitle(ruleItem, redirectRules[index]);
      chrome.storage.local.get(["enabled"], (result) => {
        updateRuleStatus(
          ruleItem,
          redirectRules[index],
          result.enabled === true
        );
      });
    });

    toUrlInput.addEventListener("change", () => {
      updateRule(index);
      updateRuleTitle(ruleItem, redirectRules[index]);
      chrome.storage.local.get(["enabled"], (result) => {
        updateRuleStatus(
          ruleItem,
          redirectRules[index],
          result.enabled === true
        );
      });
    });

    const resourceCheckboxes = ruleItem.querySelectorAll(
      ".resource-types input"
    );
    resourceCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", () => updateRule(index));
    });

    // Add toggle active button functionality
    const toggleActiveBtn = ruleItem.querySelector(".toggle-active-btn");
    toggleActiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isCurrentlyDisabled = rule.disabled === true;
      rule.disabled = !isCurrentlyDisabled;
      ruleItem.dataset.disabled = (!isCurrentlyDisabled).toString();
      toggleActiveBtn.classList.toggle("inactive", !isCurrentlyDisabled);
      toggleActiveBtn.title = isCurrentlyDisabled
        ? "Disable Rule"
        : "Enable Rule";
      updateRule(index);
    });

    // Set initial button state
    if (rule.disabled) {
      toggleActiveBtn.classList.add("inactive");
      toggleActiveBtn.title = "Enable Rule";
    } else {
      toggleActiveBtn.classList.remove("inactive");
      toggleActiveBtn.title = "Disable Rule";
    }

    // Add delete button functionality
    ruleItem.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRule(index);
    });

    // Add toggle collapse functionality
    const ruleHeader = ruleItem.querySelector(".rule-header");
    ruleHeader.addEventListener("click", () => {
      ruleItem.classList.toggle("collapsed");
      const icon = ruleHeader.querySelector(".collapse-icon i");
      if (ruleItem.classList.contains("collapsed")) {
        icon.className = "fas fa-chevron-right";
      } else {
        icon.className = "fas fa-chevron-down";
      }
    });

    // Add test functionality
    const testBtn = ruleItem.querySelector(".test-btn");
    const testInput = ruleItem.querySelector(".test-input");
    const testResult = ruleItem.querySelector(".test-result");

    testBtn.addEventListener("click", async () => {
      const inputUrl = testInput.value.trim();
      if (!inputUrl) {
        testResult.textContent = "Please enter a URL to test";
        testResult.className = "test-result error";
        return;
      }

      const redirectedUrl = await testRedirect(inputUrl, rule);

      if (redirectedUrl) {
        testResult.innerHTML = `Will redirect to:<br><strong>${redirectedUrl}</strong>`;
        testResult.className = "test-result success";
      } else {
        testResult.innerHTML = `
          URL doesn't match this rule pattern<br>
          <small>Input: ${inputUrl}<br>Pattern: ${rule.fromUrl}</small>
        `;
        testResult.className = "test-result error";
      }
    });

    // Set data attribute for identifying the rule
    ruleItem.dataset.ruleIndex = index;

    // Set initial status
    chrome.storage.local.get(["enabled"], (result) => {
      updateRuleStatus(ruleItem, rule, result.enabled === true);
    });

    return ruleItem;
  }

  // Update rule title based on URLs
  function updateRuleTitle(ruleElement, rule) {
    const ruleTitle = ruleElement.querySelector(".rule-title");
    if (rule.fromUrl && rule.toUrl) {
      const fromDomain = extractDomain(rule.fromUrl);
      const toDomain = extractDomain(rule.toUrl);
      ruleTitle.textContent = `${fromDomain} => ${toDomain}`;
    } else {
      ruleTitle.textContent = "New Rule";
    }
  }

  // Helper to extract domain from URL
  function extractDomain(url) {
    try {
      if (!url.includes("://")) url = "https://" + url;
      const domain = new URL(url).hostname;
      return domain || url;
    } catch (e) {
      return url;
    }
  }

  // Add a new rule
  function addNewRule() {
    const newRule = {
      fromUrl: "",
      toUrl: "",
      resourceTypes: [
        "main_frame",
        "stylesheet",
        "script",
        "image",
        "xmlhttprequest",
        "other",
      ],
    };

    redirectRules.push(newRule);
    saveRules();

    // Add the new rule to UI
    const ruleElement = createRuleElement(newRule, redirectRules.length - 1);
    rulesContainer.appendChild(ruleElement);
  }

  // Update a rule based on UI changes
  function updateRule(index) {
    const ruleElement = document.querySelector(
      `.rule-item[data-rule-index="${index}"]`
    );
    if (!ruleElement) return;

    const fromUrl = ruleElement.querySelector(".from-url-input").value;
    const toUrl = ruleElement.querySelector(".to-url-input").value;
    const isDisabled = ruleElement.dataset.disabled === "true";

    // Get selected resource types
    const resourceCheckboxes = ruleElement.querySelectorAll(
      ".resource-types input:checked"
    );
    const resourceTypes = Array.from(resourceCheckboxes).map((cb) => cb.value);

    // Update the rule object
    redirectRules[index] = {
      fromUrl,
      toUrl,
      resourceTypes,
      disabled: isDisabled,
    };

    saveRules();
  }

  // Delete a rule
  function deleteRule(index) {
    redirectRules.splice(index, 1);
    saveRules();
    displayRules(); // Refresh all rules to update indices
  }

  // Save rules to storage
  function saveRules() {
    chrome.storage.local.set({redirectRules});
  }

  // Update rule status indicator
  function updateRuleStatus(ruleElement, rule, isEnabled) {
    const statusIndicator = ruleElement.querySelector(".rule-status");

    // Check if the rule is disabled specifically
    const isRuleActive =
      !rule.disabled && isEnabled && rule.fromUrl && rule.toUrl;

    if (isRuleActive) {
      statusIndicator.classList.add("active");
      statusIndicator.classList.remove("inactive");
      statusIndicator.title = "Rule is active";
    } else {
      statusIndicator.classList.add("inactive");
      statusIndicator.classList.remove("active");

      if (rule.disabled) {
        statusIndicator.title = "Rule is disabled";
      } else if (!isEnabled) {
        statusIndicator.title = "Extension is disabled";
      } else {
        statusIndicator.title = "Rule is incomplete (missing URL)";
      }
    }
  }

  // Update all rule status indicators
  function updateAllRuleStatuses() {
    chrome.storage.local.get(["enabled"], (result) => {
      const isEnabled = result.enabled === true;

      const ruleElements = document.querySelectorAll(".rule-item");
      ruleElements.forEach((ruleElement) => {
        const ruleIndex = ruleElement.dataset.ruleIndex;
        if (ruleIndex !== undefined && redirectRules[ruleIndex]) {
          updateRuleStatus(ruleElement, redirectRules[ruleIndex], isEnabled);
        }
      });
    });
  }

  // Override the display rules function to update statuses
  const originalDisplayRules = displayRules;
  displayRules = function () {
    originalDisplayRules();
    updateAllRuleStatuses();
  };

  // Override the toggle redirect function to update statuses
  const originalToggleRedirect = toggleRedirect;
  toggleRedirect = function () {
    originalToggleRedirect();
    updateAllRuleStatuses();
  };

  // Functions for debug panel
  function toggleDebugPanel() {
    if (debugPanel.style.display === "none") {
      debugPanel.style.display = "block";
      debugBtn.style.backgroundColor = "#2196F3";
      debugBtn.style.color = "white";
      loadRedirectHistory(); // Refresh history
    } else {
      debugPanel.style.display = "none";
      debugBtn.style.backgroundColor = "";
      debugBtn.style.color = "";
    }
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".tab");
    const tabContents = document.querySelectorAll(".tab-content");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // Remove active class from all tabs and contents
        tabs.forEach((t) => t.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));

        // Add active class to selected tab and content
        tab.classList.add("active");
        const tabContentId = tab.getAttribute("data-tab") + "Tab";
        document.getElementById(tabContentId).classList.add("active");
      });
    });
  }

  function loadRedirectHistory() {
    chrome.runtime.sendMessage({action: "getRedirectHistory"}, (response) => {
      const historyContainer = document.getElementById("redirectHistory");
      if (!historyContainer) return;

      if (!response || !response.history || response.history.length === 0) {
        historyContainer.innerHTML =
          '<div class="history-empty">No redirects recorded yet.</div>';
        return;
      }

      // Display history items
      let html = "";
      response.history.forEach((item) => {
        const date = new Date(item.timestamp);
        const timeString = date.toLocaleTimeString();
        html += `
          <div class="history-item">
            <div class="history-time">${timeString}</div>
            <div class="history-from">${truncateUrl(item.fromUrl, 60)}</div>
            <div class="history-to">${truncateUrl(item.toUrl, 60)}</div>
          </div>
        `;
      });

      historyContainer.innerHTML = html;
    });
  }

  function truncateUrl(url, maxLength) {
    if (!url) return "Unknown URL";
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + "...";
  }

  function clearRedirectHistory() {
    chrome.runtime.sendMessage({action: "clearRedirectHistory"}, () => {
      loadRedirectHistory(); // Refresh the display
    });
  }

  function showDiagnosticDialog() {
    chrome.runtime.sendMessage({action: "getActiveRules"}, (response) => {
      if (response.error) {
        alert(`Error: ${response.error}`);
        return;
      }

      const rules = response.rules || [];
      let report = `Active Rules: ${rules.length}\n\n`;

      rules.forEach((rule) => {
        report += `--- Rule ${rule.id} ---\n`;

        if (rule.condition.regexFilter) {
          report += `Pattern: ${rule.condition.regexFilter}\n`;
        } else if (rule.condition.urlFilter) {
          report += `URL Filter: ${rule.condition.urlFilter}\n`;
        }

        if (rule.action.redirect.regexSubstitution) {
          report += `Redirect: ${rule.action.redirect.regexSubstitution}\n`;
        } else if (rule.action.redirect.url) {
          report += `Redirect: ${rule.action.redirect.url}\n`;
        }

        report += `Resources: ${rule.condition.resourceTypes.join(", ")}\n\n`;
      });

      alert(report);
    });
  }

  function checkActiveRules() {
    chrome.runtime.sendMessage({action: "getActiveRules"}, (response) => {
      if (response.error) {
        testUrlResult.innerHTML = `<div class="test-result error">${response.error}</div>`;
        testUrlResult.style.display = "block";
        return;
      }

      const rules = response.rules || [];
      let html = `<div class="test-result"><strong>${rules.length} Active Rules</strong><br>`;

      if (rules.length === 0) {
        html += "No active rules found. Add rules and enable the extension.";
      } else {
        rules.forEach((rule) => {
          let pattern =
            rule.condition.regexFilter ||
            rule.condition.urlFilter ||
            "Unknown pattern";
          let redirect =
            rule.action.redirect.regexSubstitution ||
            rule.action.redirect.url ||
            "Unknown destination";

          html += `<div style="margin-top:8px; padding:5px; background:#f1f1f1; border-radius:3px;">
            <strong>Rule ${rule.id}</strong><br>
            Pattern: ${pattern}<br>
            Redirect: ${redirect}
          </div>`;
        });
      }

      html += "</div>";

      // Show in the test tab
      document.querySelector('.tab[data-tab="test"]').click();
      testUrlResult.innerHTML = html;
      testUrlResult.style.display = "block";
    });
  }

  function testCurrentPageUrl() {
    // Get current active tab URL
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]?.url) {
        testUrlInput.value = tabs[0].url;
        testUrl();
      } else {
        testUrlResult.innerHTML =
          '<div class="test-result error">Could not get current tab URL</div>';
        testUrlResult.style.display = "block";
      }
    });
  }

  function exportRules() {
    const rulesJson = JSON.stringify(redirectRules, null, 2);
    const blob = new Blob([rulesJson], {type: "application/json"});
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.download = "redirect-rules.json";
    a.href = url;
    a.click();

    // Show success message
    const toolsTab = document.getElementById("toolsTab");
    const successMsg = document.createElement("div");
    successMsg.className = "import-export-status success";
    successMsg.textContent = "Rules exported successfully!";
    toolsTab.appendChild(successMsg);

    // Remove the message after a delay
    setTimeout(() => {
      if (toolsTab.contains(successMsg)) {
        toolsTab.removeChild(successMsg);
      }
    }, 3000);

    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function importRules() {
    // Create a hidden file input element
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    // Trigger the file selection dialog
    fileInput.click();

    // Handle file selection
    fileInput.addEventListener("change", function () {
      const file = fileInput.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const importedRules = JSON.parse(e.target.result);

          // Validate imported rules
          if (!Array.isArray(importedRules)) {
            showImportStatus(
              "Invalid file format. Expected an array of rules.",
              false
            );
            document.body.removeChild(fileInput);
            return;
          }

          // Process and validate each rule
          const validRules = importedRules.filter((rule) => {
            return (
              rule &&
              typeof rule === "object" &&
              typeof rule.fromUrl === "string" &&
              typeof rule.toUrl === "string" &&
              (!rule.resourceTypes || Array.isArray(rule.resourceTypes))
            );
          });

          if (validRules.length === 0) {
            showImportStatus("No valid rules found in the file.", false);
            document.body.removeChild(fileInput);
            return;
          }

          // Always append new rules to existing ones (no option to replace)
          redirectRules = redirectRules.concat(validRules);

          // Save and update UI
          saveRules();
          displayRules();
          showImportStatus(
            `Successfully imported ${validRules.length} rules!`,
            true
          );
        } catch (error) {
          console.error("Error parsing imported rules:", error);
          showImportStatus(`Error importing rules: ${error.message}`, false);
        } finally {
          document.body.removeChild(fileInput);
        }
      };

      reader.onerror = function () {
        showImportStatus("Error reading file", false);
        document.body.removeChild(fileInput);
      };

      reader.readAsText(file);
    });

    // Handle cancel
    window.addEventListener("focus", function focusHandler() {
      setTimeout(() => {
        if (document.body.contains(fileInput) && !fileInput.files.length) {
          document.body.removeChild(fileInput);
        }
        window.removeEventListener("focus", focusHandler);
      }, 300);
    });
  }

  function showImportStatus(message, isSuccess) {
    const toolsTab = document.getElementById("toolsTab");
    const statusElement = document.createElement("div");
    statusElement.className = `import-export-status ${
      isSuccess ? "success" : "error"
    }`;
    statusElement.textContent = message;
    toolsTab.appendChild(statusElement);

    // Remove the message after a delay
    setTimeout(() => {
      if (toolsTab.contains(statusElement)) {
        toolsTab.removeChild(statusElement);
      }
    }, 5000);
  }

  function testUrl() {
    const url = testUrlInput.value.trim();
    if (!url) {
      testUrlResult.innerHTML =
        '<div class="test-result error">Please enter a URL to test</div>';
      testUrlResult.style.display = "block";
      return;
    }

    // Find matching rules
    chrome.storage.local.get(["redirectRules", "enabled"], (result) => {
      const rules = result.redirectRules || [];
      const isEnabled = result.enabled === true;

      if (!isEnabled) {
        testUrlResult.innerHTML =
          '<div class="test-result error">Extension is disabled. Enable it to use redirects.</div>';
        testUrlResult.style.display = "block";
        return;
      }

      if (rules.length === 0) {
        testUrlResult.innerHTML =
          '<div class="test-result error">No redirect rules defined.</div>';
        testUrlResult.style.display = "block";
        return;
      }

      // Test each rule
      let matchFound = false;
      let html = '<div class="test-result">';

      // Create promises for each rule test
      const testPromises = rules.map((rule) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              action: "testUrlMatch",
              inputUrl: url,
              rule: rule,
            },
            (response) => {
              if (response && response.matched) {
                matchFound = true;
                resolve({
                  matched: true,
                  rule,
                  redirectUrl: response.redirectUrl,
                  wildcardContent: response.wildcardContent,
                });
              } else {
                resolve({matched: false, rule});
              }
            }
          );
        });
      });

      // Wait for all tests to complete
      Promise.all(testPromises).then((results) => {
        results.forEach((result) => {
          if (result.matched) {
            html += `
              <div style="margin-bottom:10px; padding:8px; background:#d4edda; border-radius:4px; color:#155724;">
                <strong>✓ Match found!</strong><br>
                Rule: ${result.rule.fromUrl} → ${result.rule.toUrl}<br>
                Redirect to: ${result.redirectUrl}
                ${
                  result.wildcardContent
                    ? `<br>Wildcard content: ${result.wildcardContent}`
                    : ""
                }
              </div>
            `;
          }
        });

        if (!matchFound) {
          html +=
            '<div style="color:#721c24">No matching rules found for this URL.</div>';
        }

        html += "</div>";
        testUrlResult.innerHTML = html;
        testUrlResult.style.display = "block";
      });
    });
  }
});
