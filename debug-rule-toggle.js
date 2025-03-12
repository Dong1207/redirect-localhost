// Debug script to diagnose rule toggle issues
console.log("Debug script loaded");

// Function to check rule status
async function checkRuleStatus() {
  console.log("Checking rule status...");
  
  // Get rules from storage
  const result = await chrome.storage.local.get(["redirectRules", "enabled", "sections"]);
  
  console.log("Global redirect enabled:", result.enabled);
  console.log("Sections:", result.sections);
  
  if (result.redirectRules && Array.isArray(result.redirectRules)) {
    console.log("Total rules:", result.redirectRules.length);
    
    // Find rules in the "Joy" section
    const joyRules = result.redirectRules.filter(rule => rule.section === "Joy");
    console.log("Rules in 'Joy' section:", joyRules);
    
    // Check if Joy section is enabled
    const joySectionEnabled = result.sections?.Joy?.enabled !== false;
    console.log("'Joy' section enabled:", joySectionEnabled);
    
    // Check each rule's status
    joyRules.forEach((rule, index) => {
      console.log(`Rule ${index}:`, {
        name: rule.name || "Unnamed rule",
        fromUrl: rule.fromUrl,
        toUrl: rule.toUrl,
        disabled: rule.disabled,
        section: rule.section,
        // Check if URLs are valid
        fromUrlValid: isValidRedirectUrl(rule.fromUrl),
        toUrlValid: isValidRedirectUrl(rule.toUrl),
        // Calculate effective status
        effectivelyEnabled: result.enabled && !rule.disabled && joySectionEnabled && 
                           isValidRedirectUrl(rule.fromUrl) && isValidRedirectUrl(rule.toUrl)
      });
    });
  } else {
    console.log("No rules found in storage");
  }
}

// URL validation function (copied from utils.js)
function isValidRedirectUrl(url) {
  // URL must not be empty
  if (!url) return false;
  
  // URL must start with http:// or https://
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  
  // If URL contains wildcards, make sure they're valid
  if (url.includes('**')) {
    // Only one wildcard pattern is allowed
    if ((url.match(/\*\*/g) || []).length > 1) return false;
  }
  
  return true;
}

// Function to toggle a rule's disabled state
async function toggleRule(ruleName) {
  const result = await chrome.storage.local.get(["redirectRules"]);
  
  if (result.redirectRules && Array.isArray(result.redirectRules)) {
    // Find the rule by name
    const ruleIndex = result.redirectRules.findIndex(r => r.name === ruleName);
    
    if (ruleIndex >= 0) {
      // Toggle the disabled state
      result.redirectRules[ruleIndex].disabled = !result.redirectRules[ruleIndex].disabled;
      
      // Save back to storage
      await chrome.storage.local.set({redirectRules: result.redirectRules});
      
      // Notify background script
      try {
        chrome.runtime.sendMessage({action: "rulesUpdated"}, (response) => {
          console.log("Background script notification response:", response);
        });
      } catch (err) {
        console.error("Failed to notify background script:", err);
      }
      
      console.log(`Rule "${ruleName}" toggled to disabled=${result.redirectRules[ruleIndex].disabled}`);
    } else {
      console.log(`Rule "${ruleName}" not found`);
    }
  }
}

// Function to enable the Joy section
async function enableJoySection() {
  const result = await chrome.storage.local.get(["sections"]);
  
  const sections = result.sections || {};
  if (!sections.Joy) sections.Joy = {enabled: true};
  else sections.Joy.enabled = true;
  
  await chrome.storage.local.set({sections});
  
  console.log("Joy section enabled:", sections.Joy);
  
  // Notify background script
  try {
    chrome.runtime.sendMessage({action: "rulesUpdated"}, (response) => {
      console.log("Background script notification response:", response);
    });
  } catch (err) {
    console.error("Failed to notify background script:", err);
  }
}

// Function to enable global redirect
async function enableGlobalRedirect() {
  await chrome.storage.local.set({enabled: true});
  
  // Notify background script
  try {
    chrome.runtime.sendMessage({action: "rulesUpdated"}, (response) => {
      console.log("Background script notification response:", response);
    });
  } catch (err) {
    console.error("Failed to notify background script:", err);
  }
  
  console.log("Global redirect enabled");
}

// Run the check
checkRuleStatus();

// Export functions for console use
window.debugRuleToggle = {
  checkRuleStatus,
  toggleRule,
  enableJoySection,
  enableGlobalRedirect
};

console.log("Debug functions available in window.debugRuleToggle"); 