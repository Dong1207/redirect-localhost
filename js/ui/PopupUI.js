/**
 * PopupUI.js - Main UI controller for the popup
 */
import { RuleUI } from './RuleUI.js';
import { SectionUI } from './SectionUI.js';
import { HistoryUI } from './HistoryUI.js';
import { ImportExportUI } from './ImportExportUI.js';
import { URLUtils } from '../../utils.js';

/**
 * Manages the popup UI
 */
export class PopupUI {
  /**
   * Create a new PopupUI instance
   * @param {Object} elements - DOM elements
   * @param {Object} ruleManager - Rule manager
   */
  constructor(elements, ruleManager) {
    this.elements = elements;
    this.ruleManager = ruleManager;
    
    // Create event handlers for rules
    this.ruleHandlers = {
      updateRuleFromForm: this.updateRuleFromForm.bind(this),
      toggleRuleActive: this.toggleRuleActive.bind(this),
      deleteRule: this.deleteRule.bind(this),
      makeRuleTitleEditable: this.makeRuleTitleEditable.bind(this)
    };
    
    // Create event handlers for sections
    this.sectionHandlers = {
      addNewRuleToSection: this.addNewRuleToSection.bind(this),
      toggleSectionActive: this.toggleSectionActive.bind(this),
      editSectionName: this.editSectionName.bind(this),
      deleteSection: this.deleteSection.bind(this),
      makeElementEditable: this.makeElementEditable.bind(this)
    };
  }

  /**
   * Initialize the UI
   */
  async init() {
    await this.updateRedirectCount();
    this.setupEventListeners();
    this.setupTabs();
    this.displaySections();
    this.loadRedirectHistory();
  }

  /**
   * Set up event listeners for UI elements
   */
  setupEventListeners() {
    // Main controls
    this.elements.enableToggle.addEventListener("change", () =>
      this.toggleRedirect()
    );
    
    this.elements.addSectionBtn.addEventListener("click", () =>
      this.addNewSection()
    );
    
    this.elements.debugBtn.addEventListener("click", () =>
      this.toggleDebugPanel()
    );


    // Debug panel event listeners
    this.elements.clearHistoryBtn.addEventListener("click", () =>
      this.clearRedirectHistory()
    );

    this.elements.exportRulesBtn.addEventListener("click", () => {
      const container = this.elements.importRulesBtn.closest(".import-export");
      ImportExportUI.exportRules(this.ruleManager.rules, container);
    });

    this.elements.importRulesBtn.addEventListener("click", () => {
      const container = this.elements.importRulesBtn.closest(".import-export");

      ImportExportUI.importRules(async (importedRules, error) => {
        if (error) {
          ImportExportUI.showStatus(
            `Error importing rules: ${error.message}`,
            false,
            container
          );
          return;
        }

        if (!importedRules || importedRules.length === 0) {
          ImportExportUI.showStatus(
            "No valid rules found in the file.",
            false,
            container
          );
          return;
        }

        const duplicates = [];
        const newRules = [];

        importedRules.forEach((rule) => {
          const index = this.ruleManager.findRule(rule);
          if (index !== -1) duplicates.push({rule, index});
          else newRules.push(rule);
        });

        let updatedCount = 0;
        let overwrite = true;
        if (duplicates.length > 0) {
          overwrite = confirm(
            `Found ${duplicates.length} rule${duplicates.length > 1 ? 's' : ''} with the same name. Overwrite existing?`
          );
          if (overwrite) {
            duplicates.forEach(({rule, index}) => {
              this.ruleManager.updateRule(index, rule);
              updatedCount++;
            });
          }
        }

        newRules.forEach((rule) => this.ruleManager.rules.push(rule));

        const appliedRules = overwrite
          ? newRules.concat(duplicates.map((d) => d.rule))
          : newRules;

        appliedRules.forEach((rule) => {
          if (!this.ruleManager.sections[rule.section]) {
            this.ruleManager.sections[rule.section] = {enabled: true};
          }
        });

        await this.ruleManager.saveRules();
        this.displaySections();

        const addedCount = newRules.length;
        const messages = [];
        if (addedCount)
          messages.push(`${addedCount} new rule${addedCount > 1 ? 's' : ''} added`);
        if (updatedCount)
          messages.push(`${updatedCount} rule${updatedCount > 1 ? 's' : ''} updated`);

        ImportExportUI.showStatus(
          messages.length
            ? `Successfully imported ${messages.join(' and ')}.`
            : 'No new rules were imported.',
          true,
          container
        );
      });
    });
    
    // Debug toggle setup
    chrome.storage.local.get(["debugToPage"], (result) => {
      this.elements.debugToPageToggle.checked = result.debugToPage === true;
    });
    
    this.elements.debugToPageToggle.addEventListener("change", () => {
      const enabled = this.elements.debugToPageToggle.checked;
      chrome.runtime.sendMessage(
        {action: "toggleDebugToPage", enabled},
        (response) => {
          if (
            response?.debugEnabled !== undefined &&
            response.debugEnabled !== enabled
          ) {
            this.elements.debugToPageToggle.checked = response.debugEnabled;
          }
        }
      );
      chrome.storage.local.set({debugToPage: enabled});
    });
  }

  /**
   * Set up tab navigation
   */
  setupTabs() {
    // Create a mapping of tab IDs to content elements
    const tabMapping = {
      history: document.getElementById("historyTab"),
      tools: document.getElementById("toolsTab"),
    };

    this.elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabId = tab.getAttribute("data-tab");
        
        // Update active tab
        this.elements.tabs.forEach((t) =>
          t.classList.remove("debug__tab--active")
        );
        tab.classList.add("debug__tab--active");

        // Update active content
        this.elements.tabContents.forEach((content) => {
          content.classList.remove("debug__content--active");
        });

        // Find the corresponding content element and make it active
        const contentElement = tabMapping[tabId];
        if (contentElement) {
          contentElement.classList.add("debug__content--active");
        }
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
   * Update the redirect count display
   */
  async updateRedirectCount() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["redirectCount"], (result) => {
        this.elements.redirectCountElem.textContent = result.redirectCount || 0;
        chrome.runtime.sendMessage({action: "getRedirectCount"}, (response) => {
          if (response?.count !== undefined) {
            this.elements.redirectCountElem.textContent = response.count;
          }
          resolve();
        });
      });
    });
  }

  /**
   * Display all sections in the UI
   */
  displaySections() {
    const sectionsContainer = this.elements.rulesContainer;
    
    // Remove all existing sections
    const existingSections = sectionsContainer.querySelectorAll(".section");
    existingSections.forEach((section) => section.remove());
    
    // Get all sections
    const sections = this.ruleManager.getSections();
    
    // If no sections exist, create a default section
    if (sections.length === 0) {
      this.ruleManager.setSectionEnabled("Default", true);
      this.ruleManager.saveRules();
      sections.push("Default");
    }
    
    // Display sections with their rules
    sections.forEach((sectionName) => {
      const isEnabled = this.ruleManager.isSectionEnabled(sectionName);
      const sectionElement = SectionUI.createSectionElement(
        sectionName, 
        isEnabled, 
        this.sectionHandlers
      );
      
      // Get the rules container for this section
      const rulesContainer = sectionElement.querySelector(".section__rules");
      
      // Display rules for this section
      SectionUI.displayRulesForSection(
        sectionName,
        rulesContainer,
        this.ruleManager.rules,
        this.elements.ruleTemplate,
        this.ruleHandlers
      );
      
      sectionsContainer.appendChild(sectionElement);
    });
    
    // Update all rule statuses
    this.updateAllRuleStatuses();
  }

  /**
   * Update a rule from form data
   */
  async updateRuleFromForm(index, ruleElement) {
    const fromUrlInput = ruleElement.querySelector(".from-url-input");
    const toUrlInput = ruleElement.querySelector(".to-url-input");
    const fromUrl = fromUrlInput.value.trim();
    const toUrl = toUrlInput.value.trim();
    
    // Remove any existing error styling
    fromUrlInput.classList.remove("rule__input--error");
    toUrlInput.classList.remove("rule__input--error");
    RuleUI.removeValidationError(fromUrlInput);
    RuleUI.removeValidationError(toUrlInput);
    
    const data = {fromUrl, toUrl};
    
    // Check if URLs are valid
    const isFromUrlValid = URLUtils.isValidRedirectUrl(fromUrl);
    const isToUrlValid = URLUtils.isValidRedirectUrl(toUrl);
    
    // If either URL is invalid, disable the rule
    if (!isFromUrlValid || !isToUrlValid) data.disabled = true;
    
    this.ruleManager.updateRule(index, data);
    await this.ruleManager.saveRules();
    
    const rule = this.ruleManager.rules[index];
    RuleUI.updateRuleTitle(ruleElement, rule);
    
    // Update rule status after changing URLs
    const sectionEnabled =
      !rule.section || this.ruleManager.isSectionEnabled(rule.section);
    RuleUI.updateRuleStatus(
      ruleElement,
      rule,
      this.ruleManager.enabled && sectionEnabled,
      sectionEnabled
    );
  }

  /**
   * Delete a rule
   */
  async deleteRule(index) {
    this.ruleManager.deleteRule(index);
    await this.ruleManager.saveRules();
    this.displaySections();
  }

  /**
   * Toggle a rule's active state
   */
  async toggleRuleActive(index) {
    const rule = this.ruleManager.rules[index];
    if (!rule) return;
    
    // Toggle the disabled state
    rule.disabled = !rule.disabled;
    
    // Save changes first
    await this.ruleManager.saveRules();
    
    // Update UI after saving
    const ruleElement = document.querySelector(`.rule[data-index="${index}"]`);
    if (ruleElement) {
      const sectionEnabled =
        !rule.section || this.ruleManager.isSectionEnabled(rule.section);
      
      // Add a visual feedback effect when toggling
      const toggleBtn = ruleElement.querySelector(".rule__toggle-btn");
      const statusIndicator = ruleElement.querySelector(".rule__status");
      
      if (toggleBtn) {
        // Add a quick flash effect
        toggleBtn.classList.add("button-flash");
        setTimeout(() => {
          toggleBtn.classList.remove("button-flash");
        }, 300);
        
        // Update toggle button state immediately
        if (rule.disabled) {
          toggleBtn.classList.add("rule__toggle-btn--inactive");
        } else {
          toggleBtn.classList.remove("rule__toggle-btn--inactive");
        }
      }
      
      if (statusIndicator) {
        // Update status indicator immediately
        if (this.ruleManager.enabled && !rule.disabled && sectionEnabled) {
          statusIndicator.classList.remove("rule__status--inactive");
          statusIndicator.classList.add("rule__status--active");
          statusIndicator.title = "Rule is active";
        } else {
          statusIndicator.classList.remove("rule__status--active");
          statusIndicator.classList.add("rule__status--inactive");
          
          if (rule.disabled) {
            statusIndicator.title = "Rule is disabled";
          } else if (!sectionEnabled) {
            statusIndicator.title = "Section is disabled";
          } else if (!this.ruleManager.enabled) {
            statusIndicator.title = "Redirect is globally disabled";
          }
        }
      }
      
      // Also update the full rule status
      RuleUI.updateRuleStatus(
        ruleElement,
        rule,
        this.ruleManager.enabled && sectionEnabled,
        sectionEnabled
      );
      
      // Update rule element data attribute
      if (rule.disabled) {
        ruleElement.setAttribute("data-disabled", "true");
      } else {
        ruleElement.removeAttribute("data-disabled");
      }
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
        const sectionEnabled =
          !rule.section || this.ruleManager.isSectionEnabled(rule.section);
        RuleUI.updateRuleStatus(
          ruleElement,
          rule,
          this.ruleManager.enabled && sectionEnabled,
          sectionEnabled
        );
      }
    });
  }

  /**
   * Make a rule title editable
   */
  makeRuleTitleEditable(ruleTitle, rule, index) {
    RuleUI.makeRuleTitleEditable(
      ruleTitle, 
      rule, 
      index, 
      async () => await this.ruleManager.saveRules()
    );
  }

  /**
   * Toggle a section's active state
   */
  async toggleSectionActive(sectionName) {
    const isEnabled = this.ruleManager.isSectionEnabled(sectionName);
    this.ruleManager.setSectionEnabled(sectionName, !isEnabled);
    
    // Update UI
    const sectionElement = document.querySelector(
      `.section[data-section="${sectionName}"]`
    );
    if (sectionElement) {
      SectionUI.updateSectionStatus(sectionElement, !isEnabled);
    }
    
    // Update rule statuses
    this.updateAllRuleStatuses();
    
    // Save changes
    await this.ruleManager.saveRules();
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
      sectionName = `New Section ${counter++}`;
    }
    
    // Create the section
    this.ruleManager.setSectionEnabled(sectionName, true);
    
    // Add a default rule to the section
    const newRuleIndex = this.ruleManager.addRule();
    this.ruleManager.rules[newRuleIndex].section = sectionName;
    this.ruleManager.rules[newRuleIndex].name = "New Rule";
    
    // Save changes
    await this.ruleManager.saveRules();
    
    // Update the UI
    this.displaySections();
    
    // Find the newly created section element and make the title editable
    setTimeout(() => {
      const sectionElements = document.querySelectorAll(".section");
      for (const element of sectionElements) {
        if (element.getAttribute("data-section") === sectionName) {
          const titleElement = element.querySelector(".section__title");
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
    // Get all sections
    const sections = this.ruleManager.getSections();
    
    // If this is the only section, don't allow deletion
    if (sections.length === 1) {
      alert("Cannot delete the only section. At least one section must exist.");
      return;
    }
    
    // Get rules in this section
    const rulesInSection = this.ruleManager.rules.filter(
      (rule) => rule.section === sectionName
    );
    
    // Confirm deletion with a single modal that includes rule count
    let confirmMessage = `Are you sure you want to delete the section "${sectionName}"`;
    if (rulesInSection.length > 0) {
      confirmMessage += ` and ${rulesInSection.length} rule(s) in it`;
    }
    confirmMessage += "?";
    
    if (!confirm(confirmMessage)) return;
    
    // Remove all rules in this section
    this.ruleManager.rules = this.ruleManager.rules.filter(
      (rule) => rule.section !== sectionName
    );
    
    // Remove section from sections object
    delete this.ruleManager.sections[sectionName];
    
    // Save changes
    await this.ruleManager.saveRules();
    
    // Update UI
    this.displaySections();
  }

  /**
   * Edit section name
   */
  async editSectionName(sectionName) {
    // Find the section element
    const sectionElements = document.querySelectorAll(".section");
    for (const element of sectionElements) {
      if (element.getAttribute("data-section") === sectionName) {
        const titleElement = element.querySelector(".section__title");
        this.makeElementEditable(titleElement, sectionName);
        break;
      }
    }
  }

  /**
   * Make an element editable inline
   */
  makeElementEditable(element, sectionName) {
    SectionUI.makeElementEditable(
      element, 
      sectionName, 
      async (newName) => {
        // Check if section already exists
        const existingSections = this.ruleManager.getSections();
        if (existingSections.includes(newName)) {
          alert(`Section "${newName}" already exists.`);
          return false;
        }
        
        // Update section name in rules
        this.ruleManager.rules.forEach((rule) => {
          if (rule.section === sectionName) rule.section = newName;
        });
        
        // Update section name in sections object
        if (this.ruleManager.sections[sectionName] !== undefined) {
          const sectionState = this.ruleManager.sections[sectionName];
          this.ruleManager.sections[newName] = sectionState;
          delete this.ruleManager.sections[sectionName];
        }
        
        // Save changes
        await this.ruleManager.saveRules();
        
        // Update UI
        this.displaySections();
        
        return true;
      }
    );
  }

  /**
   * Add a new rule to a specific section
   */
  async addNewRuleToSection(sectionName) {
    // Create a new rule with default valid URLs
    const newRuleIndex = this.ruleManager.addRule();
    
    // Set the section for this rule and default valid URLs
    const rule = this.ruleManager.rules[newRuleIndex];
    rule.section = sectionName;
    rule.fromUrl = "https://example.com/**";
    rule.toUrl = "http://localhost:3000/**";
    
    // Save the rules
    await this.ruleManager.saveRules();
    
    // Refresh the sections display
    this.displaySections();
  }

  /**
   * Toggle debug panel visibility
   */
  toggleDebugPanel() {
    const wasHidden = this.elements.debugPanel.classList.contains("hidden");
    this.elements.debugPanel.classList.toggle("hidden");

    // If the panel is now visible (was previously hidden)
    if (wasHidden) {
      this.loadRedirectHistory();

      // Create a mapping of tab IDs to content elements
      const tabMapping = {
        history: document.getElementById("historyTab"),
        tools: document.getElementById("toolsTab"),
      };

      // Make sure the first tab (history) is active
      const historyTab = this.elements.tabs[0];
      const toolsTab = this.elements.tabs[1];

      if (historyTab && toolsTab) {
        // Activate history tab
        historyTab.classList.add("debug__tab--active");
        toolsTab.classList.remove("debug__tab--active");

        // Activate history content
        if (tabMapping.history && tabMapping.tools) {
          tabMapping.history.classList.add("debug__content--active");
          tabMapping.tools.classList.remove("debug__content--active");
        }
      }
    }
  }

  /**
   * Load redirect history
   */
  loadRedirectHistory() {
    HistoryUI.loadRedirectHistory(this.elements.redirectHistory);
  }

  /**
   * Clear redirect history
   */
  clearRedirectHistory() {
    HistoryUI.clearRedirectHistory(this.elements.redirectHistory);
  }
}
}