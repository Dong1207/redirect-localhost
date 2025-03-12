/**
 * RedirectRule.js - Represents a single redirect rule
 */

/**
 * Represents a single redirect rule
 */
export class RedirectRule {
  constructor(data = {}) {
    this.fromUrl = data.fromUrl || "";
    this.toUrl = data.toUrl || "";
    this.name = data.name || "";
    this.section = data.section || "Default";
    this.disabled = data.disabled || false;
  }

  /**
   * Test if a URL matches this rule
   */
  testUrl(inputUrl) {
    if (!this.fromUrl || !this.toUrl) return {matches: false};
    
    // Simple pattern matching for immediate feedback
    const fromPattern = this.fromUrl;
    const toPattern = this.toUrl;
    
    // Check for wildcard pattern
    if (fromPattern.includes("**")) {
      const parts = fromPattern.split("**");
      const prefix = parts[0];
      const suffix = parts[1] || "";
      
      if (inputUrl.startsWith(prefix) && inputUrl.endsWith(suffix)) {
        // Extract the wildcard content
        const wildcardStart = prefix.length;
        const wildcardEnd = inputUrl.length - suffix.length;
        const wildcardContent = inputUrl.substring(wildcardStart, wildcardEnd);
        
        // Replace the wildcard in the target pattern
        let redirectUrl = toPattern;
        if (toPattern.includes("**"))
          redirectUrl = toPattern.replace("**", wildcardContent);
          
        return {
          matches: true,
          redirectUrl: redirectUrl,
          wildcardContent: wildcardContent,
        };
      }
    } else if (inputUrl === fromPattern) {
      // Direct match
      return {matches: true, redirectUrl: toPattern};
    }
    
    return {matches: false};
  }

  /**
   * Convert rule to a plain object for storage
   */
  toObject() {
    return {
      fromUrl: this.fromUrl,
      toUrl: this.toUrl,
      name: this.name,
      section: this.section,
      disabled: this.disabled,
    };
  }
} 