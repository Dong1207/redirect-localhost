document.addEventListener("DOMContentLoaded", () => {
  // Cache DOM elements for better performance
  const elements = {
    enableToggle: document.getElementById("enableToggle"),
    redirectCountElem: document.getElementById("redirectCount"),
    rulesContainer: document.getElementById("rulesContainer"),
    ruleTemplate: document.getElementById("ruleTemplate"),
    debugBtn: document.getElementById("debugBtn"),
    debugPanel: document.getElementById("debugPanel"),
    debugToPageToggle: document.getElementById("debugToPageToggle"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    exportRulesBtn: document.getElementById("exportRulesBtn"),
    importRulesBtn: document.getElementById("importRulesBtn"),
    tabs: document.querySelectorAll(".debug__tab"),
    tabContents: document.querySelectorAll(".debug__content"),
    redirectHistory: document.getElementById("redirectHistory"),
    toolsTab: document.getElementById("toolsTab"),
    addSectionBtn: document.getElementById("addSectionBtn"),
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
    return this.rules.length - 1; // Return the index of the new rule
  }

  /**
   * Update a rule with new data
   * @param {number} index - Rule index
   * @param {object} data - New rule data
   */
  updateRule(index, data) {
    if (index >= 0 && index < this.rules.length) {
      const rule = this.rules[index];
      Object.assign(rule, data);
      return true;
    }
    return false;
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
  }

  /**
   * Initialize the UI
   */
  async init() {
    await this.updateRedirectCount();
    this.setupEventListeners();
    this.setupTabs();
    
    // Display sections (which will contain rules)
    this.displaySections();
    this.loadRedirectHistory();
  }

  /**
   * Set up event listeners for UI elements
   */
  setupEventListeners() {
    // Main controls
    this.elements.enableToggle.addEventListener("change", () => this.toggleRedirect());
    this.elements.addSectionBtn.addEventListener("click", () => this.addNewSection());
    this.elements.debugBtn.addEventListener("click", () => this.toggleDebugPanel());

    // Debug panel event listeners
    this.elements.clearHistoryBtn.addEventListener("click", () => this.clearRedirectHistory());
    this.elements.exportRulesBtn.addEventListener("click", () => this.exportRules());
    this.elements.importRulesBtn.addEventListener("click", () => this.importRules());
    
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
    // Check if there are any sections
    const sections = this.ruleManager.getSections();
    
    if (sections.length === 0) {
      // Create a default section
      this.ruleManager.setSectionEnabled('Default', true);
      await this.ruleManager.saveRules();
      
      // Add the rule to the default section
      await this.addNewRuleToSection('Default');
    } else {
      // Add the rule to the first section
      await this.addNewRuleToSection(sections[0]);
    }
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
    const toggleActiveBtn = ruleElement.querySelector(".rule__toggle-btn");
    const deleteBtn = ruleElement.querySelector(".rule__delete-btn");
    const header = ruleElement.querySelector(".rule__header");

    // Ensure the rule is collapsed by default
    ruleElement.classList.add("rule--collapsed");
    const collapseIcon = ruleElement.querySelector(".rule__collapse-icon i");
    collapseIcon.className = "fas fa-chevron-right";

    // Add double-click event to make rule title editable
    const ruleTitle = ruleElement.querySelector(".rule__title");
    ruleTitle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.makeRuleTitleEditable(ruleTitle, rule, index);
    });
    
    // Add CSS to indicate it's editable
    ruleTitle.style.cursor = 'pointer';
    ruleTitle.title = 'Double-click to edit';

    // Set initial values
    fromUrlInput.value = rule.fromUrl || "";
    toUrlInput.value = rule.toUrl || "";

    // Set up input event listeners
    fromUrlInput.addEventListener("input", () => this.updateRuleFromForm(index, ruleElement));
    toUrlInput.addEventListener("input", () => this.updateRuleFromForm(index, ruleElement));

    // Set up toggle and delete buttons
    toggleActiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleRuleActive(index);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteRule(index);
    });

    // Toggle collapse on header click
    header.addEventListener("click", () => {
      ruleElement.classList.toggle("rule--collapsed");
      collapseIcon.className = ruleElement.classList.contains("rule--collapsed")
        ? "fas fa-chevron-right"
        : "fas fa-chevron-down";
    });

    // Update rule status
    this.updateRuleStatus(ruleElement, rule, !rule.disabled);
    
    // Update rule title
    this.updateRuleTitle(ruleElement, rule);

    return ruleElement;
  }

  /**
   * Update a rule from form data
   */
  async updateRuleFromForm(index, ruleElement) {
    const fromUrlInput = ruleElement.querySelector(".from-url-input");
    const toUrlInput = ruleElement.querySelector(".to-url-input");

    const data = {
      fromUrl: fromUrlInput.value,
      toUrl: toUrlInput.value,
    };

    this.ruleManager.updateRule(index, data);
    await this.ruleManager.saveRules();
    
    const rule = this.ruleManager.rules[index];
    this.updateRuleTitle(ruleElement, rule);
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
        const dateTimeString = date.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        historyItem.innerHTML = `
          <div class="history__from"><strong>From:</strong> ${fromUrl}</div>
          <div class="history__to"><strong>To:</strong> ${toUrl}</div>
          <div class="history__time"><strong>Time:</strong> ${dateTimeString}</div>
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
   * Process imported rules
   */
  async processImportedRules(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      let rules = Array.isArray(data) ? data : data.rules || [];

      // Validate rules
      const validRules = rules.filter(
        (rule) =>
        typeof rule === "object" &&
        typeof rule.fromUrl === "string" &&
        typeof rule.toUrl === "string"
      );

      if (validRules.length === 0) {
        this.showImportExportStatus("No valid rules found in the file.", false);
        return;
      }

      // Clear existing rules
      this.ruleManager.rules = [];

      // Add imported rules
      validRules.forEach(rule => {
        const newRule = new RedirectRule(rule);
        this.ruleManager.rules.push(newRule);
      });

      // Save to storage
      await this.ruleManager.saveRules();

      // Update UI
      this.displayRules();

      // Show success message
      this.showImportExportStatus(
        `Successfully imported ${validRules.length} rules.`,
        true
      );
    } catch (error) {
      console.error("Error parsing imported rules:", error);
      this.showImportExportStatus(
        "Error importing rules. Please check the file format.",
        false
      );
    }
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
   * Display all sections in the UI
   */
  displaySections() {
    this.elements.rulesContainer.innerHTML = "";
    
    const sections = this.ruleManager.getSections();
    
    if (sections.length === 0) {
      return;
    }
    
    sections.forEach(sectionName => {
      const sectionElement = this.createSectionElement(sectionName);
      this.elements.rulesContainer.appendChild(sectionElement);
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
    
    // Add collapse icon
    const collapseIcon = document.createElement('span');
    collapseIcon.className = 'section__collapse-icon';
    collapseIcon.innerHTML = '<i class="fas fa-chevron-down"></i>';
    
    const statusIndicator = document.createElement('span');
    statusIndicator.className = `section__status ${isEnabled ? 'section__status--active' : 'section__status--inactive'}`;
    
    const title = document.createElement('h3');
    title.className = 'section__title';
    title.textContent = sectionName;
    
    // Add double-click event to make title editable
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.makeElementEditable(title, sectionName);
    });
    
    // Add CSS to indicate it's editable
    title.style.cursor = 'pointer';
    title.title = 'Double-click to edit';
    
    const actions = document.createElement('div');
    actions.className = 'section__actions';
    
    // Create Add Rule button
    const addRuleBtn = document.createElement('button');
    addRuleBtn.className = 'btn section__add-rule-btn';
    addRuleBtn.title = 'Add New Rule';
    addRuleBtn.innerHTML = '<i class="fas fa-plus"></i>';
    addRuleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.addNewRuleToSection(sectionName);
    });
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `btn section__toggle-btn ${!isEnabled ? 'section__toggle-btn--inactive' : ''}`;
    toggleBtn.title = 'Toggle Section Active State';
    toggleBtn.innerHTML = '<i class="fas fa-power-off"></i>';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn section__edit-btn';
    editBtn.title = 'Edit Section Name';
    editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn section__delete-btn';
    deleteBtn.title = 'Delete Section';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    
    // Add event listener for toggle button
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSectionActive(sectionName);
    });
    
    // Add event listener for edit button
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editSectionName(sectionName);
    });
    
    // Add event listener for delete button
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteSection(sectionName);
    });
    
    // Assemble the section element
    titleContainer.appendChild(collapseIcon);
    titleContainer.appendChild(statusIndicator);
    titleContainer.appendChild(title);
    
    actions.appendChild(addRuleBtn);
    actions.appendChild(toggleBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    
    header.appendChild(titleContainer);
    header.appendChild(actions);
    
    // Add click event to header for collapsing/expanding
    header.addEventListener('click', () => {
      sectionElement.classList.toggle('section--collapsed');
      const icon = collapseIcon.querySelector('i');
      if (sectionElement.classList.contains('section--collapsed')) {
        icon.className = 'fas fa-chevron-right';
      } else {
        icon.className = 'fas fa-chevron-down';
      }
      
      // Save collapse state to localStorage
      const isCollapsed = sectionElement.classList.contains('section--collapsed');
      localStorage.setItem(`section_${sectionName}_collapsed`, isCollapsed);
    });
    
    // Check if section was previously collapsed
    const wasCollapsed = localStorage.getItem(`section_${sectionName}_collapsed`) === 'true';
    if (wasCollapsed) {
      sectionElement.classList.add('section--collapsed');
      collapseIcon.querySelector('i').className = 'fas fa-chevron-right';
    }
    
    sectionElement.appendChild(header);
    
    // Create a container for rules in this section
    const rulesContainer = document.createElement('div');
    rulesContainer.className = 'section__rules';
    sectionElement.appendChild(rulesContainer);
    
    // Display rules for this section
    this.displayRulesForSection(sectionName, rulesContainer);
    
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
   * Add a new section with a default rule
   */
  async addNewSection() {
    // Create a default section name
    let sectionName = "New Section";
    let counter = 1;
    
    // Check if section already exists and generate a unique name
    const existingSections = this.ruleManager.getSections();
    while (existingSections.includes(sectionName)) {
      sectionName = `New Section ${counter}`;
      counter++;
    }
    
    // Create the section
    this.ruleManager.setSectionEnabled(sectionName, true);
    
    // Add a default rule to the section
    const newRuleIndex = this.ruleManager.addRule();
    this.ruleManager.rules[newRuleIndex].section = sectionName;
    this.ruleManager.rules[newRuleIndex].name = "Default Rule";
    
    // Save changes
    await this.ruleManager.saveRules();
    
    // Update the UI
    this.displaySections();
    
    // Find the newly created section element and make the title editable
    setTimeout(() => {
      const sectionElements = document.querySelectorAll('.section');
      for (const element of sectionElements) {
        if (element.getAttribute('data-section') === sectionName) {
          const titleElement = element.querySelector('.section__title');
          this.makeElementEditable(titleElement, sectionName);
          break;
        }
      }
    }, 100);
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
   * Display rules for a specific section
   */
  displayRulesForSection(sectionName, container) {
    // Get rules for this section
    const rulesForSection = this.ruleManager.rules.filter((rule, index) => 
      rule.section === sectionName
    );
    
    // Display each rule
    rulesForSection.forEach((rule, i) => {
      // Find the actual index in the full rules array
      const index = this.ruleManager.rules.findIndex(r => r === rule);
      const ruleElement = this.initializeRuleElement(rule, index);
      container.appendChild(ruleElement);
    });
  }

  /**
   * Add a new rule to a specific section
   */
  async addNewRuleToSection(sectionName) {
    // Create a new rule
    const newRuleIndex = this.ruleManager.addRule();
    
    // Set the section for this rule
    this.ruleManager.rules[newRuleIndex].section = sectionName;
    
    // Save the rules
    await this.ruleManager.saveRules();
    
    // Refresh the sections display
    this.displaySections();
  }

  /**
   * Edit section name
   */
  async editSectionName(sectionName) {
    // Find the section element
    const sectionElements = document.querySelectorAll('.section');
    for (const element of sectionElements) {
      if (element.getAttribute('data-section') === sectionName) {
        const titleElement = element.querySelector('.section__title');
        this.makeElementEditable(titleElement, sectionName);
        break;
      }
    }
  }

  /**
   * Make an element editable inline
   * @param {HTMLElement} element - The element to make editable
   * @param {string} sectionName - The current section name
   */
  makeElementEditable(element, sectionName) {
    // Store the original text
    const originalText = element.textContent;
    
    // Make the element editable
    element.contentEditable = true;
    element.focus();
    
    // Select all text
    document.execCommand('selectAll', false, null);
    
    // Add event listeners for saving changes
    const saveChanges = async () => {
      element.contentEditable = false;
      const newName = element.textContent.trim();
      
      // If empty, revert to original
      if (!newName) {
        element.textContent = originalText;
        return;
      }
      
      // If unchanged, do nothing
      if (newName === sectionName) {
        return;
      }
      
      // Check if section already exists
      const existingSections = this.ruleManager.getSections();
      if (existingSections.includes(newName)) {
        alert(`Section "${newName}" already exists.`);
        element.textContent = originalText;
        return;
      }
      
      // Update section name
      this.ruleManager.rules.forEach(rule => {
        if (rule.section === sectionName) {
          rule.section = newName;
        }
      });
      
      // Save changes
      await this.ruleManager.saveRules();
      
      // Update UI
      this.displaySections();
    };
    
    // Save on blur
    element.addEventListener('blur', saveChanges, { once: true });
    
    // Save on Enter key
    element.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await saveChanges();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        element.contentEditable = false;
        element.textContent = originalText;
      }
    });
  }

  /**
   * Make a rule title editable
   */
  makeRuleTitleEditable(ruleTitle, rule, index) {
    // Store the original text and rule name
    const originalText = ruleTitle.textContent;
    const originalName = rule.name || "";
    
    // Make the rule title editable
    ruleTitle.contentEditable = true;
    ruleTitle.focus();
    
    // Select all text
    document.execCommand('selectAll', false, null);
    
    // Add event listeners for saving changes
    const saveChanges = async () => {
      ruleTitle.contentEditable = false;
      const newName = ruleTitle.textContent.trim();
      
      // If empty, revert to original display
      if (!newName) {
        rule.name = "";
        this.updateRuleTitle(ruleTitle.closest('.rule'), rule);
        return;
      }
      
      // If unchanged, do nothing
      if (newName === originalName) {
        return;
      }
      
      // Update rule name
      rule.name = newName;
      
      // Save changes
      await this.ruleManager.saveRules();
      
      // Update UI
      this.updateRuleTitle(ruleTitle.closest('.rule'), rule);
    };
    
    // Save on blur
    ruleTitle.addEventListener('blur', saveChanges, { once: true });
    
    // Save on Enter key
    ruleTitle.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await saveChanges();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        ruleTitle.contentEditable = false;
        ruleTitle.textContent = originalText;
      }
    });
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
