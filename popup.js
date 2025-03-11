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

  // Create the main application
  const app = new RedirectApp(elements);
  app.init();
});

/**
 * Represents a single redirect rule
 */
class RedirectRule {
  constructor(data = {}) {
    this.fromUrl = data.fromUrl || "";
    this.toUrl = data.toUrl || "";
    this.name = data.name || "";
    this.resourceTypes = data.resourceTypes || [
      "main_frame",
      "stylesheet",
      "script",
      "image",
      "xmlhttprequest",
      "other",
    ];
    this.disabled = data.disabled || false;
  }

  /**
   * Test if a URL matches this rule
   * @param {string} inputUrl - The URL to test
   * @returns {object} Result of the test
   */
  testUrl(inputUrl) {
    if (!this.fromUrl || !this.toUrl) {
      return { matches: false };
    }

    // Simple pattern matching for immediate feedback
    const fromPattern = this.fromUrl;
    const toPattern = this.toUrl;

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

  /**
   * Convert rule to a plain object for storage
   */
  toObject() {
    return {
      fromUrl: this.fromUrl,
      toUrl: this.toUrl,
      name: this.name,
      resourceTypes: this.resourceTypes,
      disabled: this.disabled
    };
  }
}

/**
 * Manages all redirect rules
 */
class RuleManager {
  constructor() {
    this.rules = [];
    this.enabled = false;
  }

  /**
   * Load rules from storage
   * @returns {Promise} Promise that resolves when rules are loaded
   */
  async loadRules() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["redirectRules", "enabled"], (result) => {
        if (result.redirectRules && Array.isArray(result.redirectRules)) {
          this.rules = result.redirectRules.map(rule => new RedirectRule(rule));
        } else {
          this.rules = [];
        }

        this.enabled = result.enabled || false;
        resolve();
      });
    });
  }

  /**
   * Save rules to storage
   * @returns {Promise} Promise that resolves when rules are saved
   */
  async saveRules() {
    const redirectRules = this.rules.map(rule => rule.toObject());

    return new Promise((resolve) => {
      chrome.storage.local.set({ redirectRules }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving rules:", chrome.runtime.lastError);
          resolve(false);
        } else {
          try {
            chrome.runtime.sendMessage({ action: "rulesUpdated" }, (response) => {
              if (chrome.runtime.lastError) {
                console.log("Background notification status: " +
                  (chrome.runtime.lastError.message || "Unknown error"));
              } else if (response?.success) {
                console.log("Background script updated successfully");
              } else {
                console.log("Background script notification sent, no confirmation received");
              }
              resolve(true);
            });
          } catch (err) {
            console.error("Failed to notify background script:", err);
            resolve(false);
          }
        }
      });
    });
  }

  /**
   * Add a new rule
   * @returns {RedirectRule} The newly created rule
   */
  addRule() {
    const newRule = new RedirectRule();
    newRule.resourceTypes = [
      "main_frame",
      "stylesheet",
      "script",
      "image",
      "xmlhttprequest",
      "other",
    ];
    this.rules.push(newRule);
    return newRule;
  }

  /**
   * Update a rule at the specified index
   * @param {number} index - Index of the rule to update
   * @param {object} data - New rule data
   */
  updateRule(index, data) {
    if (index >= 0 && index < this.rules.length) {
      const rule = this.rules[index];

      if (data.fromUrl !== undefined) rule.fromUrl = data.fromUrl;
      if (data.toUrl !== undefined) rule.toUrl = data.toUrl;
      if (data.name !== undefined) rule.name = data.name;
      if (data.resourceTypes !== undefined) rule.resourceTypes = data.resourceTypes;
      if (data.disabled !== undefined) rule.disabled = data.disabled;
    }
  }

  /**
   * Delete a rule at the specified index
   * @param {number} index - Index of the rule to delete
   */
  deleteRule(index) {
    if (index >= 0 && index < this.rules.length) {
      this.rules.splice(index, 1);
    }
  }

  /**
   * Toggle the enabled state
   * @param {boolean} enabled - New enabled state
   * @returns {Promise} Promise that resolves when state is saved
   */
  async setEnabled(enabled) {
    this.enabled = enabled;
    return new Promise((resolve) => {
      chrome.storage.local.set({ enabled }, () => {
        resolve();
      });
    });
  }

  /**
   * Test a URL against all active rules
   * @param {string} url - URL to test
   * @returns {Array} Array of matching rules with their redirect URLs
   */
  testUrl(url) {
    if (!this.enabled) return [];

    return this.rules
      .filter(rule => !rule.disabled)
      .map((rule, index) => {
        const result = rule.testUrl(url);
        if (result.matches) {
          return { rule, index, redirectUrl: result.redirectUrl };
        }
        return null;
      })
      .filter(result => result !== null);
  }
}

/**
 * Manages the popup UI
 */
class PopupUI {
  constructor(elements, ruleManager) {
    this.elements = elements;
    this.ruleManager = ruleManager;
  }

  /**
   * Initialize the UI
   */
  async init() {
    this.setupEventListeners();
    this.setupTabs();
    await this.updateRedirectCount();
    this.displayRules();
    this.loadRedirectHistory();
  }

  /**
   * Set up event listeners for UI elements
   */
  setupEventListeners() {
    // Main controls
    this.elements.enableToggle.addEventListener("change", () => this.toggleRedirect());
    this.elements.addRuleBtn.addEventListener("click", () => this.addNewRule());
    this.elements.debugBtn.addEventListener("click", () => this.toggleDebugPanel());
    this.elements.diagBtn.addEventListener("click", () => this.showDiagnosticDialog());

    // Debug panel event listeners
    this.elements.clearHistoryBtn.addEventListener("click", () => this.clearRedirectHistory());
    this.elements.checkRulesBtn.addEventListener("click", () => this.checkActiveRules());
    this.elements.testCurrentPageBtn.addEventListener("click", () => this.testCurrentPageUrl());
    this.elements.exportRulesBtn.addEventListener("click", () => this.exportRules());
    this.elements.importRulesBtn.addEventListener("click", () => this.importRules());
    this.elements.testUrlBtn.addEventListener("click", () => this.testUrl());

    // Debug toggle setup
    chrome.storage.local.get(["debugToPage"], (result) => {
      this.elements.debugToPageToggle.checked = result.debugToPage === true;
    });

    this.elements.debugToPageToggle.addEventListener("change", () => {
      const enabled = this.elements.debugToPageToggle.checked;
      chrome.runtime.sendMessage(
        { action: "toggleDebugToPage", enabled },
        (response) => {
          if (
            response?.debugEnabled !== undefined &&
            response.debugEnabled !== enabled
          ) {
            this.elements.debugToPageToggle.checked = response.debugEnabled;
          }
        }
      );
      chrome.storage.local.set({ debugToPage: enabled });
    });
  }

  /**
   * Set up tab navigation
   */
  setupTabs() {
    this.elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabId = tab.getAttribute("data-tab");

        // Update active tab
        this.elements.tabs.forEach((t) => t.classList.remove("debug__tab--active"));
        tab.classList.add("debug__tab--active");

        // Update active content
        this.elements.tabContents.forEach((content) => {
          content.classList.remove("debug__content--active");
        });
        document
          .getElementById(`${tabId}Tab`)
          .classList.add("debug__content--active");
      });
    });
  }

  /**
   * Toggle the redirect functionality
   */
  async toggleRedirect() {
    await this.ruleManager.setEnabled(this.elements.enableToggle.checked);
    this.updateAllRuleStatuses();
  }

  /**
   * Add a new rule
   */
  async addNewRule() {
    const newRule = this.ruleManager.addRule();
    await this.ruleManager.saveRules();

    // Create and add the rule element to the DOM
    const index = this.ruleManager.rules.length - 1;
    const ruleElement = this.initializeRuleElement(newRule, index);
    this.elements.rulesContainer.appendChild(ruleElement);

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

  /**
   * Display all rules in the UI
   */
  displayRules() {
    this.elements.rulesContainer.innerHTML = "";

    if (this.ruleManager.rules.length === 0) {
      return;
    }

    this.ruleManager.rules.forEach((rule, index) => {
      const ruleElement = this.initializeRuleElement(rule, index);
      this.elements.rulesContainer.appendChild(ruleElement);
    });

    this.updateAllRuleStatuses();
  }

  /**
   * Update the redirect count display
   */
  async updateRedirectCount() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["redirectCount"], (result) => {
        this.elements.redirectCountElem.textContent = result.redirectCount || 0;

        chrome.runtime.sendMessage({ action: "getRedirectCount" }, (response) => {
          if (response?.count !== undefined) {
            this.elements.redirectCountElem.textContent = response.count;
          }
          resolve();
        });
      });
    });
  }

  /**
   * Create a rule element
   */
  createRuleElement(rule, index) {
    const clone = document.importNode(this.elements.ruleTemplate.content, true);
    const ruleElement = clone.querySelector(".rule");

    ruleElement.setAttribute("data-index", index);
    if (rule.disabled) {
      ruleElement.setAttribute("data-disabled", "true");
    }

    return ruleElement;
  }

  /**
   * Initialize a rule element with data and event listeners
   */
  initializeRuleElement(rule, index) {
    const ruleElement = this.createRuleElement(rule, index);

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

    // Set initial values
    fromUrlInput.value = rule.fromUrl || "";
    toUrlInput.value = rule.toUrl || "";

    // Set up input event listeners
    fromUrlInput.addEventListener("input", () => this.updateRuleFromForm(index, ruleElement));
    toUrlInput.addEventListener("input", () => this.updateRuleFromForm(index, ruleElement));

    // Create advanced options section
    this.setupAdvancedOptions(ruleElement, rule, index);

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
      this.deleteRule(index);
    });

    toggleActiveBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent event from bubbling up to header
      this.toggleRuleActive(index);
    });

    advancedBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent event from bubbling up
      advancedSections.style.display =
        advancedSections.style.display === "none" || !advancedSections.style.display
          ? "block"
          : "none";
    });

    // Update rule title and status
    this.updateRuleTitle(ruleElement, rule);
    this.updateRuleStatus(ruleElement, rule, this.ruleManager.enabled);

    return ruleElement;
  }

  /**
   * Set up advanced options for a rule
   */
  setupAdvancedOptions(ruleElement, rule, index) {
    const advancedBtn = ruleElement.querySelector(".advanced__btn");
    const advancedSections = ruleElement.querySelector(".advanced__sections");

    if (!advancedBtn) return;

    advancedBtn.className = "btn btn--secondary advanced-options__toggle";
    advancedBtn.innerHTML = '<i class="fas fa-cog"></i> Advanced';

    if (advancedSections) {
      advancedSections.className = "advanced-options__sections";
      advancedSections.innerHTML = '';

      // 1. Add Rule Name field
      const ruleNameSection = document.createElement("div");
      ruleNameSection.className = "advanced-section";
      ruleNameSection.innerHTML = `
        <label class="advanced-section__label">
          Rule Name
          <input type="text" class="advanced-section__input rule-name-input" 
                 placeholder="Enter a custom name for this rule" value="${rule.name || ''}">
        </label>
        <div class="advanced-section__help">A custom name to help identify this rule</div>
      `;
      advancedSections.appendChild(ruleNameSection);

      // 2. Add Resource Types section
      const resourceTypesSection = this.createResourceTypesSection(rule);
      advancedSections.appendChild(resourceTypesSection);

      // 3. Add Test URL section
      const testSection = this.createTestSection();
      advancedSections.appendChild(testSection);

      // Set up the test functionality
      const testInput = testSection.querySelector(".test-section__input");
      const testBtn = testSection.querySelector(".test-section__btn");
      const testResult = testSection.querySelector(".test-section__result");
      this.setupTestFunctionality(ruleElement, rule, testInput, testBtn, testResult);

      // Add event listeners for resource type checkboxes
      const resourceTypesGrid = resourceTypesSection.querySelector(".resource-types__grid");
      resourceTypesGrid.querySelectorAll("input[type='checkbox']").forEach(checkbox => {
        checkbox.addEventListener("change", () => this.updateRuleFromForm(index, ruleElement));
      });

      // Add event listener for rule name input
      const ruleNameInput = ruleNameSection.querySelector(".rule-name-input");
      if (ruleNameInput) {
        ruleNameInput.addEventListener("input", () => {
          this.updateRuleFromForm(index, ruleElement);
          this.updateRuleTitle(ruleElement, this.ruleManager.rules[index]);
        });
      }
    }
  }

  /**
   * Create the resource types section for advanced options
   */
  createResourceTypesSection(rule) {
    const resourceTypesSection = document.createElement("div");
    resourceTypesSection.className = "advanced-section resource-types";

    // Create the resource types header
    const resourceTypesHeader = document.createElement("div");
    resourceTypesHeader.className = "advanced-section__header";
    resourceTypesHeader.textContent = "Resource Types";
    resourceTypesSection.appendChild(resourceTypesHeader);

    // Create the resource types grid
    const resourceTypesGrid = document.createElement("div");
    resourceTypesGrid.className = "resource-types__grid";

    // Define all possible resource types
    const allResourceTypes = [
      { value: "main_frame", label: "Pages" },
      { value: "stylesheet", label: "CSS" },
      { value: "script", label: "JS" },
      { value: "image", label: "Images" },
      { value: "xmlhttprequest", label: "XHR" },
      { value: "other", label: "Other" }
    ];

    // Add checkboxes for each resource type
    allResourceTypes.forEach(type => {
      const isChecked = rule.resourceTypes && rule.resourceTypes.includes(type.value);

      const checkbox = document.createElement("label");
      checkbox.className = "resource-types__option";
      checkbox.innerHTML = `
        <input type="checkbox" value="${type.value}" ${isChecked ? 'checked' : ''}>
        <span>${type.label}</span>
      `;
      resourceTypesGrid.appendChild(checkbox);
    });

    resourceTypesSection.appendChild(resourceTypesGrid);
    return resourceTypesSection;
  }

  /**
   * Create the test section for advanced options
   */
  createTestSection() {
    const testSection = document.createElement("div");
    testSection.className = "advanced-section test-section";

    const testHeader = document.createElement("div");
    testHeader.className = "advanced-section__header";
    testHeader.textContent = "Test Redirect";
    testSection.appendChild(testHeader);

    const testContent = document.createElement("div");
    testContent.className = "test-section__content";

    const testInputGroup = document.createElement("div");
    testInputGroup.className = "test-section__input-group";

    const testInput = document.createElement("input");
    testInput.type = "text";
    testInput.className = "test-section__input";
    testInput.placeholder = "Enter full URL to test including https://";

    const testBtn = document.createElement("button");
    testBtn.className = "test-section__btn";
    testBtn.textContent = "Test";

    testInputGroup.appendChild(testInput);
    testInputGroup.appendChild(testBtn);

    const testResult = document.createElement("div");
    testResult.className = "test-section__result";
    testResult.style.display = "none";

    testContent.appendChild(testInputGroup);
    testContent.appendChild(testResult);
    testSection.appendChild(testContent);

    return testSection;
  }

  /**
   * Update a rule from form data
   */
  async updateRuleFromForm(index, ruleElement) {
    if (!ruleElement) return;

    // Get values from input fields
    const fromUrl = ruleElement.querySelector(".from-url-input").value.trim();
    const toUrl = ruleElement.querySelector(".to-url-input").value.trim();

    // Get the rule name from the input field
    const ruleNameInput = ruleElement.querySelector(".rule-name-input");
    const ruleName = ruleNameInput ? ruleNameInput.value.trim() : "";

    // Get resource types
    const resourceCheckboxes = ruleElement.querySelectorAll(
      ".advanced__resource-types input:checked, .resource-types__grid input:checked"
    );
    const resourceTypes = Array.from(resourceCheckboxes).map((cb) => cb.value);

    // Update the rule
    this.ruleManager.updateRule(index, {
      fromUrl,
      toUrl,
      name: ruleName,
      resourceTypes
    });

    // Save to storage
    await this.ruleManager.saveRules();

    // Update the rule title
    this.updateRuleTitle(ruleElement, this.ruleManager.rules[index]);
  }

  /**
   * Delete a rule
   */
  async deleteRule(index) {
    this.ruleManager.deleteRule(index);
    await this.ruleManager.saveRules();
    this.displayRules();
  }

  /**
   * Toggle a rule's active state
   */
  async toggleRuleActive(index) {
    const rule = this.ruleManager.rules[index];
    if (!rule) return;

    rule.disabled = !rule.disabled;

    // Update UI
    const ruleElement = document.querySelector(`.rule[data-index="${index}"]`);
    if (ruleElement) {
      this.updateRuleStatus(ruleElement, rule, this.ruleManager.enabled);
    }

    // Save changes
    await this.ruleManager.saveRules();
  }

  /**
   * Update a rule's status indicator
   */
  updateRuleStatus(ruleElement, rule, isEnabled) {
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

  /**
   * Update all rule status indicators
   */
  updateAllRuleStatuses() {
    document.querySelectorAll(".rule").forEach((ruleElement) => {
      const ruleIndex = ruleElement.dataset.index;
      if (ruleIndex !== undefined && this.ruleManager.rules[ruleIndex]) {
        this.updateRuleStatus(
          ruleElement,
          this.ruleManager.rules[ruleIndex],
          this.ruleManager.enabled
        );
      }
    });
  }

  /**
   * Update a rule's title display
   */
  updateRuleTitle(ruleElement, rule) {
    const ruleTitle = ruleElement.querySelector(".rule__title");

    // Use custom name if available
    if (rule.name && rule.name.trim() !== "") {
      ruleTitle.textContent = rule.name;
    } else if (rule.fromUrl && rule.toUrl) {
      const fromDomain = this.extractDomain(rule.fromUrl);
      const toDomain = this.extractDomain(rule.toUrl);
      ruleTitle.textContent = `${fromDomain} => ${toDomain}`;
    } else {
      ruleTitle.textContent = "New Rule";
    }
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      if (!url.includes("://")) url = "https://" + url;
      return new URL(url).hostname || url;
    } catch {
      return url;
    }
  }

  /**
   * Truncate URL for display
   */
  truncateUrl(url, maxLength) {
    if (!url) return "Unknown URL";
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + "...";
  }

  /**
   * Set up test functionality for a rule
   */
  setupTestFunctionality(ruleElement, rule, testInput, testBtn, testResult) {
    if (!testInput || !testBtn || !testResult) {
      console.warn("Test functionality elements not provided", rule);
      return;
    }

    testBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const inputUrl = testInput.value.trim();
      if (!inputUrl) {
        testResult.textContent = "Please enter a URL to test";
        testResult.style.display = "block";
        testResult.className = "test-section__result error";
        return;
      }

      // Get the current rule data from the form
      const ruleIndex = ruleElement.getAttribute("data-index");
      const currentRule = this.ruleManager.rules[ruleIndex];

      // Test with the current rule data
      chrome.runtime.sendMessage(
        {
          action: "testUrlMatch",
          inputUrl: inputUrl,
          rule: currentRule.toObject()
        },
        (response) => {
          if (response && response.matched) {
            testResult.innerHTML = `✅ Match! Will redirect to:<br>${response.redirectUrl}`;
            testResult.className = "test-section__result success";
          } else {
            testResult.textContent = "❌ No match. This URL won't be redirected.";
            testResult.className = "test-section__result error";
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

  /**
   * Toggle debug panel visibility
   */
  toggleDebugPanel() {
    this.elements.debugPanel.classList.toggle("hidden");

    // If the panel is now visible, load the redirect history
    if (!this.elements.debugPanel.classList.contains("hidden")) {
      this.loadRedirectHistory();

      // Make sure the first tab is active
      this.elements.tabs.forEach((tab, index) => {
        if (index === 0) {
          tab.classList.add("debug__tab--active");
        } else {
          tab.classList.remove("debug__tab--active");
        }
      });

      this.elements.tabContents.forEach((content, index) => {
        if (index === 0) {
          content.classList.add("debug__content--active");
        } else {
          content.classList.remove("debug__content--active");
        }
      });
    }
  }

  /**
   * Load redirect history from storage
   */
  loadRedirectHistory() {
    chrome.storage.local.get(["redirectHistory"], (result) => {
      const history = result.redirectHistory || [];
      this.elements.redirectHistory.innerHTML = "";

      if (history.length === 0) {
        this.elements.redirectHistory.innerHTML =
          '<div class="history-empty">No redirects recorded yet.</div>';
        return;
      }

      // Sort by timestamp descending (newest first)
      history.sort((a, b) => b.timestamp - a.timestamp);

      history.forEach((item) => {
        const historyItem = document.createElement("div");
        historyItem.className = "history__item";

        const fromUrl = this.truncateUrl(item.fromUrl, 60);
        const toUrl = this.truncateUrl(item.toUrl, 60);
        const date = new Date(item.timestamp);
        const timeString = date.toLocaleTimeString();

        historyItem.innerHTML = `
          <div class="history__from">${fromUrl}</div>
          <div class="history__to">${toUrl}</div>
          <div class="history__time">${timeString}</div>
        `;

        this.elements.redirectHistory.appendChild(historyItem);
      });
    });
  }

  /**
   * Clear redirect history
   */
  clearRedirectHistory() {
    chrome.runtime.sendMessage({ action: "clearRedirectHistory" }, () => {
      this.loadRedirectHistory();
    });
  }

  /**
   * Export rules to a JSON file
   */
  exportRules() {
    const rulesJson = JSON.stringify(
      this.ruleManager.rules.map(rule => rule.toObject()),
      null,
      2
    );
    const blob = new Blob([rulesJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.download = "redirect-rules.json";
    link.href = url;
    link.click();

    this.showImportExportStatus("Rules exported successfully!", true);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * Import rules from a JSON file
   */
  importRules() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    fileInput.click();
    this.setupFileInputListeners(fileInput);
  }

  /**
   * Set up file input listeners for rule import
   */
  setupFileInputListeners(fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        return;
      }

      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          this.processImportedRules(e.target.result);
        } catch (error) {
          console.error("Error parsing imported rules:", error);
          this.showImportExportStatus(
            `Error importing rules: ${error.message}`,
            false
          );
        } finally {
          document.body.removeChild(fileInput);
        }
      };

      reader.onerror = () => {
        this.showImportExportStatus("Error reading file", false);
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

  /**
   * Process imported rules from JSON data
   */
  async processImportedRules(jsonData) {
    const importedRules = JSON.parse(jsonData);

    if (!Array.isArray(importedRules)) {
      this.showImportExportStatus(
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
      this.showImportExportStatus("No valid rules found in the file.", false);
      return;
    }

    // Add each valid rule to the rule manager
    validRules.forEach(ruleData => {
      const newRule = new RedirectRule(ruleData);
      this.ruleManager.rules.push(newRule);
    });

    await this.ruleManager.saveRules();
    this.displayRules();
    this.showImportExportStatus(
      `Successfully imported ${validRules.length} rules!`,
      true
    );
  }

  /**
   * Show import/export status message
   */
  showImportExportStatus(message, isSuccess) {
    const statusElement = document.createElement("div");
    statusElement.className = `import-export__status ${isSuccess ? "success" : "error"}`;
    statusElement.textContent = message;

    const container = this.elements.importRulesBtn.closest(".import-export");

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

  /**
   * Show diagnostic dialog with active rules
   */
  showDiagnosticDialog() {
    chrome.runtime.sendMessage({ action: "getActiveRules" }, (response) => {
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

      // Create a more stylish alert dialog using BEM classes
      const dialogContainer = document.createElement("div");
      dialogContainer.className = "dialog-overlay";

      const dialog = document.createElement("div");
      dialog.className = "dialog";

      const heading = document.createElement("h3");
      heading.className = "dialog__heading";
      heading.textContent = "Active Redirect Rules";

      const content = document.createElement("pre");
      content.className = "dialog__content";
      content.textContent = report;

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "Close";
      closeBtn.className = "btn dialog__btn";

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

  /**
   * Check active rules in the browser
   */
  checkActiveRules() {
    chrome.runtime.sendMessage({ action: "getActiveRules" }, (response) => {
      if (response.error) {
        this.elements.testUrlResult.innerHTML = `<div class="test-result error">${response.error}</div>`;
        this.elements.testUrlResult.style.display = "block";
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

          html += `<div class="rule-info">
            <strong class="rule-info__id">Rule ${rule.id}</strong>
            <div class="rule-info__detail">Pattern: ${pattern}</div>
            <div class="rule-info__detail">Redirect: ${redirect}</div>
          </div>`;
        });
      }

      html += "</div>";

      // Show in the test tab
      document.querySelector('.tab[data-tab="test"]').click();
      this.elements.testUrlResult.innerHTML = html;
      this.elements.testUrlResult.style.display = "block";
    });
  }

  /**
   * Test the current page URL
   */
  testCurrentPageUrl() {
    // Get current active tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        this.elements.testUrlInput.value = tabs[0].url;
        this.testUrl();
      } else {
        this.elements.testUrlResult.innerHTML =
          '<div class="test-result error">Could not get current tab URL</div>';
        this.elements.testUrlResult.style.display = "block";
      }
    });
  }

  /**
   * Test a URL against all rules
   */
  testUrl() {
    const url = this.elements.testUrlInput.value.trim();
    if (!url) {
      this.elements.testUrlResult.textContent = "Please enter a URL to test";
      this.elements.testUrlResult.className = "test-url__result error";
      this.elements.testUrlResult.classList.remove("hidden");
      return;
    }

    // Find matching rules
    const matchingRules = this.ruleManager.testUrl(url);

    // Display results
    if (matchingRules.length > 0) {
      let resultHTML = `<div class="test-url__result-header success">✅ URL will be redirected</div>`;

      matchingRules.forEach(({ rule, redirectUrl, index }) => {
        resultHTML += `
          <div class="test-url__result-item">
            <div class="test-url__result-rule">Rule #${index + 1}: ${this.extractDomain(rule.fromUrl)} → ${this.extractDomain(rule.toUrl)}</div>
            <div class="test-url__result-redirect">Redirects to: ${redirectUrl}</div>
          </div>
        `;
      });

      this.elements.testUrlResult.innerHTML = resultHTML;
      this.elements.testUrlResult.className = "test-url__result success";
    } else {
      this.elements.testUrlResult.textContent =
        "❌ No matching rules found. URL won't be redirected.";
      this.elements.testUrlResult.className = "test-url__result error";
    }

    this.elements.testUrlResult.classList.remove("hidden");
  }
}

/**
 * Main application class
 */
class RedirectApp {
  constructor(elements) {
    this.elements = elements;
    this.ruleManager = new RuleManager();
    this.ui = new PopupUI(elements, this.ruleManager);
  }

  /**
   * Initialize the application
   */
  async init() {
    await this.ruleManager.loadRules();
    this.elements.enableToggle.checked = this.ruleManager.enabled;
    await this.ui.init();
  }
}
