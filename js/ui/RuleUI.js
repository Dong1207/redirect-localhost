/**
 * RuleUI.js - UI components for managing rules
 */
import { DOM, URLUtils } from '../../utils.js';

/**
 * Handles UI operations for individual rules
 */
export class RuleUI {
  /**
   * Create a rule element
   * @param {HTMLTemplateElement} template - Rule template
   * @param {Object} rule - Rule data
   * @param {number} index - Rule index
   * @returns {HTMLElement} Rule element
   */
  static createRuleElement(template, rule, index) {
    const clone = document.importNode(template.content, true);
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
   * @param {HTMLElement} ruleElement - Rule element
   * @param {Object} rule - Rule data
   * @param {number} index - Rule index
   * @param {Object} handlers - Event handlers
   * @returns {HTMLElement} Initialized rule element
   */
  static initializeRuleElement(ruleElement, rule, index, handlers) {
    // Get form elements
    const fromUrlInput = ruleElement.querySelector(".from-url-input");
    const toUrlInput = ruleElement.querySelector(".to-url-input");
    const editBtn = ruleElement.querySelector(".rule__edit-btn");
    const toggleActiveBtn = ruleElement.querySelector(".rule__toggle-btn");
    const deleteBtn = ruleElement.querySelector(".rule__delete-btn");
    const header = ruleElement.querySelector(".rule__header");
    
    // Ensure the rule is collapsed by default
    ruleElement.classList.add("rule--collapsed");
    const collapseIcon = ruleElement.querySelector(".rule__collapse-icon i");
    collapseIcon.className = "fas fa-chevron-right";
    
    // Add double-click event to make rule title editable
    const ruleTitle = ruleElement.querySelector(".rule__title");
    ruleTitle.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      handlers.makeRuleTitleEditable(ruleTitle, rule, index);
    });
    
    // Add CSS to indicate it's editable
    ruleTitle.style.cursor = "pointer";
    ruleTitle.title = "Double-click to edit";
    
    // Add click event for edit button
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.makeRuleTitleEditable(ruleTitle, rule, index);
    });
    
    // Set initial values
    fromUrlInput.value = rule.fromUrl || "";
    toUrlInput.value = rule.toUrl || "";
    
    // Set up input event listeners
    fromUrlInput.addEventListener("input", () => 
      handlers.updateRuleFromForm(index, ruleElement)
    );
    
    toUrlInput.addEventListener("input", () => 
      handlers.updateRuleFromForm(index, ruleElement)
    );
    
    // Set up toggle and delete buttons
    toggleActiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.toggleRuleActive(index);
    });
    
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.deleteRule(index);
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
   * Update a rule's status indicator
   * @param {HTMLElement} ruleElement - Rule element
   * @param {Object} rule - Rule data
   * @param {boolean} isEnabled - Whether redirects are globally enabled
   * @param {boolean} sectionEnabled - Whether the rule's section is enabled
   */
  static updateRuleStatus(ruleElement, rule, isEnabled, sectionEnabled = true) {
    const statusIndicator = ruleElement.querySelector(".rule__status");
    const toggleBtn = ruleElement.querySelector(".rule__toggle-btn");
    
    // Check if rule has both fromUrl and toUrl
    const hasValidUrls =
      rule.fromUrl &&
      rule.fromUrl.trim() !== "" &&
      rule.toUrl &&
      rule.toUrl.trim() !== "";
      
    const effectivelyEnabled =
      isEnabled && !rule.disabled && sectionEnabled && hasValidUrls;
      
    if (!effectivelyEnabled) {
      statusIndicator.classList.remove("rule__status--active");
      statusIndicator.classList.add("rule__status--inactive");
      toggleBtn.classList.add("rule__toggle-btn--inactive");
      ruleElement.setAttribute("data-disabled", "true");
      
      // Add a title attribute to explain why the rule is inactive
      if (!hasValidUrls) {
        statusIndicator.title = "Rule is missing From URL or To URL";
      } else if (rule.disabled) {
        statusIndicator.title = "Rule is disabled";
      } else if (!sectionEnabled) {
        statusIndicator.title = "Section is disabled";
      } else if (!isEnabled) {
        statusIndicator.title = "Redirect is globally disabled";
      } else {
        statusIndicator.title = "Rule is inactive";
      }
    } else {
      statusIndicator.classList.add("rule__status--active");
      statusIndicator.classList.remove("rule__status--inactive");
      toggleBtn.classList.remove("rule__toggle-btn--inactive");
      ruleElement.removeAttribute("data-disabled");
      statusIndicator.title = "Rule is active";
    }
    
    // Update toggle button appearance based on rule.disabled state
    // This ensures the toggle button reflects the actual rule state
    if (rule.disabled) {
      toggleBtn.classList.add("rule__toggle-btn--inactive");
    } else {
      toggleBtn.classList.remove("rule__toggle-btn--inactive");
    }
  }

  /**
   * Update a rule's title display
   * @param {HTMLElement} ruleElement - Rule element
   * @param {Object} rule - Rule data
   */
  static updateRuleTitle(ruleElement, rule) {
    const ruleTitle = ruleElement.querySelector(".rule__title");
    
    // Use custom name if available
    if (rule.name && rule.name.trim() !== "") {
      ruleTitle.textContent = rule.name;
    } else if (rule.fromUrl && rule.toUrl) {
      const fromDomain = URLUtils.extractDomain(rule.fromUrl);
      const toDomain = URLUtils.extractDomain(rule.toUrl);
      ruleTitle.textContent = `${fromDomain} => ${toDomain}`;
    } else {
      ruleTitle.textContent = "New Rule";
    }
  }

  /**
   * Show validation error message
   * @param {HTMLElement} inputElement - Input element
   * @param {string} message - Error message
   */
  static showValidationError(inputElement, message) {
    // Remove any existing error message
    this.removeValidationError(inputElement);
    
    // Create and add error message using DOM utility
    const errorElement = DOM.createElement("div", {
      className: "rule__error-message",
      textContent: message,
    });
    
    // Insert after the input element
    inputElement.parentNode.insertBefore(
      errorElement,
      inputElement.nextSibling
    );
  }

  /**
   * Remove validation error message
   * @param {HTMLElement} inputElement - Input element
   */
  static removeValidationError(inputElement) {
    const errorElement = inputElement.parentNode.querySelector(
      ".rule__error-message"
    );
    if (errorElement) errorElement.remove();
  }

  /**
   * Make a rule title editable
   * @param {HTMLElement} ruleTitle - Rule title element
   * @param {Object} rule - Rule data
   * @param {number} index - Rule index
   * @param {Function} saveCallback - Callback to save changes
   */
  static makeRuleTitleEditable(ruleTitle, rule, index, saveCallback) {
    // Store the original text and rule name
    const originalText = ruleTitle.textContent;
    const originalName = rule.name || "";
    
    // Make the rule title editable
    ruleTitle.contentEditable = true;
    ruleTitle.focus();
    
    // Select all text
    document.execCommand("selectAll", false, null);
    
    // Add event listeners for saving changes
    const saveChanges = async () => {
      ruleTitle.contentEditable = false;
      const newName = ruleTitle.textContent.trim();
      
      // If empty, revert to original display
      if (!newName) {
        rule.name = "";
        this.updateRuleTitle(ruleTitle.closest(".rule"), rule);
        return;
      }
      
      // If unchanged, do nothing
      if (newName === originalName) return;
      
      // Update rule name
      rule.name = newName;
      
      // Call save callback
      if (saveCallback) await saveCallback(rule, index);
      
      // Update UI
      this.updateRuleTitle(ruleTitle.closest(".rule"), rule);
    };
    
    // Save on blur
    ruleTitle.addEventListener("blur", saveChanges, {once: true});
    
    // Save on Enter key
    ruleTitle.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await saveChanges();
      } else if (e.key === "Escape") {
        e.preventDefault();
        ruleTitle.contentEditable = false;
        ruleTitle.textContent = originalText;
      }
    });
  }
} 