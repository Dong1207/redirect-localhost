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
    tabs: document.querySelectorAll(".debug__tab"),
    tabContents: document.querySelectorAll(".debug__content"),
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
    console.log("Loading settings from storage...");

    chrome.storage.local.get(["redirectRules", "enabled"], (result) => {
      // Check if we have rules in storage
      if (result.redirectRules && Array.isArray(result.redirectRules)) {
        console.log("Loaded rules from storage:", result.redirectRules);
        redirectRules = result.redirectRules;
      } else {
        console.log("No rules found in storage, initializing empty array");
        redirectRules = [];
      }

      // Set the enabled toggle state
      elements.enableToggle.checked = result.enabled || false;

      // Display the rules
      displayRules();
    });
  }

  function saveRules() {
    // Log the rules being saved for debugging
    console.log("Saving rules to storage:", redirectRules);

    // Save to Chrome storage
    chrome.storage.local.set({redirectRules}, () => {
      // Check for any error
      if (chrome.runtime.lastError) {
        console.error("Error saving rules:", chrome.runtime.lastError);
      } else {
        console.log("Rules saved successfully");

        // Notify the background script about the rule update
        chrome.runtime.sendMessage({action: "rulesUpdated"}, (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error notifying background script:",
              chrome.runtime.lastError
            );
          } else if (response?.success) {
            console.log("Background script updated successfully");
          }
        });
      }
    });
  }

  function toggleRedirect() {
    chrome.storage.local.set({enabled: elements.enableToggle.checked});
    updateAllRuleStatuses();
  }

  // UI update functions
  function displayRules() {
    elements.rulesContainer.innerHTML = "";

    // Log the rules for debugging
    console.log("Displaying rules:", redirectRules);

    if (redirectRules.length === 0) {
      console.log("No rules to display");
      return;
    }

    redirectRules.forEach((rule, index) => {
      // Use initializeRuleElement instead of createRuleElement
      const ruleElement = initializeRuleElement(rule, index);
      elements.rulesContainer.appendChild(ruleElement);

      // Log each rule for debugging
      console.log(`Rule ${index} displayed:`, rule);
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
        const tabId = tab.getAttribute("data-tab");

        // Update active tab
        elements.tabs.forEach((t) => t.classList.remove("debug__tab--active"));
        tab.classList.add("debug__tab--active");

        // Update active content
        elements.tabContents.forEach((content) => {
          content.classList.remove("debug__content--active");
        });
        document
          .getElementById(`${tabId}Tab`)
          .classList.add("debug__content--active");
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
      disabled: false
    };

    // Add the new rule to the array
    redirectRules.push(newRule);
    
    // Save to storage immediately
    saveRules();
    
    // Create and add the rule element to the DOM
    const index = redirectRules.length - 1;
    const ruleElement = initializeRuleElement(newRule, index);
    elements.rulesContainer.appendChild(ruleElement);
    
    // Expand the newly added rule to allow immediate editing
    setTimeout(() => {
      ruleElement.classList.remove("rule--collapsed");
      const icon = ruleElement.querySelector(".rule__collapse-icon i");
      if (icon) {
        icon.className = "fas fa-chevron-down";
      }
      
      // Focus on the From URL input field
      const fromUrlInput = ruleElement.querySelector(".from-url-input");
      if (fromUrlInput) {
        fromUrlInput.focus();
      }
    }, 50);
  }

  function updateRule(index) {
    const ruleElement = document.querySelector(`.rule[data-index="${index}"]`);
    if (!ruleElement) return;

    // Get values from input fields
    const fromUrl = ruleElement.querySelector(".from-url-input").value.trim();
    const toUrl = ruleElement.querySelector(".to-url-input").value.trim();

    // Get the disabled state from the rule object, not from the DOM
    const isDisabled = redirectRules[index]?.disabled === true;

    const resourceCheckboxes = ruleElement.querySelectorAll(
      ".advanced__resource-types input:checked"
    );
    const resourceTypes = Array.from(resourceCheckboxes).map((cb) => cb.value);

    // Update the rule in the array
    redirectRules[index] = {
      fromUrl,
      toUrl,
      resourceTypes,
      disabled: isDisabled,
    };

    // Save to storage
    saveRules();

    // Log for debugging
    console.log(`Rule ${index} updated:`, redirectRules[index]);
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
    if (!rule.fromUrl || !rule.toUrl) {
      return { matches: false };
    }

    // Simple pattern matching for immediate feedback
    const fromPattern = rule.fromUrl;
    const toPattern = rule.toUrl;
    
    // Check for wildcard pattern
    if (fromPattern.includes("**")) {
      const parts = fromPattern.split("**");
      const prefix = parts[0];
      const suffix = parts[1] || "";
      
      if (inputUrl.startsWith(prefix) && inputUrl.endsWith(suffix)) {
        // Extract the wildcard content
        const wildcardStart = prefix.length;
        const wildcardEnd = inputUrl.length - suffix.length;
        const wildcardContent = inputUrl.substring(wildcardStart, wildcardEnd);
        
        // Replace the wildcard in the target pattern
        let redirectUrl = toPattern;
        if (toPattern.includes("**")) {
          redirectUrl = toPattern.replace("**", wildcardContent);
        }
        
        return {
          matches: true,
          redirectUrl: redirectUrl,
          wildcardContent: wildcardContent
        };
      }
    } else if (inputUrl === fromPattern) {
      // Direct match
      return {
        matches: true,
        redirectUrl: toPattern
      };
    }
    
    return { matches: false };
  }

  function truncateUrl(url, maxLength) {
    if (!url) return "Unknown URL";
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + "...";
  }

  // Status indicator updates
  function updateRuleStatus(ruleElement, rule, isEnabled) {
    const statusIndicator = ruleElement.querySelector(".rule__status");
    const toggleBtn = ruleElement.querySelector(".rule__toggle-btn");

    if (rule.disabled || !isEnabled) {
      statusIndicator.classList.remove("rule__status--active");
      statusIndicator.classList.add("rule__status--inactive");
      toggleBtn.classList.add("rule__toggle-btn--inactive");
      ruleElement.setAttribute("data-disabled", "true");
    } else {
      statusIndicator.classList.add("rule__status--active");
      statusIndicator.classList.remove("rule__status--inactive");
      toggleBtn.classList.remove("rule__toggle-btn--inactive");
      ruleElement.removeAttribute("data-disabled");
    }
  }

  function updateAllRuleStatuses() {
    chrome.storage.local.get(["enabled"], (result) => {
      const isEnabled = result.enabled === true;
      document.querySelectorAll(".rule").forEach((ruleElement) => {
        const ruleIndex = ruleElement.dataset.index;
        if (ruleIndex !== undefined && redirectRules[ruleIndex]) {
          updateRuleStatus(ruleElement, redirectRules[ruleIndex], isEnabled);
        }
      });
    });
  }

  // UI element creation
  function createRuleElement(rule = {}, index) {
    const clone = document.importNode(elements.ruleTemplate.content, true);
    const ruleElement = clone.querySelector(".rule");
    
    ruleElement.setAttribute("data-index", index);
    if (rule.disabled) {
      ruleElement.setAttribute("data-disabled", "true");
    }
    
    return ruleElement;
  }

  function initializeRuleElement(rule, index) {
    const ruleElement = createRuleElement(rule, index);
    
    // Get form elements
    const fromUrlInput = ruleElement.querySelector(".from-url-input");
    const toUrlInput = ruleElement.querySelector(".to-url-input");
    const advancedBtn = ruleElement.querySelector(".advanced__btn");
    const advancedSections = ruleElement.querySelector(".advanced__sections");
    const toggleActiveBtn = ruleElement.querySelector(".rule__toggle-btn");
    const deleteBtn = ruleElement.querySelector(".rule__delete-btn");
    const header = ruleElement.querySelector(".rule__header");
    
    // Ensure the rule is collapsed by default
    ruleElement.classList.add("rule--collapsed");
    const collapseIcon = ruleElement.querySelector(".rule__collapse-icon i");
    collapseIcon.className = "fas fa-chevron-right";
    
    // Set initial values - ensure we're using the correct property names
    fromUrlInput.value = rule.fromUrl || "";
    toUrlInput.value = rule.toUrl || "";
    
    // Set up resource type checkboxes
    if (rule.resourceTypes && rule.resourceTypes.length > 0) {
      const checkboxes = ruleElement.querySelectorAll(".advanced__resource-types input");
      checkboxes.forEach((checkbox) => {
        checkbox.checked = rule.resourceTypes.includes(checkbox.value);
      });
    }
    
    // Set up event listeners for the header (collapse/expand)
    const titleContainer = header.querySelector(".rule__title-container");
    titleContainer.addEventListener("click", () => {
      ruleElement.classList.toggle("rule--collapsed");
      const icon = header.querySelector(".rule__collapse-icon i");
      icon.className = ruleElement.classList.contains("rule--collapsed")
        ? "fas fa-chevron-right"
        : "fas fa-chevron-down";
    });
    
    // Set up event listeners for action buttons with stopPropagation
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent event from bubbling up to header
      deleteRule(index);
    });
    
    toggleActiveBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent event from bubbling up to header
      redirectRules[index].disabled = !redirectRules[index].disabled;
      updateRuleStatus(ruleElement, redirectRules[index], elements.enableToggle.checked);
      saveRules();
    });
    
    advancedBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent event from bubbling up
      advancedSections.style.display = 
        advancedSections.style.display === "none" || !advancedSections.style.display 
          ? "block" 
          : "none";
    });
    
    // Set up test functionality
    setupTestFunctionality(ruleElement, rule);
    
    // Attach input event listeners
    attachRuleEventListeners(ruleElement, rule, index, {
      fromUrlInput,
      toUrlInput,
      advancedBtn,
      advancedSections,
      toggleActiveBtn
    });
    
    // Update rule title and status
    updateRuleTitle(ruleElement, rule);
    updateRuleStatus(ruleElement, rule, elements.enableToggle.checked);
    
    return ruleElement;
  }

  function attachRuleEventListeners(
    element,
    rule,
    index,
    {fromUrlInput, toUrlInput, advancedBtn, advancedSections, toggleActiveBtn}
  ) {
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

    // Add both input and change event listeners to catch all changes
    fromUrlInput.addEventListener("input", updateHandler);
    fromUrlInput.addEventListener("change", updateHandler);
    fromUrlInput.addEventListener("blur", updateHandler);
    
    toUrlInput.addEventListener("input", updateHandler);
    toUrlInput.addEventListener("change", updateHandler);
    toUrlInput.addEventListener("blur", updateHandler);

    element
      .querySelectorAll(".advanced__resource-types input")
      .forEach((checkbox) => {
        checkbox.addEventListener("change", () => updateRule(index));
      });

    // Note: The toggle active button, delete button, and collapse functionality
    // event listeners are now set up in the initializeRuleElement function
  }

  function updateRuleTitle(ruleElement, rule) {
    const ruleTitle = ruleElement.querySelector(".rule__title");
    if (rule.fromUrl && rule.toUrl) {
      const fromDomain = extractDomain(rule.fromUrl);
      const toDomain = extractDomain(rule.toUrl);
      ruleTitle.textContent = `${fromDomain} => ${toDomain}`;
    } else {
      ruleTitle.textContent = "New Rule";
    }
  }

  function setupTestFunctionality(element, rule) {
    const testInput = element.querySelector(".advanced__test-input");
    const testBtn = element.querySelector(".advanced__test-btn");
    const testResult = element.querySelector(".advanced__test-result");

    testBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent event from bubbling up
      
      const inputUrl = testInput.value.trim();
      if (!inputUrl) {
        testResult.textContent = "Please enter a URL to test";
        testResult.style.display = "block";
        testResult.className = "advanced__test-result test-result error";
        return;
      }

      // Get the current rule data from the form
      const ruleIndex = element.getAttribute("data-index");
      const currentRule = redirectRules[ruleIndex];
      
      // Test with the current rule data
      chrome.runtime.sendMessage(
        {
          action: "testUrlMatch",
          inputUrl: inputUrl,
          rule: currentRule
        },
        (response) => {
          if (response && response.matched) {
            testResult.innerHTML = `✅ Match! Will redirect to:<br>${response.redirectUrl}`;
            testResult.className = "advanced__test-result test-result success";
          } else {
            testResult.textContent = "❌ No match. This URL won't be redirected.";
            testResult.className = "advanced__test-result test-result error";
          }
          testResult.style.display = "block";
        }
      );
    });
    
    // Prevent input field clicks from collapsing the rule
    testInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Debug panel functions
  function toggleDebugPanel() {
    elements.debugPanel.classList.toggle("hidden");

    // If the panel is now visible, load the redirect history
    if (!elements.debugPanel.classList.contains("hidden")) {
      loadRedirectHistory();

      // Make sure the first tab is active
      elements.tabs.forEach((tab, index) => {
        if (index === 0) {
          tab.classList.add("debug__tab--active");
        } else {
          tab.classList.remove("debug__tab--active");
        }
      });

      elements.tabContents.forEach((content, index) => {
        if (index === 0) {
          content.classList.add("debug__content--active");
        } else {
          content.classList.remove("debug__content--active");
        }
      });
    }
  }

  function loadRedirectHistory() {
    chrome.storage.local.get(["redirectHistory"], (result) => {
      const history = result.redirectHistory || [];
      elements.redirectHistory.innerHTML = "";

      if (history.length === 0) {
        elements.redirectHistory.innerHTML =
          '<div class="history-empty">No redirects recorded yet.</div>';
        return;
      }

      // Sort by timestamp descending (newest first)
      history.sort((a, b) => b.timestamp - a.timestamp);

      history.forEach((item) => {
        const historyItem = document.createElement("div");
        historyItem.className = "history__item";

        const fromUrl = truncateUrl(item.fromUrl, 60);
        const toUrl = truncateUrl(item.toUrl, 60);
        const date = new Date(item.timestamp);
        const timeString = date.toLocaleTimeString();

        historyItem.innerHTML = `
          <div class="history__from">${fromUrl}</div>
          <div class="history__to">${toUrl}</div>
          <div class="history__time">${timeString}</div>
        `;

        elements.redirectHistory.appendChild(historyItem);
      });
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
    statusElement.className = `import-export__status ${
      isSuccess ? "success" : "error"
    }`;
    statusElement.textContent = message;

    const container = elements.importRulesBtn.closest(".import-export");

    // Remove any existing status messages
    const existingStatus = container.querySelector(".import-export__status");
    if (existingStatus) {
      existingStatus.remove();
    }

    container.appendChild(statusElement);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      statusElement.remove();
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
      elements.testUrlResult.textContent = "Please enter a URL to test";
      elements.testUrlResult.className = "test-url__result error";
      elements.testUrlResult.classList.remove("hidden");
      return;
    }

    // Find matching rules
    let matchFound = false;
    let matchingRules = [];

    redirectRules.forEach((rule, index) => {
      if (!rule.disabled) {
        const result = testRedirect(url, rule);
        if (result.matches) {
          matchFound = true;
          matchingRules.push({
            index,
            rule,
            redirectUrl: result.redirectUrl,
          });
        }
      }
    });

    // Display results
    if (matchFound) {
      let resultHTML = `<div class="test-url__result-header success">✅ URL will be redirected</div>`;

      matchingRules.forEach(({rule, redirectUrl, index}) => {
        resultHTML += `
          <div class="test-url__result-item">
            <div class="test-url__result-rule">Rule #${
              index + 1
            }: ${extractDomain(rule.fromUrl)} → ${extractDomain(
          rule.toUrl
        )}</div>
            <div class="test-url__result-redirect">Redirects to: ${redirectUrl}</div>
          </div>
        `;
      });

      elements.testUrlResult.innerHTML = resultHTML;
      elements.testUrlResult.className = "test-url__result success";
    } else {
      elements.testUrlResult.textContent =
        "❌ No matching rules found. URL won't be redirected.";
      elements.testUrlResult.className = "test-url__result error";
    }

    elements.testUrlResult.classList.remove("hidden");
  }
});
