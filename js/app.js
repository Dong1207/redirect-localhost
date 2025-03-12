/**
 * app.js - Main application entry point
 */
import {RuleManager} from "./models/RuleManager.js";
import {PopupUI} from "./ui/PopupUI.js";

/**
 * Main application class
 */
export class RedirectApp {
  /**
   * Create a new RedirectApp instance
   * @param {Object} elements - DOM elements
   */
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

// Initialize the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    enableToggle: document.getElementById("enableToggle"),
    redirectCountElem: document.getElementById("redirectCount"),
    rulesContainer: document.getElementById("rulesContainer"),
    ruleTemplate: document.getElementById("ruleTemplate"),
    debugBtn: document.getElementById("debugBtn"),
    donateBtn: document.getElementById("donateBtn"),
    donateContainer: document.getElementById("donateContainer"),
    backToRulesBtn: document.getElementById("backToRulesBtn"),
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

  const app = new RedirectApp(elements);
  app.init();
});
