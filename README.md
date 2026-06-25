# Newton Seismic Monitor

Real-time earthquake monitoring dashboard powered by [Newton](https://www.archetypeai.dev/) and the [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/).

Newton analyzes live USGS earthquake data to identify patterns — aftershock sequences, regional clustering, and unusual seismic activity. Unlike the camera-based demos, this project showcases Newton's **text reasoning** capability via the direct query API.

![Newton Seismic Monitor](static/demo.png)

## Features

- **Live earthquake feed** — real-time list from USGS, auto-refreshes every 60 seconds
- **Magnitude chart** — scatter plot of earthquake magnitudes over time, color-coded by severity
- **Feed filters** — switch between time ranges (1h, 24h, 7d) and magnitude thresholds (All, M2.5+, M4.5+, Significant)
- **Stats bar** — live event count, max magnitude, M5+/M4+/M3+ breakdowns
- **Newton chat** — ask Newton about current seismic activity with full earthquake data as context
- **Clickable events** — each earthquake links to its USGS event page

## Stack

- **SvelteKit** with Svelte 5 runes
- **Archetype AI Design System** — semantic tokens, component primitives, composite patterns
- **Newton API** — Direct Query endpoint (`/v0.5/query`) for text reasoning with the C 2.6 fusion model (`Newton::c2_6_8b_fp8_260424d7a55d5e`), per the [`atai-newton-fusion-model`](https://github.com/archetypeai/agent-skills/tree/main/skills/atai-newton-fusion-model) skill
- **USGS GeoJSON Feeds** — real-time earthquake catalog, updated every minute
- **Tailwind v4** — styling with semantic design tokens

## Setup

```bash
npm install
```

Create a `.env` file:

```
ATAI_API_KEY=your_api_key_here
ATAI_API_ENDPOINT=https://api.u1.archetypeai.app/
```

## Development

```bash
npm run dev
```

Open `http://localhost:5173`. Earthquake data loads automatically. Use the chat to ask Newton questions.

## How It Works

1. Server polls USGS GeoJSON feeds (updated every minute by USGS)
2. Earthquake data displays in a scrollable list and magnitude scatter chart
3. When you ask a question in chat, the server fetches fresh earthquake data, formats it as structured text, and sends it to Newton's `/v0.5/query` endpoint
4. Newton analyzes the seismic data and responds with pattern analysis, risk assessment, or answers to specific questions

## Architecture

```
src/
├── routes/
│   ├── +page.svelte                  # Dashboard orchestrator
│   └── api/
│       ├── earthquakes/+server.js    # USGS feed proxy
│       └── analyze/+server.js        # Newton direct query
├── lib/
│   ├── server/
│   │   ├── usgs.js                   # USGS API client + data formatting
│   │   └── newton.js                 # Newton direct query client
│   ├── api/earthquakes.js            # Client-side fetch wrappers
│   └── components/ui/custom/
│       ├── earthquake-list.svelte    # Scrolling event list
│       ├── magnitude-chart.svelte    # SVG scatter chart
│       ├── chat-panel.svelte         # Newton Q&A
│       ├── feed-selector.svelte      # Time range / magnitude filter
│       └── stats-bar.svelte          # Live stats in menubar
```

## Example Questions for Newton

- "Are there any aftershock sequences in the current data?"
- "What regions have the most seismic activity right now?"
- "Is the current level of M4+ earthquakes normal for a 24-hour period?"
- "Summarize the strongest earthquakes and their potential impact"
- "Are any of these earthquakes near major population centers?"
