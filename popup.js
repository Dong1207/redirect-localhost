document.addEventListener("DOMContentLoaded", () => {
  const enableToggle = document.getElementById("enableToggle");
  const redirectCountElem = document.getElementById("redirectCount");
  const rulesContainer = document.getElementById("rulesContainer");
  const addRuleBtn = document.getElementById("addRuleBtn");
  const ruleTemplate = document.getElementById("ruleTemplate");

  let redirectRules = [];

  // Initialize popup
  loadSettings();
  updateRedirectCount();

  // Add event listeners
  enableToggle.addEventListener("change", toggleRedirect);
  addRuleBtn.addEventListener("click", addNewRule);

  // Load settings from storage
  function loadSettings() {
    chrome.storage.local.get(["redirectRules", "enabled"], (result) => {
      // Set enabled state
      enableToggle.checked = result.enabled || false;

      // Load rules
      redirectRules = result.redirectRules || [];
      displayRules();
    });
  }

  // Toggle redirect functionality
  function toggleRedirect() {
    chrome.storage.local.set({enabled: enableToggle.checked});
  }

  // Get and display redirect count
  function updateRedirectCount() {
    chrome.storage.local.get(["redirectCount"], (result) => {
      redirectCountElem.textContent = result.redirectCount || 0;
    });

    // Get count from background service worker
    chrome.runtime.sendMessage({action: "getRedirectCount"}, (response) => {
      if (response && response.count !== undefined) {
        redirectCountElem.textContent = response.count;
      }
    });
  }

  // Display all rules in the UI
  function displayRules() {
    // Clear existing rules
    rulesContainer.innerHTML = "";

    // Add each rule to the UI
    redirectRules.forEach((rule, index) => {
      const ruleElement = createRuleElement(rule, index);
      rulesContainer.appendChild(ruleElement);
    });
  }

  // Test if a URL would be redirected by a rule
  function testRedirect(inputUrl, rule) {
    if (!rule.fromUrl || !rule.toUrl) return null;
    
    // Use the background script's matching logic for consistency
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "testUrlMatch",
          inputUrl: inputUrl,
          rule: rule,
        },
        (response) => {
          if (response && response.matched) {
            resolve(response.redirectUrl);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  // Create a rule element from template
  function createRuleElement(rule = {}, index) {
    const ruleClone = document.importNode(ruleTemplate.content, true);
    const ruleItem = ruleClone.querySelector(".rule-item");

    // Set rule values
    const fromUrlInput = ruleItem.querySelector(".from-url-input");
    const toUrlInput = ruleItem.querySelector(".to-url-input");

    fromUrlInput.value = rule.fromUrl || "";
    toUrlInput.value = rule.toUrl || "";

    // Update rule title
    updateRuleTitle(ruleItem, rule);

    // Set resource types checkboxes
    if (rule.resourceTypes && rule.resourceTypes.length > 0) {
      const checkboxes = ruleItem.querySelectorAll(".resource-types input");
      checkboxes.forEach((cb) => {
        cb.checked = rule.resourceTypes.includes(cb.value);
      });
    }

    // Add event listeners to inputs for saving changes
    fromUrlInput.addEventListener("change", () => {
      updateRule(index);
      updateRuleTitle(ruleItem, redirectRules[index]);
    });

    toUrlInput.addEventListener("change", () => {
      updateRule(index);
      updateRuleTitle(ruleItem, redirectRules[index]);
    });

    const resourceCheckboxes = ruleItem.querySelectorAll(
      ".resource-types input"
    );
    resourceCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", () => updateRule(index));
    });

    // Add delete button functionality
    ruleItem.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRule(index);
    });

    // Add toggle collapse functionality
    const ruleHeader = ruleItem.querySelector(".rule-header");
    ruleHeader.addEventListener("click", () => {
      ruleItem.classList.toggle("collapsed");
      const icon = ruleHeader.querySelector(".collapse-icon i");
      if (ruleItem.classList.contains("collapsed")) {
        icon.className = "fas fa-chevron-right";
      } else {
        icon.className = "fas fa-chevron-down";
      }
    });

    // Add test functionality
    const testBtn = ruleItem.querySelector(".test-btn");
    const testInput = ruleItem.querySelector(".test-input");
    const testResult = ruleItem.querySelector(".test-result");

    testBtn.addEventListener("click", async () => {
      const inputUrl = testInput.value.trim();
      if (!inputUrl) {
        testResult.textContent = "Please enter a URL to test";
        testResult.className = "test-result error";
        return;
      }

      const redirectedUrl = await testRedirect(inputUrl, rule);

      if (redirectedUrl) {
        testResult.innerHTML = `Will redirect to:<br><strong>${redirectedUrl}</strong>`;
        testResult.className = "test-result success";
      } else {
        testResult.innerHTML = `
          URL doesn't match this rule pattern<br>
          <small>Input: ${inputUrl}<br>Pattern: ${rule.fromUrl}</small>
        `;
        testResult.className = "test-result error";
      }
    });

    // Set data attribute for identifying the rule
    ruleItem.dataset.ruleIndex = index;

    return ruleItem;
  }

  // Update rule title based on URLs
  function updateRuleTitle(ruleElement, rule) {
    const ruleTitle = ruleElement.querySelector(".rule-title");
    if (rule.fromUrl && rule.toUrl) {
      const fromDomain = extractDomain(rule.fromUrl);
      const toDomain = extractDomain(rule.toUrl);
      ruleTitle.textContent = `${fromDomain} => ${toDomain}`;
    } else {
      ruleTitle.textContent = "New Rule";
    }
  }

  // Helper to extract domain from URL
  function extractDomain(url) {
    try {
      if (!url.includes("://")) url = "https://" + url;
      const domain = new URL(url).hostname;
      return domain || url;
    } catch (e) {
      return url;
    }
  }

  // Add a new rule
  function addNewRule() {
    const newRule = {
      fromUrl: "",
      toUrl: "",
      resourceTypes: [
        "main_frame",
        "stylesheet",
        "script",
        "image",
        "xmlhttprequest",
        "other",
      ],
    };

    redirectRules.push(newRule);
    saveRules();

    // Add the new rule to UI
    const ruleElement = createRuleElement(newRule, redirectRules.length - 1);
    rulesContainer.appendChild(ruleElement);
  }

  // Update a rule based on UI changes
  function updateRule(index) {
    const ruleElement = document.querySelector(
      `.rule-item[data-rule-index="${index}"]`
    );
    if (!ruleElement) return;

    const fromUrl = ruleElement.querySelector(".from-url-input").value;
    const toUrl = ruleElement.querySelector(".to-url-input").value;

    // Get selected resource types
    const resourceCheckboxes = ruleElement.querySelectorAll(
      ".resource-types input:checked"
    );
    const resourceTypes = Array.from(resourceCheckboxes).map((cb) => cb.value);

    // Update the rule object
    redirectRules[index] = {
      fromUrl,
      toUrl,
      resourceTypes,
    };

    saveRules();
  }

  // Delete a rule
  function deleteRule(index) {
    redirectRules.splice(index, 1);
    saveRules();
    displayRules(); // Refresh all rules to update indices
  }

  // Save rules to storage
  function saveRules() {
    chrome.storage.local.set({redirectRules});
  }

  // Add a button to diagnose active rules
  function initDiagnosticTools() {
    const statsSection = document.querySelector('.stats');
    if (!statsSection) return;
    
    // Add diagnostic button
    const diagButton = document.createElement('button');
    diagButton.textContent = 'Diagnose Rules';
    diagButton.className = 'btn diag-btn';
    diagButton.style.marginLeft = '10px';
    diagButton.style.fontSize = '12px';
    diagButton.style.padding = '4px 8px';
    
    diagButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({action: 'getActiveRules'}, (response) => {
        if (response.error) {
          alert(`Error: ${response.error}`);
          return;
        }
        
        const rules = response.rules || [];
        
        // Create simple report
        let report = `Active Rules: ${rules.length}\n\n`;
        
        rules.forEach((rule) => {
          report += `--- Rule ${rule.id} ---\n`;
          
          if (rule.condition.regexFilter) {
            report += `Pattern: ${rule.condition.regexFilter}\n`;
          } else if (rule.condition.urlFilter) {
            report += `URL Filter: ${rule.condition.urlFilter}\n`;
          }
          
          if (rule.action.redirect.regexSubstitution) {
            report += `Redirect: ${rule.action.redirect.regexSubstitution}\n`;
          } else if (rule.action.redirect.url) {
            report += `Redirect: ${rule.action.redirect.url}\n`;
          }
          
          report += `Resources: ${rule.condition.resourceTypes.join(', ')}\n\n`;
        });
        
        alert(report);
      });
    });
    
    statsSection.appendChild(diagButton);
  }

  // Add debug toggle at the top
  function initDebugToggle() {
    const statsSection = document.querySelector('.stats');
    if (!statsSection) return;
    
    const debugToggle = document.createElement('div');
    debugToggle.style.display = 'flex';
    debugToggle.style.alignItems = 'center';
    debugToggle.style.marginLeft = '10px';
    debugToggle.style.fontSize = '12px';
    
    const debugToggleLabel = document.createElement('label');
    debugToggleLabel.className = 'switch';
    debugToggleLabel.style.marginRight = '6px';
    debugToggleLabel.style.transform = 'scale(0.8)';
    
    const debugToggleInput = document.createElement('input');
    debugToggleInput.type = 'checkbox';
    
    const debugToggleSlider = document.createElement('span');
    debugToggleSlider.className = 'slider round';
    
    const debugToggleText = document.createElement('span');
    debugToggleText.textContent = 'Debug';
    
    debugToggleLabel.appendChild(debugToggleInput);
    debugToggleLabel.appendChild(debugToggleSlider);
    debugToggle.appendChild(debugToggleLabel);
    debugToggle.appendChild(debugToggleText);
    
    statsSection.appendChild(debugToggle);
    
    // Toggle debug mode
    debugToggleInput.addEventListener('change', () => {
      chrome.runtime.sendMessage({
        action: 'toggleDebugToPage',
        enabled: debugToggleInput.checked
      });
    });
  }

  // Initialize diagnostic tools
  initDiagnosticTools();
  initDebugToggle();
});
