/**
 * HistoryUI.js - UI components for managing redirect history
 */
import { DOM, URLUtils } from '../../utils.js';

/**
 * Handles UI operations for redirect history
 */
export class HistoryUI {
  /**
   * Load redirect history from storage
   * @param {HTMLElement} container - Container element
   */
  static loadRedirectHistory(container) {
    chrome.storage.local.get(["redirectHistory"], (result) => {
      const history = result.redirectHistory || [];
      container.innerHTML = "";

      if (history.length === 0) {
        container.appendChild(
          DOM.createElement(
            "div",
            {className: "history-empty"},
            "No redirects recorded yet."
          )
        );
        return;
      }

      // Sort by timestamp descending (newest first)
      history.sort((a, b) => b.timestamp - a.timestamp);

      // Create history items directly instead of using the component
      history.forEach(item => {
        const { fromUrl, toUrl, timestamp } = item;
        
        // Format timestamp
        const date = new Date(timestamp);
        const dateTimeString = date.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const isIncomplete = !toUrl || toUrl === "Unknown destination";
        
        const historyItem = DOM.createElement("div", {
          className: isIncomplete ? "history__item history__item--incomplete" : "history__item"
        }, [
          DOM.createElement("div", { className: "history__from" }, [
            DOM.createElement("strong", {}, "From"),
            DOM.createElement("span", { textContent: fromUrl })
          ]),
          DOM.createElement("div", { className: "history__to" }, [
            DOM.createElement("strong", {}, "To"),
            DOM.createElement("span", { textContent: isIncomplete ? "Unknown destination" : toUrl })
          ]),
          DOM.createElement("div", { className: "history__time", textContent: dateTimeString })
        ]);
        
        container.appendChild(historyItem);
      });
    });
  }

  /**
   * Clear redirect history
   * @param {HTMLElement} container - Container element
   */
  static clearRedirectHistory(container) {
    chrome.runtime.sendMessage({action: "clearRedirectHistory"}, () => {
      this.loadRedirectHistory(container);
    });
  }
} 