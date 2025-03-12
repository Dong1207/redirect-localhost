// Script để sửa lỗi rule toggle
console.log("Fix Rule Toggle script loaded");

// Hàm để sửa lỗi rule toggle
async function fixRuleToggleIssue() {
  console.log("Đang sửa lỗi rule toggle...");
  
  // Lấy rules từ storage
  const result = await chrome.storage.local.get(["redirectRules", "enabled", "sections"]);
  
  if (!result.redirectRules || !Array.isArray(result.redirectRules)) {
    console.log("Không tìm thấy rules trong storage");
    return;
  }
  
  // Đảm bảo section Joy được enable
  const sections = result.sections || {};
  if (!sections.Joy) sections.Joy = {enabled: true};
  else sections.Joy.enabled = true;
  
  // Đảm bảo global redirect được enable
  const enabled = true;
  
  // Lưu các thay đổi
  await chrome.storage.local.set({sections, enabled});
  
  // Thông báo cho background script
  try {
    // Đặt timeout để tránh lỗi message port closed
    setTimeout(() => {
      chrome.runtime.sendMessage({action: "rulesUpdated"}, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Background notification status: " + chrome.runtime.lastError.message);
          console.log("Đã lưu thay đổi nhưng không thể thông báo cho background script");
        } else {
          console.log("Đã thông báo cho background script thành công");
        }
      });
    }, 0);
    
    console.log("Đã sửa lỗi rule toggle thành công");
    console.log("Vui lòng đóng và mở lại popup để thấy thay đổi");
  } catch (err) {
    console.error("Lỗi khi thông báo cho background script:", err);
    console.log("Đã lưu thay đổi nhưng không thể thông báo cho background script");
  }
}

// Hàm để toggle rule trực tiếp
async function toggleRuleDirectly(ruleName) {
  console.log(`Đang toggle rule "${ruleName}"...`);
  
  // Lấy rules từ storage
  const result = await chrome.storage.local.get(["redirectRules"]);
  
  if (!result.redirectRules || !Array.isArray(result.redirectRules)) {
    console.log("Không tìm thấy rules trong storage");
    return;
  }
  
  // Tìm rule theo tên
  const ruleIndex = result.redirectRules.findIndex(r => r.name === ruleName);
  
  if (ruleIndex < 0) {
    console.log(`Không tìm thấy rule "${ruleName}"`);
    return;
  }
  
  // Toggle trạng thái disabled
  result.redirectRules[ruleIndex].disabled = !result.redirectRules[ruleIndex].disabled;
  
  // Lưu lại vào storage
  await chrome.storage.local.set({redirectRules: result.redirectRules});
  
  // Thông báo cho background script với timeout
  setTimeout(() => {
    chrome.runtime.sendMessage({action: "rulesUpdated"}, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Background notification status: " + chrome.runtime.lastError.message);
        console.log("Đã lưu thay đổi nhưng không thể thông báo cho background script");
      } else {
        console.log("Đã thông báo cho background script thành công");
      }
    });
  }, 0);
  
  console.log(`Đã toggle rule "${ruleName}" thành ${result.redirectRules[ruleIndex].disabled ? 'disabled' : 'enabled'}`);
  console.log("Vui lòng đóng và mở lại popup để thấy thay đổi");
}

// Chạy hàm sửa lỗi
fixRuleToggleIssue();

// Export các hàm để sử dụng trong console
window.fixRuleToggle = {
  fixRuleToggleIssue,
  toggleRuleDirectly
};

console.log("Các hàm sửa lỗi có sẵn trong window.fixRuleToggle");
console.log("Bạn có thể gọi window.fixRuleToggle.toggleRuleDirectly('111') để toggle rule '111'"); 