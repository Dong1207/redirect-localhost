import {RuleUI} from "./RuleUI.js";
import {SectionUI} from "./SectionUI.js";
import {HistoryUI} from "./HistoryUI.js";
import {ImportExportUI} from "./ImportExportUI.js";
import {URLUtils} from "../../utils.js";

export class PopupUI {
  constructor(elements, ruleManager) {
    this.elements = elements;
    this.ruleManager = ruleManager;

    this.ruleHandlers = {
      updateRuleFromForm: this.updateRuleFromForm.bind(this),
      toggleRuleActive: this.toggleRuleActive.bind(this),
      deleteRule: this.deleteRule.bind(this),
      makeRuleTitleEditable: this.makeRuleTitleEditable.bind(this),
    };

    this.sectionHandlers = {
      addNewRuleToSection: this.addNewRuleToSection.bind(this),
      toggleSectionActive: this.toggleSectionActive.bind(this),
      editSectionName: this.editSectionName.bind(this),
      deleteSection: this.deleteSection.bind(this),
      makeElementEditable: this.makeElementEditable.bind(this),
    };
  }

  async init() {
    this.setupEventListeners();
    this.setupStorageListener();
    this.setupTabs();
    this.displaySections();
    this.loadRedirectHistory();
  }

  setupEventListeners() {
    this.elements.enableToggle.addEventListener("change", () =>
      this.toggleRedirect()
    );

    this.elements.addSectionBtn.addEventListener("click", () =>
      this.addNewSection()
    );

    this.elements.debugBtn.addEventListener("click", () =>
      this.toggleDebugPanel()
    );

    this.elements.clearHistoryBtn.addEventListener("click", () =>
      this.clearRedirectHistory()
    );

    this.elements.exportRulesBtn.addEventListener("click", () => {
      const container = this.elements.importRulesBtn.closest(".import-export");
      ImportExportUI.exportRules(this.ruleManager.rules, container);
    });

    this.elements.importRulesBtn.addEventListener("click", () => {
      this._handleImport();
    });

    // Debug toggle setup
    chrome.storage.local.get(["debugToPage"], (result) => {
      this.elements.debugToPageToggle.checked = result.debugToPage === true;
    });

    this.elements.debugToPageToggle.addEventListener("change", () => {
      this._handleDebugToggle();
    });
  }

  _handleImport() {
    const container = this.elements.importRulesBtn.closest(".import-export");
    const overwrite = this.elements.overrideToggle.checked;

    ImportExportUI.importRules(async (importedRules, error) => {
      if (error) {
        ImportExportUI.showStatus(`Error: ${error.message}`, false, container);
        return;
      }

      if (!importedRules?.length) {
        ImportExportUI.showStatus("No valid rules found.", false, container);
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
      if (overwrite) {
        duplicates.forEach(({rule, index}) => {
          this.ruleManager.updateRule(index, rule);
          updatedCount++;
        });
      }

      newRules.forEach((rule) => this.ruleManager.rules.push(rule));

      // Ensure sections exist for all applied rules
      const appliedRules = overwrite
        ? [...newRules, ...duplicates.map((d) => d.rule)]
        : newRules;

      appliedRules.forEach((rule) => {
        if (!this.ruleManager.sections[rule.section]) {
          this.ruleManager.sections[rule.section] = {enabled: true};
        }
      });

      await this.ruleManager.saveRules();
      this.displaySections();

      const messages = [];
      if (newRules.length) messages.push(`${newRules.length} added`);
      if (updatedCount) messages.push(`${updatedCount} updated`);
      if (!overwrite && duplicates.length) messages.push(`${duplicates.length} skipped`);

      ImportExportUI.showStatus(
        messages.length ? `Imported: ${messages.join(", ")}.` : "No new rules.",
        true,
        container
      );
    });
  }

  _handleDebugToggle() {
    const enabled = this.elements.debugToPageToggle.checked;

    if (!enabled) {
      chrome.runtime.sendMessage({action: "toggleDebugToPage", enabled: false});
      chrome.storage.local.set({debugToPage: false});
      return;
    }

    chrome.permissions.request({permissions: ["scripting"]}, (granted) => {
      if (!granted) {
        this.elements.debugToPageToggle.checked = false;
        chrome.storage.local.set({debugToPage: false});
        return;
      }

      chrome.runtime.sendMessage(
        {action: "toggleDebugToPage", enabled: true},
        (response) => {
          if (response?.debugEnabled !== undefined && !response.debugEnabled) {
            this.elements.debugToPageToggle.checked = false;
          }
        }
      );
      chrome.storage.local.set({debugToPage: true});
    });
  }

  setupTabs() {
    const tabMapping = {
      history: document.getElementById("historyTab"),
      tools: document.getElementById("toolsTab"),
    };

    const activateTab = (tab) => {
      const tabId = tab.getAttribute("data-tab");

      this.elements.tabs.forEach((t) => {
        t.classList.remove("debug__tab--active");
        t.setAttribute("aria-selected", "false");
        t.setAttribute("tabindex", "-1");
      });
      tab.classList.add("debug__tab--active");
      tab.setAttribute("aria-selected", "true");
      tab.setAttribute("tabindex", "0");

      this.elements.tabContents.forEach((content) => {
        content.classList.remove("debug__content--active");
      });

      tabMapping[tabId]?.classList.add("debug__content--active");
    };

    this.elements.tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateTab(tab));
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const newIndex =
          (index + dir + this.elements.tabs.length) % this.elements.tabs.length;
        this.elements.tabs[newIndex].focus();
        activateTab(this.elements.tabs[newIndex]);
      });
    });

    activateTab(this.elements.tabs[0]);
  }

  async toggleRedirect() {
    await this.ruleManager.setEnabled(this.elements.enableToggle.checked);
    this.updateAllRuleStatuses();
  }

  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== "local") return;
      if (changes.redirectHistory) {
        this.loadRedirectHistory();
      }
    });
  }

  displaySections() {
    const sectionsContainer = this.elements.rulesContainer;

    sectionsContainer.querySelectorAll(".section").forEach((s) => s.remove());

    const sections = this.ruleManager.getSections();

    if (sections.length === 0) {
      this.ruleManager.setSectionEnabled("Default", true);
      this.ruleManager.saveRules();
      sections.push("Default");
    }

    sections.forEach((sectionName) => {
      const isEnabled = this.ruleManager.isSectionEnabled(sectionName);
      const sectionElement = SectionUI.createSectionElement(
        sectionName,
        isEnabled,
        this.sectionHandlers
      );

      SectionUI.displayRulesForSection(
        sectionName,
        sectionElement.querySelector(".section__rules"),
        this.ruleManager.rules,
        this.elements.ruleTemplate,
        this.ruleHandlers
      );

      sectionsContainer.appendChild(sectionElement);
    });

    this.updateAllRuleStatuses();
  }

  async updateRuleFromForm(index, ruleElement) {
    const fromUrlInput = ruleElement.querySelector(".from-url-input");
    const toUrlInput = ruleElement.querySelector(".to-url-input");
    const fromUrl = fromUrlInput.value.trim();
    const toUrl = toUrlInput.value.trim();

    fromUrlInput.classList.remove("rule__input--error");
    toUrlInput.classList.remove("rule__input--error");
    RuleUI.removeValidationError(fromUrlInput);
    RuleUI.removeValidationError(toUrlInput);

    const data = {fromUrl, toUrl};

    if (!URLUtils.isValidRedirectUrl(fromUrl) || !URLUtils.isValidRedirectUrl(toUrl)) {
      data.disabled = true;
    }

    this.ruleManager.updateRule(index, data);
    await this.ruleManager.saveRules();

    const rule = this.ruleManager.rules[index];
    RuleUI.updateRuleTitle(ruleElement, rule);

    const sectionEnabled =
      !rule.section || this.ruleManager.isSectionEnabled(rule.section);
    RuleUI.updateRuleStatus(
      ruleElement,
      rule,
      this.ruleManager.enabled && sectionEnabled,
      sectionEnabled
    );
  }

  async deleteRule(index) {
    this.ruleManager.deleteRule(index);
    await this.ruleManager.saveRules();
    this.displaySections();
  }

  async toggleRuleActive(index) {
    const rule = this.ruleManager.rules[index];
    if (!rule) return;

    rule.disabled = !rule.disabled;
    await this.ruleManager.saveRules();

    const ruleElement = document.querySelector(`.rule[data-index="${index}"]`);
    if (!ruleElement) return;

    const sectionEnabled =
      !rule.section || this.ruleManager.isSectionEnabled(rule.section);

    // Flash effect on toggle button
    const toggleBtn = ruleElement.querySelector(".rule__toggle-btn");
    if (toggleBtn) {
      toggleBtn.classList.add("button-flash");
      setTimeout(() => toggleBtn.classList.remove("button-flash"), 300);
    }

    // Single source of truth for status update
    RuleUI.updateRuleStatus(
      ruleElement,
      rule,
      this.ruleManager.enabled && sectionEnabled,
      sectionEnabled
    );
  }

  updateAllRuleStatuses() {
    document.querySelectorAll(".rule").forEach((ruleElement) => {
      const ruleIndex = ruleElement.dataset.index;
      if (ruleIndex === undefined || !this.ruleManager.rules[ruleIndex]) return;

      const rule = this.ruleManager.rules[ruleIndex];
      const sectionEnabled =
        !rule.section || this.ruleManager.isSectionEnabled(rule.section);
      RuleUI.updateRuleStatus(
        ruleElement,
        rule,
        this.ruleManager.enabled && sectionEnabled,
        sectionEnabled
      );
    });
  }

  makeRuleTitleEditable(ruleTitle, rule, index) {
    RuleUI.makeRuleTitleEditable(
      ruleTitle,
      rule,
      index,
      async () => await this.ruleManager.saveRules()
    );
  }

  async toggleSectionActive(sectionName) {
    const isEnabled = this.ruleManager.isSectionEnabled(sectionName);
    this.ruleManager.setSectionEnabled(sectionName, !isEnabled);

    const sectionElement = document.querySelector(
      `.section[data-section="${sectionName}"]`
    );
    if (sectionElement) {
      SectionUI.updateSectionStatus(sectionElement, !isEnabled);
    }

    this.updateAllRuleStatuses();
    await this.ruleManager.saveRules();
  }

  async addNewSection() {
    let sectionName = "New Section";
    let counter = 1;

    const existingSections = this.ruleManager.getSections();
    while (existingSections.includes(sectionName)) {
      sectionName = `New Section ${counter++}`;
    }

    this.ruleManager.setSectionEnabled(sectionName, true);

    const newRuleIndex = this.ruleManager.addRule();
    this.ruleManager.rules[newRuleIndex].section = sectionName;
    this.ruleManager.rules[newRuleIndex].name = "New Rule";

    await this.ruleManager.saveRules();
    this.displaySections();

    setTimeout(() => {
      const el = document.querySelector(`.section[data-section="${sectionName}"]`);
      if (el) {
        this.makeElementEditable(el.querySelector(".section__title"), sectionName);
      }
    }, 100);
  }

  async deleteSection(sectionName) {
    const sections = this.ruleManager.getSections();

    if (sections.length === 1) {
      alert("Cannot delete the only section.");
      return;
    }

    const rulesInSection = this.ruleManager.rules.filter(
      (rule) => rule.section === sectionName
    );

    let msg = `Delete section "${sectionName}"`;
    if (rulesInSection.length > 0) {
      msg += ` and ${rulesInSection.length} rule(s)`;
    }
    msg += "?";

    if (!confirm(msg)) return;

    this.ruleManager.rules = this.ruleManager.rules.filter(
      (rule) => rule.section !== sectionName
    );
    delete this.ruleManager.sections[sectionName];

    await this.ruleManager.saveRules();
    this.displaySections();
  }

  async editSectionName(sectionName) {
    const el = document.querySelector(`.section[data-section="${sectionName}"]`);
    if (el) {
      this.makeElementEditable(el.querySelector(".section__title"), sectionName);
    }
  }

  makeElementEditable(element, sectionName) {
    SectionUI.makeElementEditable(element, sectionName, async (newName) => {
      const existingSections = this.ruleManager.getSections();
      if (existingSections.includes(newName)) {
        alert(`Section "${newName}" already exists.`);
        return false;
      }

      this.ruleManager.rules.forEach((rule) => {
        if (rule.section === sectionName) rule.section = newName;
      });

      if (this.ruleManager.sections[sectionName] !== undefined) {
        this.ruleManager.sections[newName] = this.ruleManager.sections[sectionName];
        delete this.ruleManager.sections[sectionName];
      }

      await this.ruleManager.saveRules();
      this.displaySections();
      return true;
    });
  }

  async addNewRuleToSection(sectionName) {
    const newRuleIndex = this.ruleManager.addRule();
    const rule = this.ruleManager.rules[newRuleIndex];
    rule.section = sectionName;
    rule.fromUrl = "https://example.com/**";
    rule.toUrl = "http://localhost:3000/**";

    await this.ruleManager.saveRules();
    this.displaySections();
  }

  toggleDebugPanel() {
    const wasHidden = this.elements.debugPanel.classList.contains("hidden");
    this.elements.debugPanel.classList.toggle("hidden");

    if (wasHidden) {
      this.loadRedirectHistory();
      // Reset to first tab
      if (this.elements.tabs[0]) {
        this.elements.tabs[0].click();
      }
    }
  }

  loadRedirectHistory() {
    HistoryUI.loadRedirectHistory(this.elements.redirectHistory);
  }

  clearRedirectHistory() {
    HistoryUI.clearRedirectHistory(this.elements.redirectHistory);
  }
}
