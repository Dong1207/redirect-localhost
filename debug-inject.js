// Minimal debug script for page console logging

console.log("[REDIRECT-EXTENSION] Debug script loaded");

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.source === "redirect-extension-debug") {
    console.log("[REDIRECT-DEBUG]", ...message.args);
    sendResponse({success: true});
    return true; // Keep the message channel open for async response
  }
});

// Also keep the window.addEventListener for backward compatibility
window.addEventListener("message", (event) => {
  if (event.data && event.data.source === "redirect-extension-debug") {
    console.log("[REDIRECT-DEBUG]", ...event.data.args);
  }
});
