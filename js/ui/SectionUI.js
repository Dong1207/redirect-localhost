/**
 * SectionUI.js - UI components for managing sections
 */
import { DOM } from '../../utils.js';
import { RuleUI } from './RuleUI.js';

/**
 * Handles UI operations for sections
 */
export class SectionUI {
  /**
   * Create a section element
   * @param {string} sectionName - Section name
   * @param {boolean} isEnabled - Whether section is enabled
   * @param {Object} handlers - Event handlers
   * @returns {HTMLElement} Section element
   */
  static createSectionElement(sectionName, isEnabled, handlers) {
    // Create section element with attributes
    const sectionElement = DOM.createElement("div", {
      className: "section",
      "data-section": sectionName,
      ...(isEnabled ? {} : {"data-disabled": "true"}),
    });

    // Create header
    const header = DOM.createElement("div", {className: "section__header"});

    // Create title container
    const titleContainer = DOM.createElement("div", {
      className: "section__title-container",
    });

    // Add collapse icon
    const collapseIcon = DOM.createElement("span", {
      className: "section__collapse-icon",
      innerHTML: '<i class="fas fa-chevron-down"></i>',
    });

    // Create status indicator
    const statusIndicator = DOM.createElement("span", {
      className: `section__status ${
        isEnabled ? "section__status--active" : "section__status--inactive"
      }`,
    });

    // Create title
    const title = DOM.createElement("h3", {
      className: "section__title",
      textContent: sectionName,
      style: {cursor: "pointer"},
      title: "Double-click to edit",
    });

    // Add event listeners to title
    DOM.addEventListeners(title, {
      dblclick: (e) => {
        e.stopPropagation();
        handlers.makeElementEditable(title, sectionName);
      },
    });

    // Create action buttons
    const addRuleBtn = DOM.createIconButton(
      "section__add-rule-btn",
      "Add New Rule",
      "fas fa-plus",
      (e) => {
        e.stopPropagation();
        handlers.addNewRuleToSection(sectionName);
      },
      "Add New Rule"
    );

    const toggleBtn = DOM.createIconButton(
      `section__toggle-btn ${
        !isEnabled ? "section__toggle-btn--inactive" : ""
      }`,
      "Toggle Section Active State",
      "fas fa-power-off",
      (e) => {
        e.stopPropagation();
        handlers.toggleSectionActive(sectionName);
      },
      "Toggle Section Active State"
    );

    const editBtn = DOM.createIconButton(
      "section__edit-btn",
      "Edit Section Name",
      "fas fa-edit",
      (e) => {
        e.stopPropagation();
        handlers.editSectionName(sectionName);
      },
      "Edit Section Name"
    );

    const deleteBtn = DOM.createIconButton(
      "section__delete-btn",
      "Delete Section",
      "fas fa-trash",
      (e) => {
        e.stopPropagation();
        handlers.deleteSection(sectionName);
      },
      "Delete Section"
    );

    // Assemble the section element
    titleContainer.appendChild(collapseIcon);
    titleContainer.appendChild(statusIndicator);
    titleContainer.appendChild(title);

    const actions = DOM.createElement("div", {className: "section__actions"});
    actions.appendChild(addRuleBtn);
    actions.appendChild(toggleBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    header.appendChild(titleContainer);
    header.appendChild(actions);

    // Add click event to header for collapsing/expanding
    DOM.addEventListeners(header, {
      click: () => {
        sectionElement.classList.toggle("section--collapsed");
        const icon = collapseIcon.querySelector("i");
        icon.className = sectionElement.classList.contains("section--collapsed")
          ? "fas fa-chevron-right"
          : "fas fa-chevron-down";
        // Save collapse state to localStorage
        const isCollapsed =
          sectionElement.classList.contains("section--collapsed");
        localStorage.setItem(`section_${sectionName}_collapsed`, isCollapsed);
      },
    });

    // Check if section was previously collapsed
    const wasCollapsed =
      localStorage.getItem(`section_${sectionName}_collapsed`) === "true";
    if (wasCollapsed) {
      sectionElement.classList.add("section--collapsed");
      collapseIcon.querySelector("i").className = "fas fa-chevron-right";
    }

    sectionElement.appendChild(header);

    // Create a container for rules in this section
    const rulesContainer = DOM.createElement("div", {
      className: "section__rules",
    });
    sectionElement.appendChild(rulesContainer);

    return sectionElement;
  }

  /**
   * Update a section's status indicator
   * @param {HTMLElement} sectionElement - Section element
   * @param {boolean} isEnabled - Whether section is enabled
   */
  static updateSectionStatus(sectionElement, isEnabled) {
    const statusIndicator = sectionElement.querySelector(".section__status");
    const toggleBtn = sectionElement.querySelector(".section__toggle-btn");
    
    if (!isEnabled) {
      statusIndicator.classList.remove("section__status--active");
      statusIndicator.classList.add("section__status--inactive");
      toggleBtn.classList.add("section__toggle-btn--inactive");
      sectionElement.setAttribute("data-disabled", "true");
    } else {
      statusIndicator.classList.add("section__status--active");
      statusIndicator.classList.remove("section__status--inactive");
      toggleBtn.classList.remove("section__toggle-btn--inactive");
      sectionElement.removeAttribute("data-disabled");
    }
  }

  /**
   * Make an element editable inline
   * @param {HTMLElement} element - Element to make editable
   * @param {string} currentValue - Current value
   * @param {Function} saveCallback - Callback to save changes
   */
  static makeElementEditable(element, currentValue, saveCallback) {
    // Store the original text
    const originalText = element.textContent;
    
    // Make the element editable
    element.contentEditable = true;
    element.focus();
    
    // Select all text
    document.execCommand("selectAll", false, null);
    
    // Add event listeners for saving changes
    const saveChanges = async () => {
      element.contentEditable = false;
      const newValue = element.textContent.trim();
      
      // If empty, revert to original
      if (!newValue) {
        element.textContent = originalText;
        return;
      }
      
      // If unchanged, do nothing
      if (newValue === currentValue) return;
      
      // Call save callback with new value
      if (saveCallback) await saveCallback(newValue, currentValue);
    };
    
    // Save on blur
    element.addEventListener("blur", saveChanges, {once: true});
    
    // Save on Enter key
    element.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await saveChanges();
      } else if (e.key === "Escape") {
        e.preventDefault();
        element.contentEditable = false;
        element.textContent = originalText;
      }
    });
  }

  /**
   * Display rules for a specific section
   * @param {string} sectionName - Section name
   * @param {HTMLElement} container - Container element
   * @param {Array} rules - Rules array
   * @param {HTMLTemplateElement} template - Rule template
   * @param {Object} handlers - Event handlers
   */
  static displayRulesForSection(sectionName, container, rules, template, handlers) {
    // Get rules for this section
    const rulesForSection = rules.filter(rule => rule.section === sectionName);
    
    // Display each rule
    rulesForSection.forEach((rule, i) => {
      // Find the actual index in the full rules array
      const index = rules.findIndex(r => r === rule);
      const ruleElement = RuleUI.createRuleElement(template, rule, index);
      
      // Initialize rule element with handlers
      RuleUI.initializeRuleElement(ruleElement, rule, index, handlers);
      
      container.appendChild(ruleElement);
    });
  }
} 