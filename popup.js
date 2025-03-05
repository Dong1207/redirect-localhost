document.addEventListener("DOMContentLoaded", () => {
  // Cache DOM elements for better performance
  const elements = {
    enableToggle: document.getElementById("enableToggle"),
    redirectCountElem: document.getElementById("redirectCount"),
    rulesContainer: document.getElementById("rulesContainer"),
    addRuleBtn: document.getElementById("addRuleBtn"),
    ruleTemplate: document.getElementById("ruleTemplate"),
    debugBtn: document.getElementById("debugBtn"),
    diagBtn: document.getElementById("diagBtn"),
    debugPanel: document.getElementById("debugPanel"),
    debugToPageToggle: document.getElementById("debugToPageToggle"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    checkRulesBtn: document.getElementById("checkRulesBtn"),
    testCurrentPageBtn: document.getElementById("testCurrentPageBtn"),
    exportRulesBtn: document.getElementById("exportRulesBtn"),
    importRulesBtn: document.getElementById("importRulesBtn"),
    testUrlInput: document.getElementById("testUrlInput"),
    testUrlBtn: document.getElementById("testUrlBtn"),
    testUrlResult: document.getElementById("testUrlResult"),
    tabs: document.querySelectorAll(".tab"),
    tabContents: document.querySelectorAll(".tab-content"),
    redirectHistory: document.getElementById("redirectHistory"),
    toolsTab: document.getElementById("toolsTab"),
  };

  let redirectRules = [];

  // Initialize UI and event listeners
  initApp();

  function initApp() {
    // Initialize popup state
    loadSettings();
    updateRedirectCount();
    setupTabs();
    loadRedirectHistory();

    // Add event listeners to UI elements
    setupEventListeners();
  }

  function setupEventListeners() {
    // Main controls
    elements.enableToggle.addEventListener("change", toggleRedirect);
    elements.addRuleBtn.addEventListener("click", addNewRule);
    elements.debugBtn.addEventListener("click", toggleDebugPanel);
    elements.diagBtn.addEventListener("click", showDiagnosticDialog);

    // Debug panel event listeners
    elements.clearHistoryBtn.addEventListener("click", clearRedirectHistory);
    elements.checkRulesBtn.addEventListener("click", checkActiveRules);
    elements.testCurrentPageBtn.addEventListener("click", testCurrentPageUrl);
    elements.exportRulesBtn.addEventListener("click", exportRules);
    elements.importRulesBtn.addEventListener("click", importRules);
    elements.testUrlBtn.addEventListener("click", testUrl);

    // Debug toggle setup
    chrome.storage.local.get(["debugToPage"], (result) => {
      elements.debugToPageToggle.checked = result.debugToPage === true;
    });

    elements.debugToPageToggle.addEventListener("change", () => {
      const enabled = elements.debugToPageToggle.checked;
      chrome.runtime.sendMessage(
        {action: "toggleDebugToPage", enabled},
        (response) => {
          if (
            response?.debugEnabled !== undefined &&
            response.debugEnabled !== enabled
          ) {
            elements.debugToPageToggle.checked = response.debugEnabled;
          }
        }
      );
      chrome.storage.local.set({debugToPage: enabled});
    });
  }

  // Storage and settings functions
  function loadSettings() {
    chrome.storage.local.get(["redirectRules", "enabled"], (result) => {
      elements.enableToggle.checked = result.enabled || false;
      redirectRules = result.redirectRules || [];
      displayRules();
    });
  }

  function saveRules() {
    chrome.storage.local.set({redirectRules});
  }

  function toggleRedirect() {
    chrome.storage.local.set({enabled: elements.enableToggle.checked});
    updateAllRuleStatuses();
  }

  // UI update functions
  function displayRules() {
    elements.rulesContainer.innerHTML = "";
    redirectRules.forEach((rule, index) => {
      elements.rulesContainer.appendChild(createRuleElement(rule, index));
    });
    updateAllRuleStatuses();
  }

  function updateRedirectCount() {
    chrome.storage.local.get(["redirectCount"], (result) => {
      elements.redirectCountElem.textContent = result.redirectCount || 0;
    });

    chrome.runtime.sendMessage({action: "getRedirectCount"}, (response) => {
      if (response?.count !== undefined) {
        elements.redirectCountElem.textContent = response.count;
      }
    });
  }

  // Tab management
  function setupTabs() {
    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // Remove active class from all tabs and contents
        elements.tabs.forEach((t) => t.classList.remove("active"));
        elements.tabContents.forEach((c) => c.classList.remove("active"));

        // Add active class to selected tab and content
        tab.classList.add("active");
        const tabContentId = tab.getAttribute("data-tab") + "Tab";
        document.getElementById(tabContentId).classList.add("active");
      });
    });
  }

  // Rule management functions
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

    elements.rulesContainer.appendChild(
      createRuleElement(newRule, redirectRules.length - 1)
    );
  }

  function updateRule(index) {
    const ruleElement = document.querySelector(
      `.rule-item[data-rule-index="${index}"]`
    );
    if (!ruleElement) return;

    const fromUrl = ruleElement.querySelector(".from-url-input").value;
    const toUrl = ruleElement.querySelector(".to-url-input").value;

    // Get the disabled state from the rule object, not from the DOM
    const isDisabled = redirectRules[index]?.disabled === true;

    const resourceCheckboxes = ruleElement.querySelectorAll(
      ".resource-types input:checked"
    );
    const resourceTypes = Array.from(resourceCheckboxes).map((cb) => cb.value);

    redirectRules[index] = {
      fromUrl,
      toUrl,
      resourceTypes,
      disabled: isDisabled,
    };
    saveRules();
  }

  function deleteRule(index) {
    redirectRules.splice(index, 1);
    saveRules();
    displayRules();
  }

  // Helper functions
  function extractDomain(url) {
    try {
      if (!url.includes("://")) url = "https://" + url;
      return new URL(url).hostname || url;
    } catch {
      return url;
    }
  }

  function testRedirect(inputUrl, rule) {
    if (!rule.fromUrl || !rule.toUrl) return Promise.resolve(null);

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {action: "testUrlMatch", inputUrl, rule},
        (response) => {
          resolve(response?.matched ? response.redirectUrl : null);
        }
      );
    });
  }

  function truncateUrl(url, maxLength) {
    if (!url) return "Unknown URL";
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + "...";
  }

  // Status indicator updates
  function updateRuleStatus(ruleElement, rule, isEnabled) {
    const statusIndicator = ruleElement.querySelector(".rule-status");
    const toggleActiveBtn = ruleElement.querySelector(".toggle-active-btn");

    // Check if the rule is disabled specifically
    const isRuleActive =
      !rule.disabled && isEnabled && rule.fromUrl && rule.toUrl;

    // Update only the status indicator
    statusIndicator.classList.toggle("active", isRuleActive);
    statusIndicator.classList.toggle("inactive", !isRuleActive);

    // Set appropriate titles
    if (isRuleActive) {
      statusIndicator.title = "Rule is active";
      toggleActiveBtn.title = "Disable Rule";
    } else if (rule.disabled) {
      statusIndicator.title = "Rule is manually disabled";
      toggleActiveBtn.title = "Enable Rule";
    } else if (!isEnabled) {
      statusIndicator.title = "Extension is disabled";
      toggleActiveBtn.title = rule.disabled ? "Enable Rule" : "Disable Rule";
    } else {
      statusIndicator.title = "Rule is incomplete (missing URL)";
      toggleActiveBtn.title = rule.disabled ? "Enable Rule" : "Disable Rule";
    }

    // Only update the toggle button appearance, not the entire rule
    toggleActiveBtn.classList.toggle("inactive", rule.disabled);
  }

  function updateAllRuleStatuses() {
    chrome.storage.local.get(["enabled"], (result) => {
      const isEnabled = result.enabled === true;
      document.querySelectorAll(".rule-item").forEach((ruleElement) => {
        const ruleIndex = ruleElement.dataset.ruleIndex;
        if (ruleIndex !== undefined && redirectRules[ruleIndex]) {
          updateRuleStatus(ruleElement, redirectRules[ruleIndex], isEnabled);
        }
      });
    });
  }

  // UI element creation
  function createRuleElement(rule = {}, index) {
    const {
      element,
      fromUrlInput,
      toUrlInput,
      advancedBtn,
      advancedSections,
      toggleActiveBtn,
    } = initializeRuleElement(rule, index);

    attachRuleEventListeners(element, rule, index, {
      fromUrlInput,
      toUrlInput,
      advancedBtn,
      advancedSections,
      toggleActiveBtn,
    });

    return element;
  }

  function initializeRuleElement(rule, index) {
    const ruleClone = document.importNode(elements.ruleTemplate.content, true);
    const element = ruleClone.querySelector(".rule-item");

    const fromUrlInput = element.querySelector(".from-url-input");
    const toUrlInput = element.querySelector(".to-url-input");
    const advancedBtn = element.querySelector(".advanced-btn");
    const advancedSections = element.querySelector(".advanced-sections");
    const toggleActiveBtn = element.querySelector(".toggle-active-btn");

    // Set initial values
    fromUrlInput.value = rule.fromUrl || "";
    toUrlInput.value = rule.toUrl || "";
    element.dataset.ruleIndex = index;

    // Update toggle button state but don't set disabled attribute on the rule element
    if (rule.disabled) {
      toggleActiveBtn.classList.add("inactive");
      toggleActiveBtn.title = "Enable Rule";
    } else {
      toggleActiveBtn.title = "Disable Rule";
    }

    // Update rule title
    const ruleTitle = element.querySelector(".rule-title");
    if (rule.fromUrl && rule.toUrl) {
      const fromDomain = extractDomain(rule.fromUrl);
      const toDomain = extractDomain(rule.toUrl);
      ruleTitle.textContent = `${fromDomain} => ${toDomain}`;
    } else {
      ruleTitle.textContent = "New Rule";
    }

    // Set resource types checkboxes
    if (rule.resourceTypes && rule.resourceTypes.length > 0) {
      element.querySelectorAll(".resource-types input").forEach((cb) => {
        cb.checked = rule.resourceTypes.includes(cb.value);
      });
    }

    return {
      element,
      fromUrlInput,
      toUrlInput,
      advancedBtn,
      advancedSections,
      toggleActiveBtn,
    };
  }

  function attachRuleEventListeners(
    element,
    rule,
    index,
    {fromUrlInput, toUrlInput, advancedBtn, advancedSections, toggleActiveBtn}
  ) {
    // Advanced options toggle
    advancedBtn.addEventListener("click", () => {
      const isHidden = advancedSections.style.display === "none";
      advancedSections.style.display = isHidden ? "block" : "none";
      advancedBtn.innerHTML = isHidden
        ? '<i class="fas fa-cog"></i> Hide Advanced Options'
        : '<i class="fas fa-cog"></i> Advanced Options';
    });

    // Input change handlers
    const updateHandler = () => {
      updateRule(index);
      updateRuleTitle(element, redirectRules[index]);
      chrome.storage.local.get(["enabled"], (result) => {
        updateRuleStatus(
          element,
          redirectRules[index],
          result.enabled === true
        );
      });
    };

    fromUrlInput.addEventListener("change", updateHandler);
    toUrlInput.addEventListener("change", updateHandler);

    element.querySelectorAll(".resource-types input").forEach((checkbox) => {
      checkbox.addEventListener("change", () => updateRule(index));
    });

    // Toggle active button
    toggleActiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isCurrentlyDisabled = rule.disabled === true;
      rule.disabled = !isCurrentlyDisabled;

      // Don't set the disabled attribute on the rule element
      // element.dataset.disabled = (!isCurrentlyDisabled).toString();

      // Update status indicator immediately when toggle button is clicked
      chrome.storage.local.get(["enabled"], (result) => {
        updateRuleStatus(element, rule, result.enabled === true);
      });

      updateRule(index);
    });

    // Delete button
    element.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRule(index);
    });

    // Collapse functionality
    const ruleHeader = element.querySelector(".rule-header");
    ruleHeader.addEventListener("click", () => {
      element.classList.toggle("collapsed");
      const icon = ruleHeader.querySelector(".collapse-icon i");
      icon.className = element.classList.contains("collapsed")
        ? "fas fa-chevron-right"
        : "fas fa-chevron-down";
    });

    // Test functionality
    setupTestFunctionality(element, rule);

    // Set initial status for both indicator and toggle button
    chrome.storage.local.get(["enabled"], (result) => {
      updateRuleStatus(element, rule, result.enabled === true);
    });
  }

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

  function setupTestFunctionality(element, rule) {
    const testBtn = element.querySelector(".test-btn");
    const testInput = element.querySelector(".test-input");
    const testResult = element.querySelector(".test-result");

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
  }

  // Debug panel functions
  function toggleDebugPanel() {
    const isHidden = elements.debugPanel.style.display === "none";
    elements.debugPanel.style.display = isHidden ? "block" : "none";

    if (isHidden) {
      elements.debugBtn.style.backgroundColor = "#2196F3";
      elements.debugBtn.style.color = "white";
      loadRedirectHistory();
    } else {
      elements.debugBtn.style.backgroundColor = "";
      elements.debugBtn.style.color = "";
    }
  }

  function loadRedirectHistory() {
    chrome.runtime.sendMessage({action: "getRedirectHistory"}, (response) => {
      if (!elements.redirectHistory) return;

      if (!response?.history?.length) {
        elements.redirectHistory.innerHTML =
          '<div class="history-empty">No redirects recorded yet.</div>';
        return;
      }

      // Build history HTML using DocumentFragment for better performance
      const fragment = document.createDocumentFragment();
      response.history.forEach((item) => {
        const historyItem = document.createElement("div");
        historyItem.className = "history-item";

        const timeDiv = document.createElement("div");
        timeDiv.className = "history-time";
        timeDiv.textContent = new Date(item.timestamp).toLocaleTimeString();

        const fromDiv = document.createElement("div");
        fromDiv.className = "history-from";
        fromDiv.textContent = truncateUrl(item.fromUrl, 60);

        const toDiv = document.createElement("div");
        toDiv.className = "history-to";
        toDiv.textContent = truncateUrl(item.toUrl, 60);

        historyItem.appendChild(timeDiv);
        historyItem.appendChild(fromDiv);
        historyItem.appendChild(toDiv);
        fragment.appendChild(historyItem);
      });

      elements.redirectHistory.innerHTML = "";
      elements.redirectHistory.appendChild(fragment);
    });
  }

  function clearRedirectHistory() {
    chrome.runtime.sendMessage({action: "clearRedirectHistory"}, () => {
      loadRedirectHistory();
    });
  }

  // Rule import/export functions
  function exportRules() {
    const rulesJson = JSON.stringify(redirectRules, null, 2);
    const blob = new Blob([rulesJson], {type: "application/json"});
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.download = "redirect-rules.json";
    link.href = url;
    link.click();

    showImportExportStatus("Rules exported successfully!", true);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function importRules() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    fileInput.click();
    setupFileInputListeners(fileInput);
  }

  function setupFileInputListeners(fileInput) {
    fileInput.addEventListener("change", function () {
      const file = fileInput.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        return;
      }

      const reader = new FileReader();

      reader.onload = function (e) {
        try {
          processImportedRules(e.target.result);
        } catch (error) {
          console.error("Error parsing imported rules:", error);
          showImportExportStatus(
            `Error importing rules: ${error.message}`,
            false
          );
        } finally {
          document.body.removeChild(fileInput);
        }
      };

      reader.onerror = function () {
        showImportExportStatus("Error reading file", false);
        document.body.removeChild(fileInput);
      };

      reader.readAsText(file);
    });

    window.addEventListener("focus", function focusHandler() {
      setTimeout(() => {
        if (document.body.contains(fileInput) && !fileInput.files.length) {
          document.body.removeChild(fileInput);
        }
        window.removeEventListener("focus", focusHandler);
      }, 300);
    });
  }

  function processImportedRules(jsonData) {
    const importedRules = JSON.parse(jsonData);

    if (!Array.isArray(importedRules)) {
      showImportExportStatus(
        "Invalid file format. Expected an array of rules.",
        false
      );
      return;
    }

    const validRules = importedRules.filter(
      (rule) =>
        rule &&
        typeof rule === "object" &&
        typeof rule.fromUrl === "string" &&
        typeof rule.toUrl === "string" &&
        (!rule.resourceTypes || Array.isArray(rule.resourceTypes))
    );

    if (validRules.length === 0) {
      showImportExportStatus("No valid rules found in the file.", false);
      return;
    }

    redirectRules = redirectRules.concat(validRules);
    saveRules();
    displayRules();
    showImportExportStatus(
      `Successfully imported ${validRules.length} rules!`,
      true
    );
  }

  function showImportExportStatus(message, isSuccess) {
    const statusElement = document.createElement("div");
    statusElement.className = `import-export-status ${
      isSuccess ? "success" : "error"
    }`;
    statusElement.textContent = message;
    elements.toolsTab.appendChild(statusElement);

    setTimeout(() => {
      if (elements.toolsTab.contains(statusElement)) {
        elements.toolsTab.removeChild(statusElement);
      }
    }, 5000);
  }

  // Remaining functions (showDiagnosticDialog, checkActiveRules, testCurrentPageUrl, testUrl)
  // kept as is but would follow the same pattern of optimization if needed

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

      // Create a more stylish alert dialog
      const dialogContainer = document.createElement("div");
      dialogContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      `;

      const dialog = document.createElement("div");
      dialog.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 20px;
        max-width: 80%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      `;

      const heading = document.createElement("h3");
      heading.textContent = "Active Redirect Rules";
      heading.style.marginTop = "0";

      const content = document.createElement("pre");
      content.textContent = report;
      content.style.cssText = `
        white-space: pre-wrap;
        font-family: monospace;
        font-size: 12px;
        max-height: 300px;
        overflow-y: auto;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 4px;
      `;

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "Close";
      closeBtn.className = "btn";
      closeBtn.style.cssText = `
        margin-top: 15px;
        background: #2196F3;
        color: white;
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      `;

      closeBtn.addEventListener("click", () => {
        document.body.removeChild(dialogContainer);
      });

      dialog.appendChild(heading);
      dialog.appendChild(content);
      dialog.appendChild(closeBtn);
      dialogContainer.appendChild(dialog);

      document.body.appendChild(dialogContainer);
    });
  }

  function checkActiveRules() {
    chrome.runtime.sendMessage({action: "getActiveRules"}, (response) => {
      if (response.error) {
        elements.testUrlResult.innerHTML = `<div class="test-result error">${response.error}</div>`;
        elements.testUrlResult.style.display = "block";
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
      elements.testUrlResult.innerHTML = html;
      elements.testUrlResult.style.display = "block";
    });
  }

  function testCurrentPageUrl() {
    // Get current active tab URL
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]?.url) {
        elements.testUrlInput.value = tabs[0].url;
        testUrl();
      } else {
        elements.testUrlResult.innerHTML =
          '<div class="test-result error">Could not get current tab URL</div>';
        elements.testUrlResult.style.display = "block";
      }
    });
  }

  function testUrl() {
    const url = elements.testUrlInput.value.trim();
    if (!url) {
      elements.testUrlResult.innerHTML =
        '<div class="test-result error">Please enter a URL to test</div>';
      elements.testUrlResult.style.display = "block";
      return;
    }

    // Find matching rules
    chrome.storage.local.get(["redirectRules", "enabled"], (result) => {
      const rules = result.redirectRules || [];
      const isEnabled = result.enabled === true;

      if (!isEnabled) {
        elements.testUrlResult.innerHTML =
          '<div class="test-result error">Extension is disabled. Enable it to use redirects.</div>';
        elements.testUrlResult.style.display = "block";
        return;
      }

      if (rules.length === 0) {
        elements.testUrlResult.innerHTML =
          '<div class="test-result error">No redirect rules defined.</div>';
        elements.testUrlResult.style.display = "block";
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
        elements.testUrlResult.innerHTML = html;
        elements.testUrlResult.style.display = "block";
      });
    });
  }
});
