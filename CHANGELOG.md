# Changelog

All notable changes to EarthContours. Newest on top.

The project follows [Semantic Versioning](https://semver.org/) in spirit —
major bumps mark architectural overhauls, not API breakage (the app is private).

---

## [3.0.0] — Release-Prep Cleanup

The v3.0 release is primarily a clean-up and documentation pass on top of the
v2.3-globe + v2.4-silhouettes work shipped during v2. No feature changes.

### Repository hygiene
- Added `.gitignore` (was missing entirely) covering `node_modules/`, `dist/`,
  `.DS_Store`, `.env*`, editor caches, `.vercel/`, Vite cache, and logs.
- Untracked six `.DS_Store` files that had been committed to the repo root and
  several subdirectories.
- Removed the leftover `CLAUDE/` directory.

### Dead-code removal
- Deleted `src/data/simulatedTerrain.ts` — the procedural terrain generator had
  been disabled (`terrainStore.ts` explicitly notes `generateSimulatedTerrain removed`)
  and no runtime code imported it. Docs still listed it as a "Tier 5 fallback"
  that did not exist.
- Deleted `src/data/TerrainProvider.ts` — `TerrariumTerrainProvider` /
  `terrainProvider` singleton / `updateTerrainProviderGrid()`. Never imported.
  The only remaining reference was a comment in `MapScreen.tsx`.
- Deleted `public/favicon.svg` — only `Favicon3.svg` is referenced by
  `index.html`, `SplashScreen`, and `PreviewLayout`.
- Removed legacy alias exports (`MAP_TILE_URL`, `TOPO_TILE_URL`,
  `TOPO_TILE_SUBDOMAINS`) from `src/core/constants.ts`. They were marked "kept
  so nothing else breaks" but had zero consumers.
- Removed three orphaned `[GLOW-DIAG]` / `[CONTOUR-DEBUG]` `console.log` blocks
  plus the `_glowDiagCount` counter from `src/screens/ScanScreen/ScanScreen.tsx`.
  Everything else in the project already routes through `createLogger(...)`.

### Stale planning docs
- Deleted `plan.md` — atmosphere / zoom-slider plan implemented in v2.3-globe.
- Deleted `REGIONAL_DATA_PLAN.md` — aspirational 40-region Kirmse-peak pipeline;
  not started, preserved in git history.
- Deleted `CLAUDE/phase-2-scan-overhaul.md` — Phase 2 engineering notes, marked
  complete since v1.3.

### Dependencies
- `package.json` version bumped from `1.0.0` → `3.0.0`.
- Removed `react-router-dom ^7.13.1` — declared but never imported. Routing is
  state-based through Zustand.
- Removed `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`,
  `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and the `lint`
  script. ESLint had been broken for some time (no config file; `npm run lint`
  errored immediately) and nothing in the project relied on it. TypeScript
  strict mode via `npm run type-check` is the remaining static check.
- `package-lock.json` regenerated to match the slimmed-down dependency list.

### API / user-visible
- `api/feedback.ts` now posts GitHub Issues to `krooney144/earthcontours_v3`
  (was hardcoded to `EarthContours_v1`, which would have broken feedback
  submissions after the v3 rename).
- Feedback issue body footer bumped from "EarthContours v1" → "EarthContours v3".
- `HomeScreen` footer bumped from `Earth Contours v2.3` → `Earth Contours v3.0`.

### Documentation
- `README.md` rewritten from scratch. Badge v3.0, accurate 5-screen roster
  (Home + Scan + Explore + Map + Settings), accurate 6-store list (including
  `mapViewStore`), current project tree including `api/`, `public/geo/`,
  `scripts/`, and every real file under `src/`. Three.js is described as
  *active* in the globe and Explore renderers (no more "scaffolded"). SCAN and
  MAP descriptions reflect the v2.4-silhouette and v2.3-globe architectures.
- `CLAUDE.md` rewritten. Title updated to v3. Current branch name. All six
  stores listed. Removed stale reference to a `waterLoader.ts` that never
  existed (water/lakes actually live in `geoManager.ts`). Removed the Tier 5
  procedural fallback from the elevation chain. Roadmap / version-history
  bullets moved out into this `CHANGELOG.md`. Notes that ESLint is gone.
- Added this `CHANGELOG.md` with history from v1 → v3.0.

### Tooling
- `tsc --noEmit` passes with zero errors (verified before and after all edits).

---

## [2.4.0] — "silhouettes" — SCAN silhouette overhaul

- Silhouette strokes are now the headline SCAN feature — smooth
  `quadraticCurveTo` curves with curvature-based thickness tapering
  (sharp peaks thick, flat terrain thin).
- Worker produces per-azimuth silhouette candidates (local elevation maxima
  along each radial ray, sorted near→far).
- `buildSilhouetteLayers` runs a front-to-back visibility sweep;
  `matchSilhouetteStrands` connects layers across azimuths by distance
  proximity (primary key — a silhouette line = terrain at a specific distance
  from viewer). Tolerances 12% / 15% / 18% near / mid / far match the natural
  ±10–15% cosine ridge variation.
- `renderSilhouetteStrokes` includes an angle-continuity break
  (`MAX_ANGLE_JUMP = 0.005` rad) that segments cross-ridge mismatches without
  fragmenting whole strands. `MIN_PEAK_ANGLE = -0.35` rad filters sub-horizon
  clutter.
- `renderSilhouetteGlow()` adds a prominence-driven multi-pass glow behind
  each strand; intensity = prominence × angle × distance.
- Curvature tapering:
  `lineWidth = minWidth + (maxWidth − minWidth) × (0.2 + 0.8 × tCurvature)`
  where `tCurvature = min(1, |angle[i+1] − 2×angle[i] + angle[i−1]| / 0.008)`.
  Near features 2–5 px, far 0.4–1.5 px.
- Unified terrain fill: single flat base colour per theme replaces per-band /
  per-pixel silhouette fill computation. Major mobile perf win.
- Band ridgelines now also use sub-sampled `quadraticCurveTo` with curvature
  tapering.
- Settings: four independent SCAN toggles — contour lines, terrain fill,
  band lines, silhouette lines. Migrated `solidTerrain` →
  `showSilhouetteLines` (settings migration v6→v7).

## [2.3.0] — "globe" — MAP globe mode

- Three.js Earth sphere at zoom 1–6 with a smooth crossfade to the flat
  Canvas-2D DEM map at zoom 7+.
- Mercator-corrected UV mapping on `SphereGeometry(1, 96, 96)`.
- `MeshBasicMaterial` (unlit) to avoid Lambert-darkening the already-dark DEM
  palette.
- Brightness-lifted globe texture (1.5×R + 1.4×G + 1.3×B + floor).
- Two-phase texture loading — z2 (16 tiles) instant, z3 (64 tiles) background
  upgrade.
- Atmosphere Fresnel shader on a BackSide sphere at r=1.04 using `ec-mid` /
  `ec-glow` palette colours; 300-point star field.
- Single source of truth: `centerLat` / `centerLng` drives both globe
  rotation and flat-map position.
- Smooth zoom slider (`<input type="range">`, step 0.1) replaces integer
  `+` / `−` buttons.
- `drawMap()` skipped entirely when globe opacity = 1 — big perf win.
- Debug panel shows UV mode, material type, atmosphere params, flat-map-skip
  status.

## [2.2.2] — Two-pass peak refinement

- Replaced the v2.2.1 auto-detect Phase 6 with peak-driven refinement.
- Main thread identifies visible peaks and sends
  `{ type: 'refine-peaks', peaks: PeakRefineItem[] }` to the worker.
- Worker fetches higher-zoom tiles (`distToRefinedZoom()`: +1–2 levels above
  standard) around each peak, ray-marches densely at 0.05° steps (5× finer
  than hi-res 0.125°) with 1.005× distance steps through the peak's band
  range.
- Worker responds with `{ type: 'refined-arcs', refinedArcs }`.
  `renderPeakRidgelines()` matches peaks to arcs by bearing + band; unmatched
  peaks fall back to band data. `RefinedArc` + `PeakRefineItem` types added
  to `src/core/types.ts`.
- Stale-while-revalidate: old refined arcs persist until new ones arrive.
- Debug panel shows "REFINED ARCS (2nd pass)" with per-peak stats.

## [2.2.1] — Refined-arc auto-detect (superseded)

- Worker Phase 6 auto-detected ridgeline features — failed because near-field
  angular prominence dominated, so visible far peaks got zero arcs.
- Replaced in v2.2.2 above.

## [2.2.0] — Near-field enhancement

- 6-band depth system: ultra-near / near / mid-near / mid / mid-far / far.
- Progressive contour intervals (50 ft → 2000 ft).
- z15 / z14 tile zoom for ultra-near detail.
- Hybrid ray march: 360-az 20–200 m @ 1.005× step, 2880-az 200 m–31 km @
  1.01× step.
- Scaled overlaps at band boundaries (0.5 km → 2 km).
- Ultra-near band enables valley views and cliff-face rendering within 4.5 km.

## [2.0.1] — GPS-coordinate ridge attachment

- `SkylineBand` now stores `ridgeLats` / `ridgeLngs` per azimuth so every
  ridge point has a real-world GPS position.
- Peak dot snapping rewritten to use per-band angles (matching exactly what's
  drawn) instead of the coarser 720-azimuth overall array.
- Snap is upward-only so peaks above all bands keep their true position.

## [2.0.0] — SCAN architectural overhaul

- **Single `project()` camera function** — all bearing / angle → screen
  conversions go through one function, making alignment bugs structurally
  impossible.
- **Depth-banded skyline** — near / mid / far bands with raw elevation +
  distance per azimuth.
- **Main-thread AGL re-projection** — no worker round-trip for height
  changes.
- **Layered renderer** — painter's order far → near with depth cues (line
  weight 0.5→3 px, opacity 0.15→0.8, progressive fill darkness).
- Comprehensive debug diagnostics panel.

---

## v1 — Foundation

### [1.4.1] — SCAN bugfixes
- Fixed DPR coordinate mismatch (horizon correct at dpr > 1).
- Stale-while-revalidate skyline; skip recompute for moves < 1.5 km.
- Peak labels max 8 + FOV-gated fallback + horizontal deduplication.

### [1.4.0] — SCAN performance overhaul
- Worker-only rendering (removed main-thread ray march + double tile fetch).
- Canvas RAF gating + ResizeObserver-only resize.
- Ridgeline peak visibility filter (max 15).
- Peak dot snap to ridgeline Y; natural drag direction.

### [1.3.0] — SCAN Phase 2
- `ScanTileCache` (z8–z13 multi-zoom).
- `skylineWorker` (720-azimuth precomputation).
- OSM Overpass peaks (worldwide, 24 h cache).
- Pinch-zoom FOV (15°–100°), pitch indicator, 250 km range, O(1) mobile
  shading.

### [1.2.0] — SCAN Phase 1
- Bilinear sampling, logarithmic ray steps (476 steps 100 m → 120 km).
- Earth curvature + refraction correction.
- NW-45° hill shading.
- Expanded peak data (Colorado +6, Alaska +5, Cascades 11).

### [1.1.0] — ENU metre-space
- ENU (East-North-Up) coordinate system: 1 m X = 1 m Z = 1 m Y.
- `orbitRadius` in metres; `initOrbitCamera` auto-computes from terrain
  bounds.
- Three named regions (Colorado Rockies, Alaska Range, Washington Cascades)
  in `src/data/regions.ts`.
- Exaggeration options 1 / 2 / 4 / 10 / 20×.

### [1.0.0] — MVP
- Procedural terrain, Canvas/SVG rendering, mock data.
- Later: real AWS Terrarium DEM tiles; fixed elevation-loader
  stack-overflow bug.
- EXPLORE fixes: correct vertical exaggeration (removed hidden 0.25×), real
  peak label coordinates via `project3D()`, free-roam pan/zoom/tilt/fly-to
  navigation, MAP → EXPLORE location sync with pulsing pin.
