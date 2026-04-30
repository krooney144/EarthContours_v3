/**
 * EarthContours — SCAN Tile Prefetch
 *
 * Loads elevation tiles via the main-thread 4-tier cache
 * (memory → IndexedDB → local → AWS) and decodes them so the SCAN worker
 * can use them without re-downloading. Mirrors the tile-key math the
 * worker uses internally.
 *
 * Returned tiles are transferred zero-copy to the worker. A module-level
 * Set tracks keys already shipped so we don't pay the decode + transfer
 * cost twice for the same tile within a session.
 */

import { loadElevationTile, decodeTerrarium } from './elevationLoader'
import { createLogger } from '../core/logger'
import type { PeakRefineItem } from '../core/types'

const log = createLogger('SCAN:PREFETCH')

const DEG_TO_RAD = Math.PI / 180
const REFINED_HALF_DEG = 6  // Must match skylineWorker.ts

const COOK_INLET_BOUNDS = { north: 61.44, south: 61.20, west: -150.00, east: -149.56 }

const injected = new Set<string>()

export interface PrefetchedTile { key: string; data: Float32Array }
export interface PrefetchResult {
  tiles: PrefetchedTile[]
  transferables: ArrayBuffer[]
}

const EMPTY: PrefetchResult = { tiles: [], transferables: [] }

function latLngToTileXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom))
  const latR = lat * DEG_TO_RAD
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * Math.pow(2, zoom),
  )
  return { x, y }
}

function distToRefinedZoom(distM: number): number {
  if (distM < 1_000)   return 15
  if (distM < 4_500)   return 15
  if (distM < 10_500)  return 14
  if (distM < 31_000)  return 13
  if (distM < 81_000)  return 11
  if (distM < 152_000) return 10
  return 9
}

function clampZoomForCorrectedArea(zoom: number, lat: number, lng: number): number {
  if (zoom > 13 &&
      lat >= COOK_INLET_BOUNDS.south && lat <= COOK_INLET_BOUNDS.north &&
      lng >= COOK_INLET_BOUNDS.west  && lng <= COOK_INLET_BOUNDS.east) {
    return 13
  }
  return zoom
}

async function decodeAndCollect(keys: Set<string>): Promise<PrefetchResult> {
  const fresh = [...keys].filter((k) => !injected.has(k))
  if (fresh.length === 0) return EMPTY

  const results = await Promise.all(fresh.map(async (key) => {
    try {
      const [z, x, y] = key.split('/').map(Number)
      const tile = await loadElevationTile(z, x, y)
      return { key, data: decodeTerrarium(tile) }
    } catch (err) {
      log.debug('Prefetch miss — worker will fall back to direct fetch', { key, err: String(err) })
      return null
    }
  }))

  const tiles: PrefetchedTile[] = []
  const transferables: ArrayBuffer[] = []
  for (const r of results) {
    if (!r) continue
    injected.add(r.key)
    tiles.push(r)
    transferables.push(r.data.buffer as ArrayBuffer)
  }
  log.info('Prefetched tiles for worker', { requested: fresh.length, delivered: tiles.length })
  return { tiles, transferables }
}

/**
 * Prefetch the tiles the worker will need for a 360° skyline computation.
 * `maxRangeM` should match the worker's MAX_DIST.
 */
export async function prefetchSkylineTiles(
  lat: number, lng: number, maxRangeM: number,
): Promise<PrefetchResult> {
  const cosLat = Math.cos(lat * DEG_TO_RAD)
  const zoomBands: Array<{ zoom: number; radiusM: number }> = [
    { zoom: 15, radiusM: 1_000 },
    { zoom: 14, radiusM: 4_500 },
    { zoom: 13, radiusM: 10_500 },
    { zoom: 11, radiusM: 31_000 },
    { zoom: 10, radiusM: 81_000 },
    { zoom:  9, radiusM: 152_000 },
    { zoom:  8, radiusM: maxRangeM },
  ]

  const keys = new Set<string>()
  for (const { zoom, radiusM } of zoomBands) {
    const dLat = (radiusM / 111_132) * 1.1
    const dLng = (radiusM / (111_320 * cosLat)) * 1.1
    const sw = latLngToTileXY(lat - dLat, lng - dLng, zoom)
    const ne = latLngToTileXY(lat + dLat, lng + dLng, zoom)
    const minX = Math.min(sw.x, ne.x), maxX = Math.max(sw.x, ne.x)
    const minY = Math.min(sw.y, ne.y), maxY = Math.max(sw.y, ne.y)
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        keys.add(`${zoom}/${x}/${y}`)
      }
    }
  }
  return decodeAndCollect(keys)
}

/**
 * Prefetch the higher-zoom tiles the worker will need to refine a set of peaks.
 */
export async function prefetchRefineTiles(
  viewerLat: number, viewerLng: number, peaks: PeakRefineItem[],
): Promise<PrefetchResult> {
  if (peaks.length === 0) return EMPTY
  const cosLat = Math.cos(viewerLat * DEG_TO_RAD)

  const keys = new Set<string>()
  for (const peak of peaks) {
    const azRad = peak.bearing * DEG_TO_RAD
    const peakLat = viewerLat + (Math.cos(azRad) * peak.distance) / 111_132
    const peakLng = viewerLng + (Math.sin(azRad) * peak.distance) / (111_320 * cosLat)
    const refinedZoom = clampZoomForCorrectedArea(distToRefinedZoom(peak.distance), peakLat, peakLng)

    const arcSpanM = peak.distance * Math.tan(REFINED_HALF_DEG * DEG_TO_RAD)
    const dLat = (arcSpanM / 111_132) * 1.3
    const dLng = (arcSpanM / (111_320 * cosLat)) * 1.3
    const sw = latLngToTileXY(peakLat - dLat, peakLng - dLng, refinedZoom)
    const ne = latLngToTileXY(peakLat + dLat, peakLng + dLng, refinedZoom)
    const minX = Math.min(sw.x, ne.x), maxX = Math.max(sw.x, ne.x)
    const minY = Math.min(sw.y, ne.y), maxY = Math.max(sw.y, ne.y)
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        keys.add(`${refinedZoom}/${x}/${y}`)
      }
    }
  }
  return decodeAndCollect(keys)
}
