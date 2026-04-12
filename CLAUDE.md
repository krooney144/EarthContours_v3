# EarthContours v3 — Claude Context Document

Quick architectural reference for any Claude Code session in this repo.
Version history (v1 → v3.0) lives in `CHANGELOG.md`.

---

## What This Project Is

A **terrain visualization web app** (React + TypeScript + Vite, mobile-first) that renders real elevation data across five screens: a Home landing page plus SCAN (first-person panorama), EXPLORE (3D orbit), MAP (globe + flat DEM), and SETTINGS. All screens share a single viewpoint (`locationStore`).

Elevation comes from the public AWS Terrarium RGB-encoded DEM tile set (no API key). Natural Earth 1:10m GeoJSON ships in `public/geo/`. Peaks load worldwide from the OSM Overpass API, cached 24 h in IndexedDB.

---

## Branch

Current release-prep branch: `claude/prepare-v3-release-dQuXk`

---

## Commands

```bash
npm run dev          # Dev server → http://localhost:5173
npm run build        # Production build (tsc + vite) → /dist
npm run type-check   # tsc --noEmit (strict mode)
npm run preview      # Preview production build
npm run geo          # Re-run scripts/processGeoData.mjs
```

There is no `npm run lint`. ESLint was dropped for v3 — TypeScript strict mode is the only static check.

---

## Stack

- **React 18.3.1** + **TypeScript 5.4.2** (strict mode)
- **Vite 5.2.0** (ES2020, source maps on)
- **Zustand 4.5.2** (six stores, `settingsStore` persisted to localStorage)
- **Three.js 0.160.1** — active in the MAP globe and the EXPLORE contour renderer
- **Canvas 2D** for SCAN silhouette rendering and the flat DEM map
- **CSS Modules** + CSS Custom Properties (ocean-depth palette)

---

## Screens & Routing

Screen IDs (`ScreenId` type in `src/core/types.ts`):
`'home' | 'scan' | 'explore' | 'map' | 'settings'`

Routing is **state-based** via `uiStore.activeScreen` — no React Router, no URL changes. Transitions use a short zoom animation (`uiStore.transitionState`). The bottom `Nav` is hidden on `home` because Home has its own cards.

---

## State Management

Six Zustand stores in `src/store/` (re-exported from `src/store/index.ts`):

| Store | Role |
|-------|------|
| `uiStore` | Active screen, transitions, splash, preview mode |
| `settingsStore` | User prefs — persisted to localStorage; migrations up to v7 |
| `cameraStore` | AR camera (heading/pitch/height) + orbit camera (theta/phi/radius/panX/panZ) |
| `locationStore` | GPS + explore location + sensor data — source of truth for the active viewpoint |
| `mapViewStore` | Map center (lat/lng) + zoom with clamp/wrap helpers |
| `terrainStore` | Elevation mesh, peaks, rivers, water bodies, loading state |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root shell — splash, routing, layouts, error boundaries |
| `src/core/types.ts` | All TypeScript interfaces (`SkylineData`, `SkylineBand`, `SkylineRequest`, `RefinedArc`, `PeakRefineItem`, `Region`, etc.) |
| `src/core/constants.ts` | Magic numbers (timings, breakpoints, defaults, palette, ENU helpers) |
| `src/core/logger.ts` | `createLogger(namespace)` — color/timestamped logs; the convention everywhere |
| `src/core/errors.ts` | Custom error classes (recoverable vs fatal) |
| `src/data/elevationLoader.ts` | 4-tier elevation fallback (memory → IndexedDB → local → AWS Terrarium) |
| `src/data/ScanTileCache.ts` | Multi-zoom tile cache (z8–z15) for SCAN's 400 km range |
| `src/data/peakLoader.ts` | OSM Overpass peak loader, 24 h IndexedDB cache |
| `src/data/geoLoader.ts` | Generic GeoJSON fetcher with IndexedDB cache |
| `src/data/geoManager.ts` | Natural Earth layer loaders (coastlines, rivers, lakes, glaciers, ocean, ice shelves) |
| `src/data/simulatedData.ts` | Hardcoded Colorado / Alaska / Cascades peak fallback |
| `src/data/regions.ts` | Hand-tuned region metadata + bounds |
| `src/data/feedbackService.ts` | Client-side POST to `/api/feedback` |
| `src/workers/skylineWorker.ts` | Web Worker — 360° skyline precompute + two-pass peak refinement |
| `src/renderer/TerrainRenderer.ts` | Three.js contour-mesh renderer used by EXPLORE |
| `src/renderer/marchingSquares.ts` | Contour line extraction from a height grid |
| `api/feedback.ts` | Vercel serverless — POST `/api/feedback` → GitHub Issue |

---

## Rendering Per Screen

### SCAN (v2.4 silhouette architecture)

- **Single camera function** — `project(bearingDeg, elevAngleRad, cam) → {x, y}` in `ScanScreen.tsx`. Every ridgeline, peak dot, and label goes through it, so alignment bugs are structurally impossible.
- **6-band depth skyline** — worker emits `SkylineData` with 6 bands (ultra-near 0–4.5 km, near 4–10.5 km, mid-near 10–31 km, mid 30–81 km, mid-far 80–152 km, far 150–400 km). Each band stores per-azimuth raw elevation + distance + **GPS lat/lng** of the ridge point. Scaled overlaps at band boundaries (0.5 km near, up to 2 km far) prevent seams. Array-driven — adding a band = pushing to `DEPTH_BANDS`.
- **Progressive contour intervals** — 50 ft (ultra-near) → 100 ft → 200 ft → 500 ft → 1000 ft → 2000 ft (far).
- **Tile zoom levels** — z15 (0–1 km), z14 (1–4.5 km), z13 (4.5–10.5 km), z11 (10.5–31 km), z10 (31–81 km), z9 (81–152 km), z8 (152–400 km).
- **Silhouette strokes (v2.4)** — worker produces per-azimuth silhouette candidates (local elevation maxima along each radial ray, sorted near→far). `buildSilhouetteLayers` does a front-to-back visibility sweep. `matchSilhouetteStrands` connects layers across azimuths by **distance proximity** (primary key — a silhouette line = terrain at a specific distance from viewer). Tolerances: 12% / 15% / 18% near / mid / far match the natural ±10–15% cosine ridge variation. `renderSilhouetteStrokes` draws smooth `quadraticCurveTo` curves with an angle-continuity break (`MAX_ANGLE_JUMP = 0.005` rad) that segments cross-ridge mismatches without fragmenting strands. `MIN_PEAK_ANGLE = -0.35` rad filters sub-horizon clutter.
- **Silhouette glow** — `renderSilhouetteGlow()` draws a multi-pass prominence-driven halo behind each strand before the crisp strokes. Glow intensity = prominence × angle × distance; near passes are tight/bright (sky-side), far passes wider/softer.
- **Curvature tapering** — `lineWidth = minWidth + (maxWidth − minWidth) × (0.2 + 0.8 × tCurvature)` where `tCurvature = min(1, |angle[i+1] − 2×angle[i] + angle[i−1]| / 0.008)`. Sharp peaks read as thick strokes (2–5 px near), flat terrain as thin (0.4–1.5 px far).
- **Unified terrain fill** — single flat base colour per theme (dark `rgb(4,10,18)`, light `rgb(175,185,170)`). Replaces the old per-band, per-pixel fill computation — major mobile perf win.
- **AGL re-projection** — `reprojectBands()` re-derives elevation angles from raw band data when viewer height changes. ~15,840 `atan2` calls, sub-millisecond. No worker round-trip for the AGL slider.
- **Two-pass peak refinement** — after the skyline completes, main thread identifies visible peaks and sends `{ type: 'refine-peaks', peaks: PeakRefineItem[] }` to the worker. Worker fetches higher-zoom tiles (`distToRefinedZoom()`: 1–2 levels above standard), dense-ray-marches at 0.05° azimuth steps and 1.005× distance steps through each peak's band range, and responds with `refinedArcs`. `renderPeakRidgelines()` matches peaks to arcs by bearing + band; unmatched peaks fall back to band data. Types live in `src/core/types.ts`.
- **Stale-while-revalidate** — old skyline keeps rendering while the worker recomputes; pan moves under 1.5 km skip recompute.
- **Canvas RAF gating** — `resizeCanvas()` only runs on `ResizeObserver`; `redrawCanvas()` is gated through `requestAnimationFrame`.
- **Physical-pixel coordinate system** — `ctx.setTransform(1,0,0,1,0,0)` (identity); all canvas drawing in physical pixels. Peak positions divided by `dpr` only when reading into HTML overlay CSS coords.
- **Peak visibility + snap** — `isPeakVisible()` checks peak angle vs ridgeline. Dots snap upward-only to the max per-band ridgeline angle at the peak's bearing. Max 8 dots, horizontal dedup at 10% canvas width.
- **Settings** — four independent SCAN toggles (contour lines, terrain fill, band lines, silhouette lines).
- **Debug panel** — camera state, re-projection validation, per-band health (active azimuths, elev/dist ranges, contour interval), refined arc stats, peak funnel.
- **Gestures** — pinch zoom via `applyFovScale(scale)` (15°–100°); natural drag direction.
- **Data** — `fetchPeaksNear(lat, lng, 130)` on location change; hardcoded fallback in `simulatedData.ts`.

### EXPLORE

- Marching-squares contours extracted from the height grid (`src/renderer/marchingSquares.ts`) and rendered via `TerrainRenderer` (Three.js).
- **ENU metre-space** — all world coords in metres; `verticalExaggeration` is the only multiplier of Y.
- `computeENULayout()` is shared by both peak labels and contour lines, so they can never drift.
- Navigation: drag / one-finger = pan, right-drag = rotate + tilt, scroll / pinch = zoom, double-click = fly-to.
- `cameraStore.orbitRadius` is the camera distance from the pivot in **metres**; `initOrbitCamera(terrainWidth_m)` auto-sets it to `terrainWidth_m × 0.8` when a new mesh loads. `orbitPanX/Z` are pan as a fraction of terrain width/depth in `[-0.5, 0.5]`.
- Pulsing gold location pin renders when `locationStore.mode === 'exploring'`.

### MAP

- **Dual canvas** — Three.js globe (zoom 1–6) on top, Canvas-2D flat DEM map (zoom 7+) behind, CSS opacity crossfade in zoom range ~4–8.
- **Globe** — `SphereGeometry(1, 96, 96)` with Mercator-corrected UVs. Unlit `MeshBasicMaterial` (Lambert would double-dim the already-dark DEM palette). Brightness-lifted DEM texture (1.5×R + 1.4×G + 1.3×B + floor). Two-phase texture loading: z2 (16 tiles) instant, z3 (64 tiles) background upgrade. Fresnel atmosphere shader on a BackSide sphere at r=1.04 in `ec-mid` / `ec-glow` palette colours. 300-point star field.
- **Single source of truth** — `centerLat` / `centerLng` drives both globe rotation and flat-map position via `mapViewStore`.
- **Flat map** — DEM tiles + Natural Earth overlays (`geoManager.ts`: coast, rivers, lakes, glaciers, ocean, antarctic ice shelves) + Carto `dark_only_labels` overlay at zoom 7+ + peak dots + labels + GPS dot + area-select rectangle.
- `drawMap()` is **skipped entirely** when globe opacity = 1 — big perf win at low zooms.
- Smooth zoom slider (`<input type="range">` with `step="0.1"`).
- Tap anywhere → `setExploreLocation(lat, lng)` → syncs EXPLORE and SCAN.

### HOME

- Landing page with three cards (Map / Explore / Scan) + a settings gear.
- Default route on first launch; the bottom `Nav` is hidden here.

### SETTINGS

- Units, coord format, label toggles (peaks / rivers / lakes / glaciers / coastlines / towns), SCAN render toggles (contour / fill / band / silhouette), visual exaggeration, theme, reduce-motion, debug panel, contour animation, battery mode, target FPS, download-on-WiFi, data resolution, default region, feedback form.
- Settings persisted through Zustand `persist` middleware; migrations up to v7 (the latest replaced `solidTerrain` with `showSilhouetteLines`).

---

## EXPLORE Coordinate System (ENU)

All EXPLORE world coordinates are in a local **ENU (East-North-Up)** frame centred on the loaded region's geographic centre (`lat0, lon0`):

```
lat0 = (bounds.north + bounds.south) / 2
lon0 = (bounds.east  + bounds.west ) / 2

MPD_LAT = 111 132 m/°            (nearly constant)
MPD_LON = 111 320 × cos(lat0°)   (shrinks toward poles)

x_m = (col / (w − 1) − 0.5) × terrainWidth_m − pivotX_m   ← east/west
z_m = (row / (h − 1) − 0.5) × terrainDepth_m − pivotZ_m   ← south (z+ = south)
y_m = (elevation_m − minElevation_m) × verticalExaggeration  ← up

scale  = pixels/metre = min(W, H) × 0.62 / orbitRadius
pivot  = (panX × terrainWidth_m,  panZ × terrainDepth_m)
```

**Rule:** nothing else ever multiplies or divides elevation. At exaggeration 1×, 1 m of terrain = 1 m of world Y.

---

## Predefined Terrain Regions (`src/data/regions.ts`)

Regions are hand-tuned geographic chunks sized for visual quality, **not political borders**.

| Region | ID | Approx size | Notes |
|--------|----|-------------|-------|
| Colorado Rockies | `colorado-rockies` | ~220×250 km | 53 14ers; default region |
| Alaska Range | `alaska-range` | ~255×220 km | Denali 6190 m |
| Washington Cascades | `wa-cascades` | ~230×220 km | Rainier 4392 m |

**Adding regions:** Add an entry in `src/data/regions.ts`. Target ≤300 km per side (flat-earth error < 0.2%). Regions may overlap — tiles are cached by z/x/y so shared tiles auto-reuse. Update `DEFAULT_REGION_ID` in `constants.ts` if needed.

---

## Elevation Data — Fallback Chain

Active source: **AWS Terrarium tiles** (Tier 4). After first fetch, tiles are cached to IndexedDB (Tier 2).

| Tier | Source | Notes |
|------|--------|-------|
| 1 | In-memory cache | Fastest; current page load only |
| 2 | IndexedDB | Persistent browser cache; auto-populated from Tier 4 |
| 3 | `/tiles/elevation/{z}/{x}/{y}.png` | Pre-bundled offline tiles; empty by default |
| 4 | AWS Terrarium (live) | `s3.amazonaws.com/elevation-tiles-prod/terrarium/` — no API key |

**Tile format:** Terrarium RGB-encoded PNG — `elevation_m = R×256 + G + B/256 − 32768`.

**Colorado test point:** Mount Elbert at ~39.1°N, 106.4°W → expected ~4400 m (14,440 ft).

**Console debugging:** filter for `ELEVATION LOAD` or `TERRAIN SOURCE` to see the active tier.

---

## Feedback Flow

1. User types feedback in `SettingsScreen`.
2. `feedbackService.submitFeedback(text)` POSTs `{ text, deviceInfo }` to `/api/feedback`.
3. `api/feedback.ts` (Vercel serverless) validates the body and creates a labelled GitHub Issue on `krooney144/earthcontours_v3` using the server-side `GITHUB_TOKEN` env var.
4. Response includes `issueUrl` on success.

The `GITHUB_TOKEN` is set in the Vercel dashboard and must never be bundled client-side (no `VITE_` prefix).

---

## Layout

- **Mobile**: single screen + bottom nav bar (hidden on Home).
- **Desktop (>900 px)**: "Preview mode" — all three terrain screens side-by-side command-centre view. Preview locks off once the user clicks into a screen.

---

## Error Handling

- Per-screen `ErrorBoundary` components — crashes isolated to a single screen.
- Custom error classes in `src/core/errors.ts`:
  - GPS failure → non-fatal (falls back to simulated position)
  - Terrain load failure → recoverable (shows retry button)
  - Tile fetch failure → falls back to the next tier in the elevation chain

---

## CSS System

- `src/styles/palette.css` — CSS custom properties: ocean-depth colour palette, spacing scale, z-index layers, shadows.
- `src/styles/global.css` — CSS reset, root element, typography defaults.
- Each component has its own `.module.css` (CSS Modules).
- Fluid typography with `clamp()` for responsive scaling.

---

## Coding Conventions

- Strict TypeScript — no implicit any, strict null checks. `tsc --noEmit` must pass.
- **Logger everywhere**: `const log = createLogger('ComponentName')` then `log.info(...)`, `log.warn(...)`, `log.error(...)`. No raw `console.*` calls in source.
- Sections separated with `// ─── Section Name ───` comments.
- Path alias `@/` maps to `src/` (configured in `tsconfig.json`).
- Stores exported as hooks: `useUIStore`, `useLocationStore`, etc.
- Version history belongs in `CHANGELOG.md`, not in this doc.
