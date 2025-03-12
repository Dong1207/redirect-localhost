# Redirect Localhost Extension

This extension allows you to redirect URLs to localhost or other destinations based on configurable rules.

## Project Structure

The codebase has been refactored to use a modular architecture:

```
.
├── js/
│   ├── app.js               # Main application entry point
│   ├── models/              # Data models
│   │   ├── RedirectRule.js  # Rule model
│   │   └── RuleManager.js   # Rule management
│   └── ui/                  # UI controllers
│       ├── HistoryUI.js     # History UI controller
│       ├── ImportExportUI.js # Import/Export UI controller
│       ├── PopupUI.js       # Main popup UI controller
│       ├── RuleUI.js        # Rule UI controller
│       └── SectionUI.js     # Section UI controller
├── utils.js                 # Utility functions
├── popup.js                 # Entry point for the popup
├── popup.html               # Popup HTML
└── popup.css                # Popup styles
```

## Architecture

The extension follows a modular architecture:

- **Models**: Handle data and business logic
- **UI Controllers**: Handle UI interactions and updates
- **Utils**: Utility functions for DOM manipulation and URL handling

## Development

To modify the extension:

1. Edit the appropriate module based on the feature you're working on
2. Follow the existing patterns for consistency

## Building

The extension is built using vanilla JavaScript modules. No build step is required. 