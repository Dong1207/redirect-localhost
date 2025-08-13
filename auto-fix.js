// Script để tự động sửa lỗi khi popup được mở
(function() {
  console.log("Auto-fix script loaded");
  
  // Thêm CSS vào trang
  function injectCSS() {
    const css = `
      /* Thêm hiệu ứng khi bấm nút */
      .rule__toggle-btn:active, .section__toggle-btn:active {
        transform: scale(0.8) !important;
        transition: transform 0.1s !important;
      }
      
      /* Thêm hiệu ứng cho rule__status */
      .rule__status {
        transition: all 0.3s ease !important;
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
        transition: all 0.2s ease !important;
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
        animation: button-flash 0.3s ease-in-out !important;
      }
    `;
    
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    
    console.log("CSS injected");
  }
  
  // Thêm event listener cho các nút toggle
  function addToggleListeners() {
    // Đợi DOM được tải đầy đủ
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupListeners);
    } else {
      setupListeners();
    }
    
    function setupListeners() {
      // Đợi một chút để đảm bảo các rule đã được tạo
      setTimeout(() => {
        // Tìm tất cả các nút toggle
        const toggleButtons = document.querySelectorAll('.rule__toggle-btn');
        
        toggleButtons.forEach(button => {
          // Thêm hiệu ứng flash khi bấm nút
          button.addEventListener('click', function(e) {
            // Thêm hiệu ứng flash
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
            
            // Lấy trạng thái hiện tại
            const isCurrentlyActive = !this.classList.contains('rule__toggle-btn--inactive');
            
            // Toggle status indicator class
            if (isCurrentlyActive) {
              // Nếu đang active, chuyển sang inactive
              setTimeout(() => {
                statusIndicator.classList.remove('rule__status--active');
                statusIndicator.classList.add('rule__status--inactive');
                this.classList.add('rule__toggle-btn--inactive');
                ruleElement.setAttribute('data-disabled', 'true');
              }, 50);
            } else {
              // Nếu đang inactive, chuyển sang active
              setTimeout(() => {
                statusIndicator.classList.add('rule__status--active');
                statusIndicator.classList.remove('rule__status--inactive');
                this.classList.remove('rule__toggle-btn--inactive');
                ruleElement.removeAttribute('data-disabled');
              }, 50);
            }
          }, true);
        });
        
        console.log(`Added event listeners to ${toggleButtons.length} toggle buttons`);
      }, 500);
    }
  }
  
  // Thêm MutationObserver để theo dõi các thay đổi trong DOM
  function setupMutationObserver() {
    // Tạo một observer để theo dõi các thay đổi trong DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Kiểm tra xem có rule mới được thêm vào không
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && (node.classList?.contains('rule') || node.querySelector?.('.rule'))) {
              // Tìm các nút toggle trong rule mới
              const toggleButtons = node.classList?.contains('rule') 
                ? [node.querySelector('.rule__toggle-btn')] 
                : node.querySelectorAll('.rule__toggle-btn');
              
              if (toggleButtons) {
                toggleButtons.forEach(button => {
                  if (!button) return;
                  
                  // Thêm event listener cho nút toggle
                  button.addEventListener('click', function(e) {
                    // Thêm hiệu ứng flash
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
                    
                    // Lấy trạng thái hiện tại
                    const isCurrentlyActive = !this.classList.contains('rule__toggle-btn--inactive');
                    
                    // Toggle status indicator class
                    if (isCurrentlyActive) {
                      // Nếu đang active, chuyển sang inactive
                      setTimeout(() => {
                        statusIndicator.classList.remove('rule__status--active');
                        statusIndicator.classList.add('rule__status--inactive');
                        this.classList.add('rule__toggle-btn--inactive');
                        ruleElement.setAttribute('data-disabled', 'true');
                      }, 50);
                    } else {
                      // Nếu đang inactive, chuyển sang active
                      setTimeout(() => {
                        statusIndicator.classList.add('rule__status--active');
                        statusIndicator.classList.remove('rule__status--inactive');
                        this.classList.remove('rule__toggle-btn--inactive');
                        ruleElement.removeAttribute('data-disabled');
                      }, 50);
                    }
                  }, true);
                });
                
                console.log(`Added event listeners to new toggle buttons`);
              }
            }
          });
        }
      });
    });
    
    // Bắt đầu theo dõi các thay đổi trong DOM
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      console.log("MutationObserver setup complete");
    });
  }
  
  // Chạy các hàm sửa lỗi
  injectCSS();
  addToggleListeners();
  setupMutationObserver();
  
  console.log("Auto-fix script completed");
})(); 