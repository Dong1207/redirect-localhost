/**
 * ImportExportUI.js - UI components for importing and exporting rules
 */
import { DOM } from '../../utils.js';
import { RedirectRule } from '../models/RedirectRule.js';

/**
 * Handles UI operations for importing and exporting rules
 */
export class ImportExportUI {
  /**
   * Export rules to a JSON file
   * @param {Array} rules - Rules array
   * @param {HTMLElement} container - Container element
   */
  static exportRules(rules, container) {
    const rulesJson = JSON.stringify(
      rules.map(rule => rule.toObject()),
      null,
      2
    );
    
    const blob = new Blob([rulesJson], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "redirect-rules.json";
    link.href = url;
    link.click();
    
    this.showStatus("Rules exported successfully!", true, container);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * Import rules from a JSON file
   * @param {Function} onImportComplete - Callback when import is complete
   */
  static importRules(onImportComplete) {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);
    fileInput.click();
    
    this._setupFileInputListeners(fileInput, onImportComplete);
  }

  /**
   * Set up file input listeners for rule import
   * @param {HTMLElement} fileInput - File input element
   * @param {Function} onImportComplete - Callback when import is complete
   * @private
   */
  static _setupFileInputListeners(fileInput, onImportComplete) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedRules = this._processImportedRules(e.target.result);
          if (onImportComplete) onImportComplete(importedRules);
        } catch (error) {
          console.error("Error parsing imported rules:", error);
          if (onImportComplete) onImportComplete(null, error);
        } finally {
          document.body.removeChild(fileInput);
        }
      };
      
      reader.onerror = () => {
        if (onImportComplete) onImportComplete(null, new Error("Error reading file"));
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
   * Process imported rules from JSON
   * @param {string} jsonData - JSON data
   * @returns {Array} Imported rules
   * @private
   */
  static _processImportedRules(jsonData) {
    const importedRules = JSON.parse(jsonData);
    
    if (!Array.isArray(importedRules)) {
      throw new Error("Invalid file format. Expected an array of rules.");
    }
    
    // Validate rules
    const validRules = importedRules.filter(
      rule => rule.fromUrl !== undefined && rule.toUrl !== undefined
    );
    
    if (validRules.length === 0) {
      throw new Error("No valid rules found in the file.");
    }
    
    // Convert to RedirectRule objects
    return validRules.map(rule => {
      const newRule = new RedirectRule(rule);
      if (!newRule.section) newRule.section = "Default";
      return newRule;
    });
  }

  /**
   * Show import/export status message
   * @param {string} message - Status message
   * @param {boolean} isSuccess - Whether status indicates success
   * @param {HTMLElement} container - Container element
   */
  static showStatus(message, isSuccess, container) {
    // Create status message element directly
    const statusElement = DOM.createElement("div", {
      className: `import-export__status ${isSuccess ? "success" : "error"}`,
      textContent: message
    });
    
    // Remove any existing status messages
    const existingStatus = container.querySelector(".import-export__status");
    if (existingStatus) existingStatus.remove();
    
    container.appendChild(statusElement);
    
    // Auto-remove after 3 seconds
    setTimeout(() => statusElement.remove(), 3000);
  }
} 