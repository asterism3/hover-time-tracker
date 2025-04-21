# ⏱️ Hover Time Tracker

Track how long you hover over each note in Obsidian—turn curiosity into data.

## 💡 Features

- Logs hover time for each note
- Displays daily stats in a donut chart
- Shows total time spent today in the status bar
- Interactive sidebar panel for insights

## 🚀 How It Works

1. Starts counting time only when the Obsidian tab is active
2. Data is stored locally in `data.json`
3. Time is visualized using ECharts in a side panel
4. Total hover time today is shown directly on the status bar

## 📦 Files

- `main.ts`: Core plugin logic
- `style.css`: Plugin styling
- `manifest.json`: Plugin metadata

## 📊 Visual Preview

The plugin includes a side panel with:
- A donut chart of hover time per note
- Interactive legend
- Central display of total time (in minutes)

## 🛠️ Installation

1. Clone this repo
2. Copy `main.js`, `manifest.json`, and `style.css` into your Obsidian plugin folder
3. Enable the plugin from Obsidian settings

---

Made for power users who want their time to mean something.
