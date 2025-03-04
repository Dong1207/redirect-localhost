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

    // Alternatively, we could get it from the background
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

    console.log(`Testing: ${inputUrl} against rule:`, rule);
    
    // Always use the background script's matching logic for consistency
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "testUrlMatch",
          inputUrl: inputUrl,
          rule: rule,
        },
        (response) => {
          console.log("Background match test response:", response);
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

      console.log("Testing URL:", inputUrl);
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

  // Add a button at the top to diagnose active rules
  function initDiagnosticTools() {
    const statsSection = document.querySelector('.stats');
    if (!statsSection) return;
    
    // Add a diagnostic button
    const diagButton = document.createElement('button');
    diagButton.textContent = 'Diagnose Rules';
    diagButton.className = 'btn diag-btn';
    diagButton.style.marginLeft = '10px';
    diagButton.style.backgroundColor = '#2196F3';
    diagButton.style.color = 'white';
    diagButton.style.fontSize = '12px';
    diagButton.style.padding = '4px 8px';
    
    diagButton.addEventListener('click', async () => {
      // Get active rules from background
      chrome.runtime.sendMessage({action: 'getActiveRules'}, (response) => {
        if (response.error) {
          alert(`Error: ${response.error}`);
          return;
        }
        
        const rules = response.rules || [];
        console.log('Active rules:', rules);
        
        // Create a modal to display rules
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        modal.style.zIndex = '1000';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        
        const content = document.createElement('div');
        content.style.backgroundColor = 'white';
        content.style.padding = '20px';
        content.style.borderRadius = '5px';
        content.style.maxWidth = '80%';
        content.style.maxHeight = '80%';
        content.style.overflow = 'auto';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.className = 'btn';
        closeBtn.style.marginTop = '10px';
        closeBtn.addEventListener('click', () => document.body.removeChild(modal));
        
        if (rules.length === 0) {
          content.innerHTML = '<h3>No Active Rules</h3><p>There are no active redirect rules.</p>';
        } else {
          content.innerHTML = `<h3>Active Rules (${rules.length})</h3>`;
          
          const rulesList = document.createElement('ul');
          rulesList.style.listStyle = 'none';
          rulesList.style.padding = '0';
          
          rules.forEach(rule => {
            const li = document.createElement('li');
            li.style.marginBottom = '10px';
            li.style.padding = '10px';
            li.style.backgroundColor = '#f5f5f5';
            li.style.borderRadius = '4px';
            
            let ruleText = `<strong>Rule ID: ${rule.id}</strong><br>`;
            
            if (rule.condition.regexFilter) {
              ruleText += `Pattern: ${rule.condition.regexFilter}<br>`;
            } else if (rule.condition.urlFilter) {
              ruleText += `URL Filter: ${rule.condition.urlFilter}<br>`;
            }
            
            if (rule.action.redirect.regexSubstitution) {
              ruleText += `Redirect to: ${rule.action.redirect.regexSubstitution}<br>`;
            } else if (rule.action.redirect.url) {
              ruleText += `Redirect to: ${rule.action.redirect.url}<br>`;
            }
            
            ruleText += `Resource Types: ${rule.condition.resourceTypes.join(', ')}`;
            
            li.innerHTML = ruleText;
            rulesList.appendChild(li);
          });
          
          content.appendChild(rulesList);
        }
        
        content.appendChild(closeBtn);
        modal.appendChild(content);
        document.body.appendChild(modal);
      });
    });
    
    statsSection.appendChild(diagButton);
  }

  // Call this function after loading settings
  document.addEventListener("DOMContentLoaded", () => {
    // ...existing initialization code...
    
    // Add diagnostic tools
    setTimeout(initDiagnosticTools, 100);
  });
});
