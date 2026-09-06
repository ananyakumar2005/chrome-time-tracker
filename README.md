# Reading Time Tracker (v0.2.0)

A Chrome extension (Manifest V3) that tracks active browsing time per domain and categorizes your time into **Social Media**, **Studying**, **Entertainment**, **Work**, **Other**, and **Custom Categories**.

## Features

- **Event-Driven Active Tab Tracking**: Computes exact timestamps on tab switches, window focus changes, idle states (60s threshold), and browser suspensions to preserve battery and survive MV3 service worker restarts.
- **Content Script Heartbeat**: Detects genuine user interaction (scrolling, clicking, typing) to differentiate active reading from passive open tabs.
- **Category Engine**: Bundled default mapping for popular sites, intelligent keyword fallback (e.g. `edu`, `lms`, `stream`, `jira`), plus full user override capabilities.
- **Custom Categories**: Define your own categories with custom display names and hex color pickers.
- **Visual Popup Dashboard**:
  - SVG Donut chart with smooth animated segment rendering.
  - Range toggle: Today, Week (7 days), and Month (30 days).
  - Real-time live tracking session pill with live counter.
  - Animated category progress bars with duration and percentages.
  - Top sites list with category chips.
  - Dynamic extension badge displaying today's total reading time (e.g., `45m`, `1.5h`).
- **Options Dashboard**:
  - **History & Trends**: Interactive 30-day SVG bar chart with hover tooltips and 30-day total badge.
  - **Domain Rules**: Searchable table of tracked domains with category dropdown overrides and reset actions.
  - **Custom Categories**: Form to create and manage custom categories.
  - **Daily Goals & Limits**: Set per-category daily thresholds; triggers Chrome desktop notifications upon reaching daily limits.
  - **Data Export & Privacy**: Export complete history as JSON or CSV; automated 90-day rolling data pruning; one-click local data wipe.

## How to Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `reading-time-tracker/` folder.
5. Pin the extension to your toolbar. Browse web pages, and click the extension icon to view your live stats!

## File Structure

```
reading-time-tracker/
├── manifest.json         # Manifest V3 configuration & permissions
├── background.js         # Service worker tracking active sessions & goals
├── content-script.js     # User interaction / reading activity detection
├── lib/
│   ├── categorizer.js    # Domain classification engine & rules
│   ├── storage.js        # Local storage CRUD, custom categories, goals & pruning
│   └── timeTracker.js    # Shared time conversion & calculation utilities
├── popup/
│   ├── popup.html        # Extension popup modal structure
│   ├── popup.css         # Modern glassmorphism UI & responsive styles
│   └── popup.js          # SVG donut chart, live indicator & UI rendering
├── options/
│   ├── options.html      # Comprehensive settings & history dashboard
│   ├── options.css       # Clean dashboard styling & chart layouts
│   └── options.js        # 30-day trend chart, domain rules, CSV export & goals
└── icons/                # Extension action & store icons (16x16, 48x48, 128x128)
```
