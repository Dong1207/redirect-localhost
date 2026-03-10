import {DOM, URLUtils} from '../../utils.js';

export class RuleUI {
  static createRuleElement(template, rule, index) {
    const clone = document.importNode(template.content, true);
    const ruleElement = clone.querySelector(".rule");
    ruleElement.setAttribute("data-index", index);

    if (rule.disabled) ruleElement.setAttribute("data-disabled", "true");
    if (rule.section) ruleElement.setAttribute("data-section", rule.section);

    return ruleElement;
  }

  static initializeRuleElement(ruleElement, rule, index, handlers) {
    const fromUrlInput = ruleElement.querySelector(".from-url-input");
    const toUrlInput = ruleElement.querySelector(".to-url-input");
    const editBtn = ruleElement.querySelector(".rule__edit-btn");
    const toggleActiveBtn = ruleElement.querySelector(".rule__toggle-btn");
    const deleteBtn = ruleElement.querySelector(".rule__delete-btn");
    const header = ruleElement.querySelector(".rule__header");
    const ruleTitle = ruleElement.querySelector(".rule__title");
    const collapseIcon = ruleElement.querySelector(".rule__collapse-icon i");

    // Collapsed by default
    ruleElement.classList.add("rule--collapsed");
    collapseIcon.className = "fas fa-chevron-right";

    // Title editable on double-click
    ruleTitle.style.cursor = "pointer";
    ruleTitle.title = "Double-click to edit";
    ruleTitle.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      handlers.makeRuleTitleEditable(ruleTitle, rule, index);
    });

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.makeRuleTitleEditable(ruleTitle, rule, index);
    });

    // Set initial values
    fromUrlInput.value = rule.fromUrl || "";
    toUrlInput.value = rule.toUrl || "";

    // Input listeners
    fromUrlInput.addEventListener("input", () =>
      handlers.updateRuleFromForm(index, ruleElement)
    );
    toUrlInput.addEventListener("input", () =>
      handlers.updateRuleFromForm(index, ruleElement)
    );

    toggleActiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.toggleRuleActive(index);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.deleteRule(index);
    });

    // Toggle collapse
    header.addEventListener("click", () => {
      ruleElement.classList.toggle("rule--collapsed");
      collapseIcon.className = ruleElement.classList.contains("rule--collapsed")
        ? "fas fa-chevron-right"
        : "fas fa-chevron-down";
    });

    this.updateRuleStatus(ruleElement, rule, !rule.disabled);
    this.updateRuleTitle(ruleElement, rule);

    return ruleElement;
  }

  static updateRuleStatus(ruleElement, rule, isEnabled, sectionEnabled = true) {
    const statusIndicator = ruleElement.querySelector(".rule__status");
    const toggleBtn = ruleElement.querySelector(".rule__toggle-btn");

    const hasValidUrls = rule.fromUrl?.trim() && rule.toUrl?.trim();
    const isActive = isEnabled && !rule.disabled && sectionEnabled && hasValidUrls;

    // Status dot
    statusIndicator.classList.toggle("rule__status--active", isActive);
    statusIndicator.classList.toggle("rule__status--inactive", !isActive);

    // Toggle button
    toggleBtn.classList.toggle("rule__toggle-btn--inactive", rule.disabled);

    // Data attribute
    if (isActive) {
      ruleElement.removeAttribute("data-disabled");
    } else {
      ruleElement.setAttribute("data-disabled", "true");
    }

    // Tooltip
    if (!hasValidUrls) {
      statusIndicator.title = "Missing From URL or To URL";
    } else if (rule.disabled) {
      statusIndicator.title = "Rule is disabled";
    } else if (!sectionEnabled) {
      statusIndicator.title = "Section is disabled";
    } else if (!isEnabled) {
      statusIndicator.title = "Redirect is globally disabled";
    } else {
      statusIndicator.title = "Rule is active";
    }
  }

  static updateRuleTitle(ruleElement, rule) {
    const ruleTitle = ruleElement.querySelector(".rule__title");

    if (rule.name?.trim()) {
      ruleTitle.textContent = rule.name;
    } else if (rule.fromUrl && rule.toUrl) {
      ruleTitle.textContent = `${URLUtils.extractDomain(rule.fromUrl)} => ${URLUtils.extractDomain(rule.toUrl)}`;
    } else {
      ruleTitle.textContent = "New Rule";
    }
  }

  static showValidationError(inputElement, message) {
    this.removeValidationError(inputElement);

    const errorElement = DOM.createElement("div", {
      className: "rule__error-message",
      textContent: message,
    });

    inputElement.parentNode.insertBefore(errorElement, inputElement.nextSibling);
  }

  static removeValidationError(inputElement) {
    inputElement.parentNode.querySelector(".rule__error-message")?.remove();
  }

  static makeRuleTitleEditable(ruleTitle, rule, index, saveCallback) {
    const originalText = ruleTitle.textContent;
    const originalName = rule.name || "";

    ruleTitle.contentEditable = true;
    ruleTitle.focus();
    document.execCommand("selectAll", false, null);

    const saveChanges = async () => {
      ruleTitle.contentEditable = false;
      const newName = ruleTitle.textContent.trim();

      if (!newName) {
        rule.name = "";
        this.updateRuleTitle(ruleTitle.closest(".rule"), rule);
        return;
      }

      if (newName === originalName) return;

      rule.name = newName;
      if (saveCallback) await saveCallback(rule, index);
      this.updateRuleTitle(ruleTitle.closest(".rule"), rule);
    };

    ruleTitle.addEventListener("blur", saveChanges, {once: true});

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
