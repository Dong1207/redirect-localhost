/**
 * Utility functions for the Avada Override extension
 */

// DOM manipulation utilities
const DOM = {
  /**
   * Create an element with attributes and children
   * @param {string} tag - Element tag name
   * @param {Object} attrs - Element attributes
   * @param {Array|Node|string} children - Child elements or text content
   * @returns {HTMLElement} The created element
   */
  createElement(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);

    // Set attributes
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "className") {
        element.className = value;
      } else if (key === "innerHTML") {
        element.innerHTML = value;
      } else if (key === "textContent") {
        element.textContent = value;
      } else if (key.startsWith("data-")) {
        element.setAttribute(key, value);
      } else if (key === "style" && typeof value === "object") {
        Object.assign(element.style, value);
      } else {
        element[key] = value;
      }
    });

    // Add children
    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (child)
          element.appendChild(
            typeof child === "string" ? document.createTextNode(child) : child
          );
      });
    } else if (children instanceof Node) {
      element.appendChild(children);
    } else if (children) {
      element.textContent = children;
    }

    return element;
  },

  /**
   * Add event listeners to an element
   * @param {HTMLElement} element - The element to add listeners to
   * @param {Object} events - Event name to handler mapping
   * @returns {HTMLElement} The element with listeners
   */
  addEventListeners(element, events) {
    Object.entries(events).forEach(([event, handler]) => {
      element.addEventListener(event, handler);
    });
    return element;
  },

  /**
   * Create a button with icon
   * @param {string} className - Button class name
   * @param {string} title - Button title/tooltip
   * @param {string} iconClass - Font Awesome icon class
   * @param {Function} onClick - Click handler
   * @returns {HTMLElement} The button element
   */
  createIconButton(className, title, iconClass, onClick, ariaLabel = title) {
    const button = this.createElement("button", {
      className: `btn ${className}`,
      title,
      ariaLabel,
      innerHTML: `<i class="${iconClass}"></i>`,
    });

    if (onClick) {
      button.addEventListener("click", onClick);
    }

    return button;
  },
};

// URL utilities
const URLUtils = {
  /**
   * Extract domain from URL
   * @param {string} url - URL to extract domain from
   * @returns {string} Domain name
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      // If URL is invalid, return original
      return url;
    }
  },

  /**
   * Truncate URL to specified length
   * @param {string} url - URL to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated URL
   */
  truncateUrl(url, maxLength = 30) {
    if (!url || url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + "...";
  },

  /**
   * Check if URL is valid for redirection
   * @param {string} url - URL to validate
   * @returns {boolean} Whether URL is valid
   */
  isValidRedirectUrl(url) {
    // URL must not be empty
    if (!url) return false;

    // URL must start with http:// or https://
    if (!url.startsWith("http://") && !url.startsWith("https://")) return false;

    // If URL contains wildcards, make sure they're valid
    if (url.includes("**")) {
      // Only one wildcard pattern is allowed
      if ((url.match(/\*\*/g) || []).length > 1) return false;
    }

    return true;
  },
};

// Export utilities
export {DOM, URLUtils};
