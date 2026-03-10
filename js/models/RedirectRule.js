export class RedirectRule {
  constructor(data = {}) {
    this.fromUrl = data.fromUrl || "";
    this.toUrl = data.toUrl || "";
    this.name = data.name || "";
    this.section = data.section || "Default";
    this.disabled = data.disabled === true;
  }

  testUrl(inputUrl) {
    if (!this.fromUrl || !this.toUrl) return {matches: false};

    if (!this.fromUrl.includes("**")) {
      if (inputUrl === this.fromUrl) {
        return {matches: true, redirectUrl: this.toUrl};
      }
      return {matches: false};
    }

    const [prefix, suffix = ""] = this.fromUrl.split("**");

    if (!inputUrl.startsWith(prefix)) return {matches: false};
    if (suffix && !inputUrl.endsWith(suffix)) return {matches: false};

    const wildcardContent = inputUrl.substring(
      prefix.length,
      suffix ? inputUrl.length - suffix.length : undefined
    );

    const redirectUrl = this.toUrl.includes("**")
      ? this.toUrl.replace("**", wildcardContent)
      : this.toUrl;

    return {matches: true, redirectUrl, wildcardContent};
  }

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
