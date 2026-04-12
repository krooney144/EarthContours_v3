/**
 * Generate corrected Terrarium-format elevation tiles for Cook Inlet, Alaska.
 *
 * Problem: AWS Terrarium DEM tiles above 60°N have false-positive elevation
 * spikes in ocean areas (coherent multi-pixel blobs of incorrect positive
 * elevation scattered across what should be flat water). This is caused by
 * the SRTM data gap above ±60° latitude.
 *
 * Solution: Replace the bad tiles with tiles generated from USGS 3DEP data,
 * which uses IfSAR airborne surveys for Alaska and has proper ocean masking.
 * The corrected PNGs drop into public/tiles/elevation/{z}/{x}/{y}.png where
 * the app's Tier 3 fallback picks them up before AWS Terrarium — no runtime
 * logic changes needed for the main-thread loader.
 *
 * Generates tiles at z10–z13 for the Cook Inlet bounding box around Anchorage.
 * Also downloads the original Terrarium tiles and compares land pixels to
 * verify the corrected tiles match real terrain.
 *
 * Source: USGS 3DEP ImageServer (no auth, no API key)
 *   https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer
 *
 * Usage: node scripts/generateCookInletTiles.mjs
 *        node scripts/generateCookInletTiles.mjs --force   (re-download all)
 *
 * Dev dependencies: geotiff, pngjs
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromArrayBuffer } from 'geotiff'
import { PNG } from 'pngjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TILES_DIR = join(__dirname, '..', 'public', 'tiles', 'elevation')

// ─── Cook Inlet Bounding Box ─────────────────────────────────────────────────
// Covers known ocean-spike areas near Anchorage + margin.
// Expanded west to -150.00 to fully cover Area 2 (west edge at -149.9813°).

const BBOX = { north: 61.44, south: 61.20, west: -150.00, east: -149.56 }
const ZOOM_LEVELS = [10, 11, 12, 13]

// ─── Tile Math ───────────────────────────────────────────────────────────────

const TILE_PX = 256
const WORLD_EXTENT = 20037508.342789244

function latLngToTile(lat, lng, zoom) {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom))
  const latR = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * Math.pow(2, zoom),
  )
  return { x, y }
}

function tileToMercator(x, y, z) {
  const tileSize = (WORLD_EXTENT * 2) / Math.pow(2, z)
  return {
    west:  x * tileSize - WORLD_EXTENT,
    south: WORLD_EXTENT - (y + 1) * tileSize,
    east:  (x + 1) * tileSize - WORLD_EXTENT,
    north: WORLD_EXTENT - y * tileSize,
  }
}

/** Compute tile x/y ranges for a zoom level covering the bounding box. */
function tileRange(zoom) {
  const nw = latLngToTile(BBOX.north, BBOX.west, zoom)
  const se = latLngToTile(BBOX.south, BBOX.east, zoom)
  return {
    minX: Math.min(nw.x, se.x),
    maxX: Math.max(nw.x, se.x),
    minY: Math.min(nw.y, se.y),
    maxY: Math.max(nw.y, se.y),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── USGS 3DEP Fetch ─────────────────────────────────────────────────────────

const USGS_BASE = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage'

const MAX_RETRIES = 4
const RETRY_DELAYS = [2000, 4000, 8000, 16000]

async function fetchWithRetry(url, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return resp
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt]
        console.log(`    ↻ ${label} attempt ${attempt + 1} failed (${err.message}), retrying in ${delay / 1000}s...`)
        await sleep(delay)
      } else {
        throw new Error(`${label}: ${err.message} (after ${MAX_RETRIES + 1} attempts)`)
      }
    }
  }
}

async function fetch3DEP(z, x, y) {
  const bounds = tileToMercator(x, y, z)
  const params = new URLSearchParams({
    bbox:          `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    bboxSR:        '3857',
    imageSR:       '3857',
    size:          `${TILE_PX},${TILE_PX}`,
    format:        'tiff',
    pixelType:     'F32',
    interpolation: 'RSP_BilinearInterpolation',
    f:             'image',
  })
  const url = `${USGS_BASE}?${params}`
  const resp = await fetchWithRetry(url, `USGS ${z}/${x}/${y}`)
  const buffer = await resp.arrayBuffer()
  const tiff = await fromArrayBuffer(buffer)
  const image = await tiff.getImage()
  const [raster] = await image.readRasters()
  return new Float32Array(raster)
}

// ─── AWS Terrarium Fetch (for verification) ──────────────────────────────────

const AWS_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'

async function fetchTerrarium(z, x, y) {
  const url = `${AWS_BASE}/${z}/${x}/${y}.png`
  let resp
  try {
    resp = await fetchWithRetry(url, `AWS ${z}/${x}/${y}`)
  } catch { return null }
  if (!resp.ok) return null
  const buffer = Buffer.from(await resp.arrayBuffer())
  const png = PNG.sync.read(buffer)
  const elevations = new Float32Array(TILE_PX * TILE_PX)
  for (let i = 0; i < TILE_PX * TILE_PX; i++) {
    const r = png.data[i * 4]
    const g = png.data[i * 4 + 1]
    const b = png.data[i * 4 + 2]
    elevations[i] = r * 256 + g + b / 256 - 32768
  }
  return elevations
}

// ─── Terrarium PNG Encoding ──────────────────────────────────────────────────

function encodeTerrarium(elevations) {
  const png = new PNG({ width: TILE_PX, height: TILE_PX })
  for (let i = 0; i < TILE_PX * TILE_PX; i++) {
    let elev = elevations[i]

    // NoData or ocean → encode as 0m (sea level)
    const isNoData = elev < -10000 || !Number.isFinite(elev)
    if (isNoData || elev <= 0) elev = 0

    const v = elev + 32768
    png.data[i * 4]     = Math.floor(v / 256)        // R
    png.data[i * 4 + 1] = Math.floor(v) % 256        // G
    png.data[i * 4 + 2] = Math.floor((v - Math.floor(v)) * 256) // B
    png.data[i * 4 + 3] = 255                        // A
  }
  return PNG.sync.write(png)
}

// ─── Tile Verification ───────────────────────────────────────────────────────

function verifyTile(usgsElev, terrariumElev) {
  const LAND_THRESHOLD = 5    // metres — above this counts as land
  const TOLERANCE = 50        // metres — acceptable land delta

  let landBoth = 0, landMatch = 0, maxDelta = 0
  let oceanFixed = 0

  for (let i = 0; i < TILE_PX * TILE_PX; i++) {
    const u = usgsElev[i]
    const t = terrariumElev[i]
    const uLand = u > LAND_THRESHOLD
    const tLand = t > LAND_THRESHOLD

    // Both sources agree it's land — check elevation match
    if (uLand && tLand) {
      landBoth++
      const delta = Math.abs(u - t)
      if (delta <= TOLERANCE) landMatch++
      if (delta > maxDelta) maxDelta = delta
    }

    // Terrarium says land, USGS says ocean → false spike fixed
    if (!uLand && tLand) oceanFixed++
  }

  const matchPct = landBoth > 0 ? (landMatch / landBoth * 100) : 100
  return { matchPct, landBoth, landMatch, oceanFixed, maxDelta }
}

// ─── Rate-Limited Batch Processing ───────────────────────────────────────────

const BATCH_SIZE = 5
const BATCH_DELAY_MS = 500

const force = process.argv.includes('--force')

async function processTile(z, x, y) {
  const key = `${z}/${x}/${y}`
  const outDir = join(TILES_DIR, String(z), String(x))
  const outPath = join(outDir, `${y}.png`)

  if (!force && existsSync(outPath)) {
    return { key, status: 'skipped' }
  }

  // Fetch from USGS 3DEP
  const usgsElev = await fetch3DEP(z, x, y)

  // Encode as Terrarium PNG and save
  mkdirSync(outDir, { recursive: true })
  const pngBuffer = encodeTerrarium(usgsElev)
  writeFileSync(outPath, pngBuffer)
  const sizeKB = (pngBuffer.length / 1024).toFixed(1)

  // Verification: compare with original Terrarium tile
  let verify = null
  const terrariumElev = await fetchTerrarium(z, x, y)
  if (terrariumElev) {
    // Clamp USGS the same way we encode (NoData/negative → 0) for fair comparison
    const clampedUsgs = new Float32Array(usgsElev.length)
    for (let i = 0; i < usgsElev.length; i++) {
      const v = usgsElev[i]
      clampedUsgs[i] = (v < -10000 || !Number.isFinite(v) || v <= 0) ? 0 : v
    }
    verify = verifyTile(clampedUsgs, terrariumElev)
  }

  return { key, status: 'generated', sizeKB, verify }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Cook Inlet Corrected Elevation Tile Generator')
  console.log(`Source: USGS 3DEP ImageServer (IfSAR for Alaska)`)
  console.log(`Output: ${TILES_DIR}`)
  console.log(`Bbox: N=${BBOX.north} S=${BBOX.south} W=${BBOX.west} E=${BBOX.east}`)
  console.log(`Zooms: ${ZOOM_LEVELS.join(', ')}`)
  console.log('')

  // Build tile list
  const tiles = []
  for (const z of ZOOM_LEVELS) {
    const range = tileRange(z)
    const count = (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1)
    console.log(`  z${z}: x=${range.minX}-${range.maxX}, y=${range.minY}-${range.maxY} (${count} tiles)`)
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        tiles.push({ z, x, y })
      }
    }
  }
  console.log(`\nTotal: ${tiles.length} tiles\n`)

  mkdirSync(TILES_DIR, { recursive: true })

  // Process in batches
  const results = []
  let completed = 0
  let warnings = []

  for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
    const batch = tiles.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(({ z, x, y }) => processTile(z, x, y).catch(err => ({
        key: `${z}/${x}/${y}`,
        status: 'error',
        error: err.message,
      }))),
    )

    for (const result of batchResults) {
      results.push(result)
      completed++

      if (result.status === 'generated') {
        const v = result.verify
        const verifyStr = v
          ? `land_match=${v.matchPct.toFixed(1)}% ocean_fixed=${v.oceanFixed} max_delta=${v.maxDelta.toFixed(0)}m`
          : 'no verification'
        console.log(`  [${completed}/${tiles.length}] ${result.key} — ${result.sizeKB} KB — ${verifyStr}`)

        if (v && v.matchPct < 90) {
          warnings.push({ key: result.key, matchPct: v.matchPct })
        }
      } else if (result.status === 'skipped') {
        console.log(`  [${completed}/${tiles.length}] ${result.key} — skipped (exists)`)
      } else {
        console.log(`  [${completed}/${tiles.length}] ${result.key} — ERROR: ${result.error}`)
      }
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < tiles.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────

  console.log('\n═══ Summary ═══')

  const generated = results.filter(r => r.status === 'generated')
  const skipped   = results.filter(r => r.status === 'skipped')
  const errors    = results.filter(r => r.status === 'error')

  console.log(`  Generated: ${generated.length}`)
  console.log(`  Skipped:   ${skipped.length}`)
  console.log(`  Errors:    ${errors.length}`)

  if (generated.length > 0) {
    const verified = generated.filter(r => r.verify)
    const totalOceanFixed = verified.reduce((sum, r) => sum + r.verify.oceanFixed, 0)
    const avgMatch = verified.length > 0
      ? (verified.reduce((sum, r) => sum + r.verify.matchPct, 0) / verified.length).toFixed(1)
      : 'N/A'
    const worstMatch = verified.length > 0
      ? Math.min(...verified.map(r => r.verify.matchPct)).toFixed(1)
      : 'N/A'

    console.log(`  Avg land match:   ${avgMatch}%`)
    console.log(`  Worst land match: ${worstMatch}%`)
    console.log(`  Total ocean pixels fixed: ${totalOceanFixed}`)
  }

  if (warnings.length > 0) {
    console.log('\n⚠  Low land-match tiles (< 90%):')
    for (const w of warnings) {
      console.log(`    ${w.key}: ${w.matchPct.toFixed(1)}%`)
    }
  }

  if (errors.length > 0) {
    console.log('\n✗  Failed tiles:')
    for (const e of errors) {
      console.log(`    ${e.key}: ${e.error}`)
    }
    process.exit(1)
  }

  console.log('\nDone! Corrected tiles saved to public/tiles/elevation/')
}

main().catch((err) => {
  console.error('Generation failed:', err.message)
  process.exit(1)
})
