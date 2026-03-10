# Avada Override

A Chrome extension (Manifest V3) that redirects HTTP/HTTPS requests from specific domains to localhost or other destinations for development and testing.

## Features

- **URL Redirect Rules** - Define from/to URL pairs with `**` wildcard support for partial matching
- **Sections** - Organize rules into collapsible sections, each can be toggled independently
- **Import/Export** - Save and load rules as JSON files with duplicate detection (skip or override)
- **Debug Panel** - View redirect history, active rules, and optionally log redirects to page console
- **Real-time Validation** - Auto-validates URLs and disables invalid rules

## How It Works

1. Click the extension icon to open the side panel
2. Create sections to organize your redirect rules
3. Add rules with source URL (`https://cdn.example.com/**`) and target URL (`http://localhost:3000/**`)
4. Toggle the main switch to enable/disable all redirects
5. The `**` wildcard captures any path segment and substitutes it in the target URL

## Project Structure

```
├── manifest.json                 # Extension configuration (MV3)
├── background.js                 # Service worker - request interception & history
├── redirect-manager.html         # Popup UI template
├── redirect-manager.js           # Popup entry point
├── redirect-manager.css          # Main styles
├── button-effects.css            # Button animations
├── utils.js                      # DOM & URL utilities
├── js/
│   ├── app.js                    # App initialization
│   ├── models/
│   │   ├── RedirectRule.js       # Rule data model
│   │   └── RuleManager.js        # Rule collection & persistence
│   └── ui/
│       ├── PopupUI.js            # Main popup controller
│       ├── RuleUI.js             # Rule UI component
│       ├── SectionUI.js          # Section UI component
│       ├── HistoryUI.js          # Redirect history display
│       └── ImportExportUI.js     # JSON import/export
└── icons/                        # Extension icons
```

## Architecture

- **Models** - Data and business logic (`RedirectRule`, `RuleManager`)
- **UI Controllers** - Separated concerns per feature (`PopupUI`, `RuleUI`, `SectionUI`, `HistoryUI`, `ImportExportUI`)
- **Utils** - Shared DOM manipulation and URL validation helpers
- **Background** - Chrome `declarativeNetRequest` API for actual request interception

ES6 modules loaded via `<script type="module">`. No build step required.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Persist rules and settings |
| `declarativeNetRequest` | Intercept and redirect requests |
| `declarativeNetRequestFeedback` | Track redirect history |
| `webRequest` | Monitor network requests |
| `scripting` (optional) | Log redirects to page console |

## Development

Edit the appropriate module based on the feature. Load the extension in Chrome via `chrome://extensions` > "Load unpacked".
