import {RedirectRule} from './RedirectRule.js';

export class RuleManager {
  constructor() {
    this.rules = [];
    this.enabled = false;
    this.sections = {};
  }

  async loadRules() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ["redirectRules", "enabled", "sections"],
        (result) => {
          this.rules = Array.isArray(result.redirectRules)
            ? result.redirectRules.map((rule) => new RedirectRule(rule))
            : [];

          this.enabled = result.enabled || false;
          this.sections = result.sections || {};

          // Ensure all rules have a section
          this.rules.forEach((rule) => {
            if (!rule.section) rule.section = "Default";
          });

          // Initialize sections from rules if not in storage
          this.rules.forEach((rule) => {
            if (rule.section && !Object.hasOwn(this.sections, rule.section)) {
              this.sections[rule.section] = {enabled: true};
            }
          });

          // Ensure at least one section exists
          if (Object.keys(this.sections).length === 0 && this.rules.length > 0) {
            this.sections["Default"] = {enabled: true};
            this.rules.forEach((rule) => (rule.section = "Default"));
          }

          resolve();
        }
      );
    });
  }

  async saveRules() {
    const redirectRules = this.rules.map((rule) => rule.toObject());

    return new Promise((resolve) => {
      chrome.storage.local.set({redirectRules, sections: this.sections}, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving rules:", chrome.runtime.lastError);
          resolve(false);
          return;
        }
        // storage.onChanged handles rule updates in background,
        // explicit message ensures immediate acknowledgment
        chrome.runtime.sendMessage({action: "rulesUpdated"}, () => {
          if (chrome.runtime.lastError) { /* expected if background not ready */ }
          resolve(true);
        });
      });
    });
  }

  getSections() {
    const sectionSet = new Set(Object.keys(this.sections));
    this.rules.forEach((rule) => {
      if (rule.section) sectionSet.add(rule.section);
    });
    return Array.from(sectionSet);
  }

  getRulesBySection(sectionName) {
    return this.rules.filter((rule) => rule.section === sectionName);
  }

  findRule(rule) {
    if (rule.name) {
      const nameMatch = this.rules.findIndex(
        (r) => r.section === rule.section && r.name === rule.name
      );
      if (nameMatch !== -1) return nameMatch;
    }

    return this.rules.findIndex(
      (r) => r.fromUrl === rule.fromUrl && r.toUrl === rule.toUrl
    );
  }

  setSectionEnabled(sectionName, enabled) {
    if (!this.sections[sectionName]) {
      this.sections[sectionName] = {enabled: true};
    }
    this.sections[sectionName].enabled = enabled;
  }

  isSectionEnabled(sectionName) {
    return this.sections[sectionName]?.enabled !== false;
  }

  addRule() {
    const newRule = new RedirectRule();
    this.rules.push(newRule);
    return this.rules.length - 1;
  }

  updateRule(index, data) {
    if (index < 0 || index >= this.rules.length) return false;
    Object.assign(this.rules[index], data);
    return true;
  }

  deleteRule(index) {
    if (index >= 0 && index < this.rules.length) this.rules.splice(index, 1);
  }

  async setEnabled(enabled) {
    this.enabled = enabled;
    return new Promise((resolve) =>
      chrome.storage.local.set({enabled}, resolve)
    );
  }

  testUrl(url) {
    if (!this.enabled) return [];

    return this.rules.reduce((matches, rule, index) => {
      if (rule.disabled || (rule.section && !this.isSectionEnabled(rule.section))) {
        return matches;
      }
      const result = rule.testUrl(url);
      if (result.matches) {
        matches.push({rule, index, redirectUrl: result.redirectUrl});
      }
      return matches;
    }, []);
  }
}
