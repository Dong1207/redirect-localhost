// Script để sửa lỗi rule__status không cập nhật
console.log("Fix Status Update script loaded");

// Hàm để sửa lỗi rule__status không cập nhật
async function fixStatusUpdateIssue() {
  console.log("Đang sửa lỗi rule__status không cập nhật...");
  
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
  
  console.log("Đã sửa lỗi rule__status không cập nhật");
  console.log("Vui lòng đóng và mở lại popup để thấy thay đổi");
  
  return {
    rules: result.redirectRules,
    sections,
    enabled
  };
}

// Hàm để thêm CSS trực tiếp vào trang
function injectCSS() {
  const css = `
    /* Thêm hiệu ứng khi bấm nút */
    .rule__toggle-btn:active, .section__toggle-btn:active {
      transform: scale(0.8);
      transition: transform 0.1s;
    }
    
    /* Thêm hiệu ứng cho rule__status */
    .rule__status {
      transition: all 0.3s ease;
    }
    
    .rule__status--active {
      background-color: #4CAF50 !important;
      box-shadow: 0 0 5px #4CAF50 !important;
    }
    
    .rule__status--inactive {
      background-color: #f44336 !important;
      box-shadow: 0 0 5px #f44336 !important;
    }
    
    /* Thêm hiệu ứng cho rule__toggle-btn */
    .rule__toggle-btn {
      transition: all 0.2s ease;
    }
    
    .rule__toggle-btn--inactive {
      opacity: 0.6 !important;
    }
    
    /* Thêm hiệu ứng flash khi bấm nút */
    @keyframes button-flash {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.8; }
      100% { transform: scale(1); opacity: 1; }
    }
    
    .button-flash {
      animation: button-flash 0.3s ease-in-out;
    }
  `;
  
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  
  console.log("Đã thêm CSS vào trang");
}

// Hàm để thêm event listener cho các nút toggle
function addToggleListeners() {
  // Tìm tất cả các nút toggle
  const toggleButtons = document.querySelectorAll('.rule__toggle-btn');
  
  toggleButtons.forEach(button => {
    // Thêm hiệu ứng flash khi bấm nút
    button.addEventListener('click', function() {
      this.classList.add('button-flash');
      setTimeout(() => {
        this.classList.remove('button-flash');
      }, 300);
      
      // Tìm rule element
      const ruleElement = this.closest('.rule');
      if (!ruleElement) return;
      
      // Tìm status indicator
      const statusIndicator = ruleElement.querySelector('.rule__status');
      if (!statusIndicator) return;
      
      // Toggle status indicator class
      if (this.classList.contains('rule__toggle-btn--inactive')) {
        statusIndicator.classList.remove('rule__status--active');
        statusIndicator.classList.add('rule__status--inactive');
      } else {
        statusIndicator.classList.remove('rule__status--inactive');
        statusIndicator.classList.add('rule__status--active');
      }
    });
  });
  
  console.log("Đã thêm event listener cho các nút toggle");
}

// Hàm để sửa lỗi trực tiếp trên trang
function fixOnPage() {
  // Thêm CSS
  injectCSS();
  
  // Thêm event listener cho các nút toggle
  addToggleListeners();
  
  // Override hàm updateRuleStatus
  if (window.RuleUI && window.RuleUI.updateRuleStatus) {
    const originalUpdateRuleStatus = window.RuleUI.updateRuleStatus;
    
    window.RuleUI.updateRuleStatus = function(ruleElement, rule, isEnabled, sectionEnabled = true) {
      // Gọi hàm gốc
      originalUpdateRuleStatus.call(this, ruleElement, rule, isEnabled, sectionEnabled);
      
      // Thêm code để đảm bảo status indicator được cập nhật đúng cách
      const statusIndicator = ruleElement.querySelector(".rule__status");
      const toggleBtn = ruleElement.querySelector(".rule__toggle-btn");
      
      if (statusIndicator && toggleBtn) {
        if (rule.disabled) {
          statusIndicator.classList.remove("rule__status--active");
          statusIndicator.classList.add("rule__status--inactive");
          toggleBtn.classList.add("rule__toggle-btn--inactive");
        } else {
          if (isEnabled && sectionEnabled) {
            statusIndicator.classList.add("rule__status--active");
            statusIndicator.classList.remove("rule__status--inactive");
            toggleBtn.classList.remove("rule__toggle-btn--inactive");
          }
        }
      }
    };
    
    console.log("Đã override hàm updateRuleStatus");
  } else {
    console.log("Không tìm thấy hàm updateRuleStatus");
  }
}

// Chạy hàm sửa lỗi
const result = fixStatusUpdateIssue();

// Export các hàm để sử dụng trong console
window.fixStatusUpdate = {
  fixStatusUpdateIssue,
  injectCSS,
  addToggleListeners,
  fixOnPage
};

console.log("Các hàm sửa lỗi có sẵn trong window.fixStatusUpdate");
console.log("Bạn có thể gọi window.fixStatusUpdate.fixOnPage() để sửa lỗi trực tiếp trên trang"); 