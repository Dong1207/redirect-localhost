/**
 * RuleManager.js - Manages all redirect rules
 */
import { RedirectRule } from './RedirectRule.js';

/**
 * Manages all redirect rules
 */
export class RuleManager {
  constructor() {
    this.rules = [];
    this.enabled = false;
    this.sections = {}; // Track sections and their enabled state
  }

  /**
   * Load rules from storage
   */
  async loadRules() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ["redirectRules", "enabled", "sections"],
        (result) => {
          if (result.redirectRules && Array.isArray(result.redirectRules)) {
            this.rules = result.redirectRules.map(
              (rule) => new RedirectRule(rule)
            );
          } else {
            this.rules = [];
          }
          
          this.enabled = result.enabled || false;
          this.sections = result.sections || {};
          
          // Ensure all rules have a section
          this.rules.forEach((rule) => {
            if (!rule.section) rule.section = "Default";
          });
          
          // Initialize sections from rules if not already in storage
          this.rules.forEach((rule) => {
            if (rule.section && !this.sections.hasOwnProperty(rule.section)) {
              this.sections[rule.section] = {enabled: true};
            }
          });
          
          // Ensure there's at least one section
          if (Object.keys(this.sections).length === 0 && this.rules.length > 0) {
            this.sections["Default"] = {enabled: true};
            this.rules.forEach((rule) => (rule.section = "Default"));
          }
          
          resolve();
        }
      );
    });
  }

  /**
   * Save rules to storage
   */
  async saveRules() {
    const redirectRules = this.rules.map((rule) => rule.toObject());
    
    return new Promise((resolve) => {
      chrome.storage.local.set({redirectRules, sections: this.sections}, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving rules:", chrome.runtime.lastError);
          resolve(false);
        } else {
          this._notifyBackgroundScript(resolve);
        }
      });
    });
  }

  /**
   * Notify background script about rule updates
   * @private
   */
  _notifyBackgroundScript(resolve) {
    try {
      // Set a timeout to resolve the promise even if we don't get a response
      const timeoutId = setTimeout(() => {
        console.log("Background notification timed out, but rules were saved");
        resolve(true);
      }, 500); // 500ms timeout
      
      chrome.runtime.sendMessage({action: "rulesUpdated"}, (response) => {
        clearTimeout(timeoutId); // Clear the timeout since we got a response
        
        // Check for runtime error (like message port closed)
        if (chrome.runtime.lastError) {
          console.log(
            "Background notification status: " +
              (chrome.runtime.lastError.message || "Unknown error")
          );
          // Still resolve as true since the rules were saved to storage
          resolve(true);
        } else if (response?.success) {
          console.log("Background script updated successfully");
          resolve(true);
        } else {
          console.log(
            "Background script notification sent, no confirmation received"
          );
          resolve(true);
        }
      });
    } catch (err) {
      console.error("Failed to notify background script:", err);
      // Still resolve as true since the rules were saved to storage
      resolve(true);
    }
  }

  /**
   * Get all section names
   */
  getSections() {
    // Get all sections defined in this.sections
    const definedSections = Object.keys(this.sections);
    
    // Get all sections used in rules
    const sectionSet = new Set(definedSections);
    this.rules.forEach((rule) => {
      if (rule.section) sectionSet.add(rule.section);
    });
    
    return Array.from(sectionSet);
  }

  /**
   * Get rules for a specific section
   */
  getRulesBySection(sectionName) {
    return this.rules.filter((rule) => rule.section === sectionName);
  }

  /**
   * Set section enabled state
   */
  setSectionEnabled(sectionName, enabled) {
    if (!this.sections[sectionName])
      this.sections[sectionName] = {enabled: true};
      
    this.sections[sectionName].enabled = enabled;
  }

  /**
   * Check if a section is enabled
   */
  isSectionEnabled(sectionName) {
    return this.sections[sectionName]?.enabled !== false;
  }

  /**
   * Enable or disable all rules in a section
   */
  setRulesSectionDisabled(sectionName, disabled) {
    this.rules.forEach((rule) => {
      if (rule.section === sectionName) rule.disabled = disabled;
    });
  }

  /**
   * Add a new rule
   */
  addRule() {
    const newRule = new RedirectRule();
    this.rules.push(newRule);
    return this.rules.length - 1; // Return the index of the new rule
  }

  /**
   * Update a rule with new data
   */
  updateRule(index, data) {
    if (index >= 0 && index < this.rules.length) {
      Object.assign(this.rules[index], data);
      return true;
    }
    return false;
  }

  /**
   * Delete a rule at the specified index
   */
  deleteRule(index) {
    if (index >= 0 && index < this.rules.length) this.rules.splice(index, 1);
  }

  /**
   * Toggle the enabled state
   */
  async setEnabled(enabled) {
    this.enabled = enabled;
    return new Promise((resolve) =>
      chrome.storage.local.set({enabled}, resolve)
    );
  }

  /**
   * Test a URL against all active rules
   */
  testUrl(url) {
    if (!this.enabled) return [];
    
    const matches = [];
    this.rules.forEach((rule, index) => {
      // Skip disabled rules or rules in disabled sections
      if (rule.disabled || (rule.section && !this.isSectionEnabled(rule.section)))
        return;
        
      const result = rule.testUrl(url);
      if (result.matches) {
        matches.push({rule, index, redirectUrl: result.redirectUrl});
      }
    });
    
    return matches;
  }
} 