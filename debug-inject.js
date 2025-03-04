// Minimal debug script for page console logging

console.log("[REDIRECT-EXTENSION] Debug script loaded");

window.addEventListener("message", (event) => {
  if (event.data && event.data.source === "redirect-extension-debug") {
    console.log("[REDIRECT-DEBUG]", ...event.data.args);
  }
});
