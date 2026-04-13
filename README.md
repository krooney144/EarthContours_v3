# EarthContours v3

**Terrain visualization web app** — explore elevation data through a 3D globe, first-person skyline, 3D orbit, and topographic map views.

![Version](https://img.shields.io/badge/version-3.0-blue) ![Status](https://img.shields.io/badge/status-active-green)

---

## What It Does

EarthContours renders real elevation data across five screens, all driven from the same `locationStore` so selecting a viewpoint in one view follows through to the others.

| Screen | Description |
|--------|-------------|
| **HOME** | Landing page — three cards routing to Map, Explore, and Scan, plus a settings gear. |
| **SCAN** | AR-style first-person panorama. Smooth silhouette strokes with curvature-based tapering, unified terrain fill, and 6-band depth-layered ridgelines (ultra-near → far). 400 km range, 50 ft→2000 ft progressive contours, two-pass peak refinement, pinch-zoom FOV (15°–100°). |
| **EXPLORE** | 3D orbit terrain view in ENU metre-space. Free-roam pan/rotate/tilt/zoom, marching-squares contour lines, real peak labels projected from lat/lng, location pin synced from Map. |
| **MAP** | Dual-canvas map: Three.js globe at zoom 1–6 (brightness-lifted DEM texture, Fresnel atmosphere, star field, Mercator-corrected UVs) crossfading to a flat Canvas-2D DEM map at zoom 7+ with Natural Earth overlays. Smooth 0.1-step zoom slider; tap-to-explore sets the viewpoint everywhere. |
| **SETTINGS** | Units, labels, 4 SCAN render toggles (contour, fill, band, silhouette), visual exaggeration, theme, reduce-motion, debug panel, feedback submission. |

**Elevation data** comes from the public AWS Terrarium RGB-encoded DEM tile set (`s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`). Terrain RGB is decoded as `elevation_m = R×256 + G + B/256 − 32768`. No API key required.

**Natural Earth** 1:10m GeoJSON (coastlines, rivers, lakes, glaciers, ocean, antarctic ice shelves) ships from `public/geo/` and powers the Map overlays.

**Peaks** load worldwide from OpenStreetMap Overpass (`node["natural"="peak"]`) and are cached for 24 h in IndexedDB. A verified worldwide peak database in `peakDatabase.ts` (~200 peaks, USGS/NGS sourced) is the primary/instant source for predefined regions and the offline fallback for custom bounds.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18.3 + TypeScript 5.4 (strict mode) |
| Build | Vite 5.2 (ES2020, source maps) |
| State | Zustand 4.5 (six stores, `settingsStore` persisted to localStorage) |
| 3D | Three.js 0.160 — active in Map globe and Explore contour renderer |
| Rendering | Canvas 2D for terrain/skyline; Three.js for globe + orbit |
| Styling | CSS Modules + CSS Custom Properties (ocean-depth palette) |
| Fonts | Josefin Sans (display) + Jost (body) via Google Fonts |
| Feedback | Vercel serverless `api/feedback.ts` → GitHub Issues |

---

## Getting Started

```bash
npm install          # Install dependencies
npm run dev          # Dev server → http://localhost:5173
npm run type-check   # TypeScript strict check
npm run build        # Production build → /dist
npm run preview      # Preview the production build
npm run geo          # Re-process public/geo/*.json source data
```

**Requirements:** Node.js 18+ (ES2020 support). Mobile-first — tested primarily on phones in portrait.

---

## Project Structure

```
EarthContours_v3/
├── api/
│   └── feedback.ts                 # Vercel serverless — POST /api/feedback → GitHub Issue
├── public/
│   ├── Favicon3.svg                # App icon
│   └── geo/                        # Natural Earth 1:10m GeoJSON (~30 MB)
│       ├── antarctic_ice_shelves.json
│       ├── coastline.json
│       ├── glaciers.json
│       ├── lakes.json
│       ├── ocean.json
│       └── rivers.json
├── scripts/
│   └── processGeoData.mjs          # Pre-processes raw Natural Earth into public/geo/
├── src/
│   ├── App.tsx                     # Root shell, Zustand-routed screens, error boundaries
│   ├── main.tsx                    # React root init
│   ├── screens/
│   │   ├── HomeScreen/             # Landing page (cards + settings gear)
│   │   ├── ScanScreen/             # First-person silhouette panorama (v2.4 architecture)
│   │   ├── ExploreScreen/          # 3D orbit + contour lines
│   │   ├── MapScreen/              # Globe + flat DEM map
│   │   └── SettingsScreen/         # Preferences + feedback form
│   ├── components/
│   │   ├── Nav/                    # Bottom tab bar (hidden on Home)
│   │   ├── SplashScreen/           # Animated intro
│   │   ├── PreviewLayout/          # Desktop multi-screen command center
│   │   ├── LoadingScreen/          # Terrain load progress indicator
│   │   ├── ErrorBoundary/          # Per-screen crash isolation
│   │   ├── TutorialOverlay/        # First-run walkthrough
│   │   └── NavigateHint/           # Contextual nav hint chip
│   ├── store/
│   │   ├── index.ts                # Barrel re-exports
│   │   ├── uiStore.ts              # Active screen, splash, transitions, preview mode
│   │   ├── settingsStore.ts        # User prefs (persisted to localStorage, migrated v3→v7)
│   │   ├── cameraStore.ts          # AR camera (heading/pitch/height) + orbit camera
│   │   ├── locationStore.ts        # GPS + explore location (source of truth for viewpoint)
│   │   ├── mapViewStore.ts         # Map center/zoom with clamp+wrap helpers
│   │   └── terrainStore.ts         # Elevation mesh, peaks, rivers, water, loading state
│   ├── core/
│   │   ├── types.ts                # All TypeScript interfaces (SkylineData, RefinedArc, etc.)
│   │   ├── utils.ts                # Pure helpers (tile math, geodesy, formatting)
│   │   ├── constants.ts            # Timings, defaults, breakpoints, palette
│   │   ├── logger.ts               # createLogger(namespace) — color/timestamped logs
│   │   └── errors.ts               # Recoverable vs fatal error classes
│   ├── data/
│   │   ├── regions.ts              # Hand-tuned region metadata (Colorado / Alaska / Cascades)
│   │   ├── peakDatabase.ts         # Verified worldwide peak database (~200 peaks)
│   │   ├── elevationLoader.ts      # 4-tier elevation loader (memory → IDB → local → AWS)
│   │   ├── ScanTileCache.ts        # Multi-zoom tile cache (z8–z15) for SCAN 400 km range
│   │   ├── peakLoader.ts           # OSM Overpass peak loader, 24 h IndexedDB cache
│   │   ├── geoLoader.ts            # GeoJSON fetcher with IndexedDB cache
│   │   ├── geoManager.ts           # Natural Earth layer loaders (coast/rivers/lakes/glaciers)
│   │   └── feedbackService.ts      # Client-side submit → /api/feedback
│   ├── renderer/
│   │   ├── TerrainRenderer.ts      # Three.js contour-mesh renderer used by EXPLORE
│   │   └── marchingSquares.ts      # Contour line extraction from height grid
│   ├── workers/
│   │   └── skylineWorker.ts        # Web Worker — 360° skyline precompute + peak refinement
│   └── styles/
│       ├── global.css              # CSS reset + app-wide styles
│       └── palette.css             # Ocean-depth CSS variable palette
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vercel.json
├── package.json
├── CHANGELOG.md
├── CLAUDE.md
└── README.md
```

---

## Key Architecture Decisions

**State-based routing.** `uiStore.activeScreen` controls which screen mounts. No React Router, no URL changes — custom zoom transitions and persistent 3D state feel native.

**Elevation data fallback chain** (`src/data/elevationLoader.ts`):

1. **Tier 1 — Memory cache** (current page load)
2. **Tier 2 — IndexedDB** (persisted across reloads; auto-populated from Tier 4)
3. **Tier 3 — `/tiles/elevation/{z}/{x}/{y}.png`** (pre-bundled offline tiles; empty by default)
4. **Tier 4 — AWS Terrarium** (live, `s3.amazonaws.com/elevation-tiles-prod/terrarium/`)

Filter the browser console for `ELEVATION LOAD` or `TERRAIN SOURCE` to see which tier served a given tile.

**Rendering per screen:**

- **SCAN (v2.4 silhouette architecture)**
  - Single `project(bearingDeg, elevAngleRad, cam) → {x, y}` camera function — every ridgeline, peak dot, and label call goes through it, so alignment bugs are structurally impossible.
  - 6-band depth skyline (ultra-near 0–4.5 km → far 150–400 km) with per-azimuth elevation, distance, and GPS lat/lng stored in each band.
  - Silhouette strokes: worker emits per-azimuth silhouette candidates; main thread builds strands via distance-primary matching (12/15/18% tolerance near/mid/far) and renders smooth `quadraticCurveTo` curves with curvature-based width tapering and a multi-pass prominence glow.
  - Unified flat terrain fill per theme — one cheap draw instead of per-band fills (major mobile win).
  - Two-pass peak refinement: main thread dispatches visible peaks back to the worker, which fetches 1–2 zoom levels higher and dense-ray-marches for crisp peak ridgelines.
  - Main-thread AGL reprojection (`reprojectBands()`) — no worker round-trip for height changes.
  - Stale-while-revalidate: old skyline keeps rendering while the worker recomputes; pan moves under 1.5 km skip recompute.
  - Settings exposes 4 independent SCAN toggles (contour lines, terrain fill, band lines, silhouette lines) and a comprehensive debug panel.

- **EXPLORE**
  - Marching-squares contour extraction at elevation thresholds, drawn in Three.js via `TerrainRenderer.ts`.
  - ENU metre-space: 1 m of terrain = 1 m of world Y at exaggeration 1×. `verticalExaggeration` is the only multiplier that touches Y.
  - Free-roam navigation: drag = pan, right-drag = rotate/tilt, scroll/pinch = zoom, double-click = fly-to.
  - Peak labels use the same `computeENULayout()` as the contour mesh, so they can't drift.
  - Pulsing location pin renders when `locationStore.mode === 'exploring'`.

- **MAP**
  - Two canvases stacked: Three.js globe (zoom 1–6) on top, Canvas-2D flat DEM map (zoom 7+) behind, CSS-crossfaded in zoom range 4–8.
  - Globe uses `SphereGeometry(1, 96, 96)` with Mercator-corrected UVs, an unlit `MeshBasicMaterial` (avoids double-dimming the dark DEM palette), a brightness-lifted DEM texture (1.5×R + 1.4×G + 1.3×B + floor), a Fresnel BackSide atmosphere at r=1.04, and a 300-point star field.
  - Flat map draws DEM tiles + Natural Earth (coast/rivers/lakes/glaciers/ocean/ice shelves) + Carto dark-only-labels overlay + peak dots + labels + GPS dot + area-select rectangle.
  - `drawMap()` is skipped entirely when globe opacity = 1 — big perf win at low zooms.
  - Smooth zoom slider with 0.1 step granularity.
  - Tapping anywhere sets `locationStore.exploreLocation`, which syncs EXPLORE and SCAN.

**Layout:**
- Mobile: single screen + bottom nav (hidden on Home).
- Desktop (>900 px): "Preview mode" showing all three terrain screens side-by-side, closed once the user clicks into a screen.

---

## Feedback

Users can submit feedback from Settings. The client posts to `/api/feedback` (Vercel serverless), which creates a labelled GitHub Issue via a server-side token. See `api/feedback.ts` for the token env var (`GITHUB_TOKEN`) and `src/data/feedbackService.ts` for the client flow.

---

## Documentation Map

- **`README.md`** (you are here) — how to run the project and what's in the tree.
- **`CLAUDE.md`** — quick architectural reference for any Claude Code session in this repo.
- **`CHANGELOG.md`** — version history from v1 MVP through v3.0.

---

## Settings Persisted to localStorage

- **Units**: Imperial / Metric
- **Labels**: peaks, rivers, lakes, glaciers, coastlines, town labels
- **SCAN toggles**: contour lines, terrain fill, band lines, silhouette lines
- **Visual**: dark/light theme, color theme, label size, vertical exaggeration, reduce motion, contour animation
- **Location**: GPS accuracy, auto-detect region
- **Performance**: target FPS, battery mode
- **Data**: resolution, WiFi-only downloads, default region
- **Debug**: debug panel toggle
