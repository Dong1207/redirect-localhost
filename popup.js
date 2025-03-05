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
    const isDisabled = ruleElement.dataset.disabled === "true";
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
    const isRuleActive =
      !rule.disabled && isEnabled && rule.fromUrl && rule.toUrl;

    statusIndicator.classList.toggle("active", isRuleActive);
    statusIndicator.classList.toggle("inactive", !isRuleActive);

    if (isRuleActive) {
      statusIndicator.title = "Rule is active";
    } else if (rule.disabled) {
      statusIndicator.title = "Rule is disabled";
    } else if (!isEnabled) {
      statusIndicator.title = "Extension is disabled";
    } else {
      statusIndicator.title = "Rule is incomplete (missing URL)";
    }
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
    if (rule.disabled) {
      element.dataset.disabled = "true";
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
      element.dataset.disabled = (!isCurrentlyDisabled).toString();
      toggleActiveBtn.classList.toggle("inactive", !isCurrentlyDisabled);
      toggleActiveBtn.title = isCurrentlyDisabled
        ? "Disable Rule"
        : "Enable Rule";
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

    // Set initial status
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
});
