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
    this.section = data.section || "";
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
      section: this.section,
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
    this.sections = {}; // Track sections and their enabled state
  }

  /**
   * Load rules from storage
   * @returns {Promise} Promise that resolves when rules are loaded
   */
  async loadRules() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["redirectRules", "enabled", "sections"], (result) => {
        if (result.redirectRules && Array.isArray(result.redirectRules)) {
          this.rules = result.redirectRules.map(rule => new RedirectRule(rule));
        } else {
          this.rules = [];
        }

        this.enabled = result.enabled || false;
        this.sections = result.sections || {};
        
        // Initialize sections from rules if not already in storage
        this.rules.forEach(rule => {
          if (rule.section && !this.sections.hasOwnProperty(rule.section)) {
            this.sections[rule.section] = { enabled: true };
          }
        });
        
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
      chrome.storage.local.set({ redirectRules, sections: this.sections }, () => {
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
   * Get all unique sections
   * @returns {Array} Array of section names
   */
  getSections() {
    const sectionSet = new Set();
    this.rules.forEach(rule => {
      if (rule.section) {
        sectionSet.add(rule.section);
      }
    });
    return Array.from(sectionSet);
  }
  
  /**
   * Get rules for a specific section
   * @param {string} sectionName - Name of the section
   * @returns {Array} Array of rules in the section
   */
  getRulesBySection(sectionName) {
    return this.rules.filter(rule => rule.section === sectionName);
  }
  
  /**
   * Set section enabled state
   * @param {string} sectionName - Name of the section
   * @param {boolean} enabled - Whether the section is enabled
   */
  setSectionEnabled(sectionName, enabled) {
    if (!this.sections[sectionName]) {
      this.sections[sectionName] = { enabled: true };
    }
    this.sections[sectionName].enabled = enabled;
  }
  
  /**
   * Check if a section is enabled
   * @param {string} sectionName - Name of the section
   * @returns {boolean} Whether the section is enabled
   */
  isSectionEnabled(sectionName) {
    return this.sections[sectionName]?.enabled !== false;
  }
  
  /**
   * Enable or disable all rules in a section
   * @param {string} sectionName - Name of the section
   * @param {boolean} disabled - Whether to disable the rules
   */
  setRulesSectionDisabled(sectionName, disabled) {
    this.rules.forEach(rule => {
      if (rule.section === sectionName) {
        rule.disabled = disabled;
      }
    });
  }

  /**
   * Add a new rule
   * @returns {RedirectRule} The newly created rule
   */
  addRule() {
    const newRule = new RedirectRule();
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
    if (!this.enabled) {
      return [];
    }

    const matches = [];
    this.rules.forEach((rule, index) => {
      // Skip disabled rules or rules in disabled sections
      if (rule.disabled || (rule.section && !this.isSectionEnabled(rule.section))) {
        return;
      }

      const result = rule.testUrl(url);
      if (result.matches) {
        matches.push({
          rule,
          index,
          redirectUrl: result.redirectUrl
        });
      }
    });

    return matches;
  }
}

/**
 * Manages the popup UI
 */
class PopupUI {
  constructor(elements, ruleManager) {
    this.elements = elements;
    this.ruleManager = ruleManager;
    this.sectionsContainer = document.createElement('div');
    this.sectionsContainer.className = 'sections-container';
  }

  /**
   * Initialize the UI
   */
  async init() {
    await this.updateRedirectCount();
    this.setupEventListeners();
    this.setupTabs();
    
    // Insert sections container before rules container
    this.elements.rulesContainer.parentNode.insertBefore(
      this.sectionsContainer, 
      this.elements.rulesContainer
    );
    
    // Display sections and rules
    this.displaySections();
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

    // Add new section button
    const addSectionBtn = document.createElement("button");
    addSectionBtn.id = "addSectionBtn";
    addSectionBtn.className = "add-section";
    addSectionBtn.textContent = "+ Add New Section";
    addSectionBtn.addEventListener("click", () => this.addNewSection());
    
    // Insert the add section button before the add rule button
    this.elements.addRuleBtn.parentNode.insertBefore(
      addSectionBtn, 
      this.elements.addRuleBtn
    );

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

    // Tab navigation
    this.elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabId = tab.dataset.tab;
        this.activateTab(tabId);
      });
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

    // Group rules by section
    const rulesBySection = {};
    const rulesWithoutSection = [];

    this.ruleManager.rules.forEach((rule, index) => {
      if (rule.section) {
        if (!rulesBySection[rule.section]) {
          rulesBySection[rule.section] = [];
        }
        rulesBySection[rule.section].push({ rule, index });
      } else {
        rulesWithoutSection.push({ rule, index });
      }
    });

    // First display rules without a section
    rulesWithoutSection.forEach(({ rule, index }) => {
      const ruleElement = this.initializeRuleElement(rule, index);
      this.elements.rulesContainer.appendChild(ruleElement);
    });

    // Then display rules grouped by section
    Object.keys(rulesBySection).forEach(sectionName => {
      rulesBySection[sectionName].forEach(({ rule, index }) => {
        const ruleElement = this.initializeRuleElement(rule, index);
        this.elements.rulesContainer.appendChild(ruleElement);
      });
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
    
    // Add section attribute if rule has a section
    if (rule.section) {
      ruleElement.setAttribute("data-section", rule.section);
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

    // Add move to section button
    const moveToSectionBtn = document.createElement("button");
    moveToSectionBtn.className = "btn rule__section-btn";
    moveToSectionBtn.title = "Move to Section";
    moveToSectionBtn.innerHTML = '<i class="fas fa-folder"></i>';
    moveToSectionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showSectionSelectionDialog(index);
    });
    
    // Add the move to section button to the actions
    const actions = ruleElement.querySelector(".rule__actions");
    actions.insertBefore(moveToSectionBtn, toggleActiveBtn);

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
      collapseIcon.className = ruleElement.classList.contains("rule--collapsed")
        ? "fas fa-chevron-right"
        : "fas fa-chevron-down";
    });

    // Set up event listeners for the toggle and delete buttons
    toggleActiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleRuleActive(index);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteRule(index);
    });

    // Update the rule title
    this.updateRuleTitle(ruleElement, rule);

    return ruleElement;
  }

  /**
   * Set up advanced options for a rule
   */
  setupAdvancedOptions(ruleElement, rule, index) {
    const advancedBtn = ruleElement.querySelector(".advanced__btn");
    const advancedSections = ruleElement.querySelector(".advanced__sections");

    // Toggle advanced options visibility
    advancedBtn.addEventListener("click", () => {
      const isVisible = advancedSections.style.display !== "none";
      advancedSections.style.display = isVisible ? "none" : "block";
      advancedBtn.innerHTML = isVisible
        ? '<i class="fas fa-cog"></i> Advanced Options'
        : '<i class="fas fa-cog"></i> Hide Advanced Options';
    });

    // Set up name input
    const nameInput = document.createElement("div");
    nameInput.className = "rule__form-group";
    nameInput.innerHTML = `
      <label class="rule__label">Rule Name:</label>
      <input type="text" class="rule__input name-input" placeholder="Optional name for this rule" value="${
        rule.name || ""
      }" />
    `;
    advancedSections.insertBefore(nameInput, advancedSections.firstChild);

    // Set up section input
    const sectionInput = document.createElement("div");
    sectionInput.className = "rule__form-group";
    sectionInput.innerHTML = `
      <label class="rule__label">Section:</label>
      <input type="text" class="rule__input section-input" placeholder="Optional section name" value="${
        rule.section || ""
      }" />
      <p class="rule__hint">
        Group rules into sections. Disabling a section disables all rules in it.
      </p>
    `;
    advancedSections.insertBefore(sectionInput, advancedSections.children[1]);

    // Add event listeners for name and section inputs
    const nameInputElement = nameInput.querySelector(".name-input");
    nameInputElement.addEventListener("input", () => {
      this.updateRuleFromForm(index, ruleElement);
    });

    const sectionInputElement = sectionInput.querySelector(".section-input");
    sectionInputElement.addEventListener("input", () => {
      this.updateRuleFromForm(index, ruleElement);
    });

    // Set up resource types
    this.createResourceTypesSection(rule, advancedSections);

    // Set up test section
    this.createTestSection(ruleElement, rule, advancedSections);
  }

  /**
   * Create the resource types section for advanced options
   */
  createResourceTypesSection(rule, advancedSections) {
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
    advancedSections.appendChild(resourceTypesSection);
  }

  /**
   * Create the test section for advanced options
   */
  createTestSection(ruleElement, rule, advancedSections) {
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

    advancedSections.appendChild(testSection);

    // Set up test functionality
    const testInputElement = testInputGroup.querySelector(".test-section__input");
    const testBtnElement = testInputGroup.querySelector(".test-section__btn");
    this.setupTestFunctionality(ruleElement, rule, testInputElement, testBtnElement, testResult);
  }

  /**
   * Update a rule from form data
   */
  async updateRuleFromForm(index, ruleElement) {
    const fromUrlInput = ruleElement.querySelector(".from-url-input");
    const toUrlInput = ruleElement.querySelector(".to-url-input");
    const nameInput = ruleElement.querySelector(".name-input");
    const sectionInput = ruleElement.querySelector(".section-input");
    const resourceTypeCheckboxes = ruleElement.querySelectorAll(
      ".advanced__resource-types input[type='checkbox']"
    );

    const resourceTypes = Array.from(resourceTypeCheckboxes)
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);

    const data = {
      fromUrl: fromUrlInput.value,
      toUrl: toUrlInput.value,
      name: nameInput ? nameInput.value : "",
      section: sectionInput ? sectionInput.value : "",
      resourceTypes: resourceTypes,
    };

    this.ruleManager.updateRule(index, data);
    await this.ruleManager.saveRules();

    // Update the rule title
    const rule = this.ruleManager.rules[index];
    this.updateRuleTitle(ruleElement, rule);

    // If section changed, refresh sections display
    if (sectionInput && sectionInput.value !== rule.section) {
      this.displaySections();
    }
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
    
    // Check if the rule's section is enabled
    const sectionEnabled = !rule.section || this.ruleManager.isSectionEnabled(rule.section);
    const effectivelyEnabled = isEnabled && !rule.disabled && sectionEnabled;

    if (!effectivelyEnabled) {
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
        const rule = this.ruleManager.rules[ruleIndex];
        const sectionEnabled = !rule.section || this.ruleManager.isSectionEnabled(rule.section);
        this.updateRuleStatus(
          ruleElement,
          rule,
          this.ruleManager.enabled && sectionEnabled
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

      matchingRules.forEach(({ rule, redirectUrl }) => {
        resultHTML += `
          <div class="test-url__result-item">
            <div class="test-url__result-rule">Rule: ${this.extractDomain(rule.fromUrl)} → ${this.extractDomain(rule.toUrl)}</div>
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

  /**
   * Display all sections in the UI
   */
  displaySections() {
    this.sectionsContainer.innerHTML = "";
    
    const sections = this.ruleManager.getSections();
    
    if (sections.length === 0) {
      return;
    }
    
    sections.forEach(sectionName => {
      const sectionElement = this.createSectionElement(sectionName);
      this.sectionsContainer.appendChild(sectionElement);
    });
  }
  
  /**
   * Create a section element
   */
  createSectionElement(sectionName) {
    const sectionElement = document.createElement('div');
    sectionElement.className = 'section';
    sectionElement.setAttribute('data-section', sectionName);
    
    const isEnabled = this.ruleManager.isSectionEnabled(sectionName);
    if (!isEnabled) {
      sectionElement.setAttribute('data-disabled', 'true');
    }
    
    const header = document.createElement('div');
    header.className = 'section__header';
    
    const titleContainer = document.createElement('div');
    titleContainer.className = 'section__title-container';
    
    const statusIndicator = document.createElement('span');
    statusIndicator.className = `section__status ${isEnabled ? 'section__status--active' : 'section__status--inactive'}`;
    
    const title = document.createElement('h3');
    title.className = 'section__title';
    title.textContent = sectionName;
    
    const actions = document.createElement('div');
    actions.className = 'section__actions';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `btn section__toggle-btn ${!isEnabled ? 'section__toggle-btn--inactive' : ''}`;
    toggleBtn.title = 'Toggle Section Active State';
    toggleBtn.innerHTML = '<i class="fas fa-power-off"></i>';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn section__delete-btn';
    deleteBtn.title = 'Delete Section';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    
    // Add event listener for toggle button
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSectionActive(sectionName);
    });
    
    // Add event listener for delete button
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteSection(sectionName);
    });
    
    // Assemble the section element
    titleContainer.appendChild(statusIndicator);
    titleContainer.appendChild(title);
    
    actions.appendChild(toggleBtn);
    actions.appendChild(deleteBtn);
    
    header.appendChild(titleContainer);
    header.appendChild(actions);
    
    sectionElement.appendChild(header);
    
    return sectionElement;
  }
  
  /**
   * Toggle a section's active state
   */
  async toggleSectionActive(sectionName) {
    const isEnabled = this.ruleManager.isSectionEnabled(sectionName);
    this.ruleManager.setSectionEnabled(sectionName, !isEnabled);
    
    // Update UI
    const sectionElement = document.querySelector(`.section[data-section="${sectionName}"]`);
    if (sectionElement) {
      this.updateSectionStatus(sectionElement, !isEnabled);
    }
    
    // Update rule statuses
    this.updateAllRuleStatuses();
    
    // Save changes
    await this.ruleManager.saveRules();
  }
  
  /**
   * Update a section's status indicator
   */
  updateSectionStatus(sectionElement, isEnabled) {
    const statusIndicator = sectionElement.querySelector('.section__status');
    const toggleBtn = sectionElement.querySelector('.section__toggle-btn');
    
    if (!isEnabled) {
      statusIndicator.classList.remove('section__status--active');
      statusIndicator.classList.add('section__status--inactive');
      toggleBtn.classList.add('section__toggle-btn--inactive');
      sectionElement.setAttribute('data-disabled', 'true');
    } else {
      statusIndicator.classList.add('section__status--active');
      statusIndicator.classList.remove('section__status--inactive');
      toggleBtn.classList.remove('section__toggle-btn--inactive');
      sectionElement.removeAttribute('data-disabled');
    }
  }

  /**
   * Add a new section
   */
  async addNewSection() {
    // Prompt for section name
    const sectionName = prompt("Enter a name for the new section:");
    
    if (!sectionName || sectionName.trim() === "") {
      return;
    }
    
    // Check if section already exists
    const existingSections = this.ruleManager.getSections();
    if (existingSections.includes(sectionName)) {
      alert(`Section "${sectionName}" already exists.`);
      return;
    }
    
    // Create the section
    this.ruleManager.setSectionEnabled(sectionName, true);
    await this.ruleManager.saveRules();
    
    // Update the UI
    this.displaySections();
  }

  /**
   * Delete a section
   */
  async deleteSection(sectionName) {
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete the section "${sectionName}"?\n\nRules in this section will not be deleted, but they will no longer be in a section.`)) {
      return;
    }
    
    // Remove section from rules
    this.ruleManager.rules.forEach(rule => {
      if (rule.section === sectionName) {
        rule.section = "";
      }
    });
    
    // Remove section from sections object
    delete this.ruleManager.sections[sectionName];
    
    // Save changes
    await this.ruleManager.saveRules();
    
    // Update UI
    this.displaySections();
    this.displayRules();
  }

  /**
   * Move a rule to a different section
   */
  async moveRuleToSection(ruleIndex, sectionName) {
    const rule = this.ruleManager.rules[ruleIndex];
    if (!rule) return;
    
    // Update the rule's section
    rule.section = sectionName;
    
    // Save changes
    await this.ruleManager.saveRules();
    
    // Update UI
    this.displaySections();
    this.displayRules();
  }

  /**
   * Show section selection dialog for a rule
   */
  showSectionSelectionDialog(ruleIndex) {
    const rule = this.ruleManager.rules[ruleIndex];
    if (!rule) return;
    
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    
    // Create dialog content
    const heading = document.createElement('h3');
    heading.className = 'dialog__heading';
    heading.textContent = 'Select Section';
    
    const content = document.createElement('div');
    content.className = 'dialog__content';
    
    // Get all sections
    const sections = this.ruleManager.getSections();
    
    // Create section options
    const sectionOptions = document.createElement('div');
    sectionOptions.className = 'section-options';
    
    // Add "No Section" option
    const noSectionOption = document.createElement('div');
    noSectionOption.className = 'section-option';
    noSectionOption.innerHTML = `
      <label>
        <input type="radio" name="section" value="" ${!rule.section ? 'checked' : ''}>
        <span>No Section</span>
      </label>
    `;
    sectionOptions.appendChild(noSectionOption);
    
    // Add existing sections
    sections.forEach(sectionName => {
      const sectionOption = document.createElement('div');
      sectionOption.className = 'section-option';
      sectionOption.innerHTML = `
        <label>
          <input type="radio" name="section" value="${sectionName}" ${rule.section === sectionName ? 'checked' : ''}>
          <span>${sectionName}</span>
        </label>
      `;
      sectionOptions.appendChild(sectionOption);
    });
    
    // Add "Create New Section" option
    const newSectionOption = document.createElement('div');
    newSectionOption.className = 'section-option section-option--new';
    newSectionOption.innerHTML = `
      <label>
        <input type="radio" name="section" value="new">
        <span>Create New Section</span>
      </label>
      <input type="text" class="section-option__input" placeholder="New section name" style="display: none;">
    `;
    sectionOptions.appendChild(newSectionOption);
    
    // Add event listener for "Create New Section" option
    const newSectionRadio = newSectionOption.querySelector('input[type="radio"]');
    const newSectionInput = newSectionOption.querySelector('.section-option__input');
    
    newSectionRadio.addEventListener('change', () => {
      if (newSectionRadio.checked) {
        newSectionInput.style.display = 'block';
        newSectionInput.focus();
      }
    });
    
    // Add buttons
    const buttons = document.createElement('div');
    buttons.className = 'dialog__buttons';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn dialog__btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn dialog__btn btn--primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      const selectedOption = dialog.querySelector('input[name="section"]:checked');
      if (selectedOption) {
        let selectedSection = selectedOption.value;
        
        // Handle "Create New Section" option
        if (selectedSection === 'new') {
          const newSectionName = newSectionInput.value.trim();
          if (newSectionName) {
            // Check if section already exists
            if (sections.includes(newSectionName)) {
              alert(`Section "${newSectionName}" already exists.`);
              return;
            }
            
            // Create new section
            this.ruleManager.setSectionEnabled(newSectionName, true);
            selectedSection = newSectionName;
          } else {
            alert('Please enter a name for the new section.');
            return;
          }
        }
        
        // Move rule to selected section
        await this.moveRuleToSection(ruleIndex, selectedSection);
        
        // Close dialog
        document.body.removeChild(overlay);
      }
    });
    
    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    
    // Assemble dialog
    content.appendChild(sectionOptions);
    
    dialog.appendChild(heading);
    dialog.appendChild(content);
    dialog.appendChild(buttons);
    
    overlay.appendChild(dialog);
    
    // Add dialog to body
    document.body.appendChild(overlay);
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
