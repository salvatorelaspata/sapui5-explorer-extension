# SAPUI5 Explorer

Chrome extension to analyze SAPUI5/OpenUI5 applications running in the browser. Extracts detailed technical information about components, models, bindings, views, controllers, logs and runtime configuration.

Compatible with **UI5 1.x** (1.90+) and **UI5 2.x**.

## Features

- **Framework info** — version, theme, language, debug mode, RTL, accessibility
- **Components** — all registered components with manifest metadata
- **Models** — data models with types and OData service URLs
- **Views & Controllers** — view hierarchy with controller custom methods
- **Bindings** — property bindings grouped by model (30+ properties checked)
- **Logs** — MessageManager messages and UI5 log entries
- **Runtime** — device detection, OS, orientation, touch support
- **Theming** — current theme, RTL, fonts
- **Fiori Launchpad** — user info and personalization status (when available)
- **URL analysis** — Fiori intent, query parameters, technical flags (sap-ui-debug, sap-theme, etc.)
- **Raw JSON export** — copy full analysis data to clipboard

## UI

Tabbed interface with 6 panels:

| Tab | Content |
|-----|---------|
| Overview | Stats, framework, app info, URL analysis |
| Components | Component cards with collapsible models, views, controllers |
| Bindings | Bindings grouped by model in sortable tables |
| Logs | Messages and log entries with severity colors |
| Runtime | Device, theming, fragments, UI5 resources, icons |
| JSON | Raw JSON output with copy button |

## Installation

1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the extension folder
5. The SAPUI5 Explorer icon appears in the toolbar

## Usage

1. Navigate to any SAPUI5/OpenUI5 application
2. Click the extension icon in the toolbar
3. Click **ANALYZE**
4. Browse results across tabs
5. Use the **JSON** tab to copy the full analysis

## UI5 2.x Compatibility

The extension uses a compatibility layer that tries modern UI5 2.x APIs first and falls back to 1.x APIs:

| Feature | UI5 2.x API | UI5 1.x Fallback |
|---------|-------------|-------------------|
| Theme | `sap/ui/core/Theming` | `Core.getConfiguration().getTheme()` |
| Language | `sap/base/i18n/Localization` | `Core.getConfiguration().getLanguage()` |
| RTL | `sap/base/i18n/Localization` | `Core.getConfiguration().getRTL()` |
| Messages | `sap/ui/core/Messaging` | `MessageManager.getInstance()` |

## Project Structure

```
manifest.json   Chrome extension manifest (MV3)
popup.html      Tabbed UI shell
popup.css       Styles (tabs, cards, badges, collapsibles)
popup.js        UI controller (tab switching, rendering, clipboard)
content.js      Extraction engine (injected into page MAIN world)
icons/          Extension icons (16, 48, 128 PNG + SVG source)
```

## Permissions

- `scripting` — inject extraction script into the active tab
- `activeTab` — access the currently active tab
- `host_permissions: <all_urls>` — required because SAP applications run on arbitrary customer domains

## License

MIT
