/**
 * EarthContours — Settings Store
 *
 * Persists user preferences to localStorage using Zustand's persist middleware.
 * All settings here are actually consumed somewhere in the app.  Old unused
 * settings were removed in v11 (see migration below for the full list).
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  AppSettings,
  UnitSystem,
  VerticalExaggeration,
} from '../core/types'
import { createLogger } from '../core/logger'

const log = createLogger('STORE:SETTINGS')

// ─── Default Settings ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  // Units
  units: 'imperial',

  // Appearance
  darkMode: true,

  // Shared map/explore overlays
  showPeakLabels: true,
  showCoastlines: true,
  showRivers: true,
  showLakes: true,
  showGlaciers: false,

  // Map-only overlays
  showRoads: false,

  // Explore
  verticalExaggeration: 4,  // 4× default — dramatic but not absurd

  // Scan render toggles
  showContourLines: true,
  showFill: true,
  showSilhouetteLines: true,

  // Advanced (dev-leaning) — all off by default
  showBandLines: false,
  seeThroughMountains: false,
  showDebugPanel: false,
}

// ─── Store Interface ──────────────────────────────────────────────────────────

interface SettingsStore extends AppSettings {
  setUnits: (units: UnitSystem) => void
  toggleDarkMode: () => void
  togglePeakLabels: () => void
  toggleCoastlines: () => void
  toggleRivers: () => void
  toggleLakes: () => void
  toggleGlaciers: () => void
  toggleRoads: () => void
  setVerticalExaggeration: (v: VerticalExaggeration) => void
  toggleContourLines: () => void
  toggleFill: () => void
  toggleSilhouetteLines: () => void
  toggleBandLines: () => void
  toggleSeeThroughMountains: () => void
  toggleDebugPanel: () => void
  resetToDefaults: () => void
}

// ─── Store Implementation ─────────────────────────────────────────────────────

/** Keys that were removed in v11 — wiped from persisted state on migration. */
const REMOVED_KEYS_V11 = [
  'coordFormat',
  'showTownLabels',
  'contourAnimation',
  'colorTheme',
  'labelSize',
  'reduceMotion',
  'locationAccuracy',
  'autoDetectRegion',
  'batteryMode',
  'targetFPS',
  'downloadOnWifiOnly',
  'dataResolution',
  'defaultRegionId',
] as const

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setUnits: (units) => {
        log.info('Units changed', { from: get().units, to: units })
        set({ units })
      },

      toggleDarkMode: () => {
        const next = !get().darkMode
        log.info('Dark mode toggled', { now: next })
        set({ darkMode: next })
      },

      togglePeakLabels: () => {
        const next = !get().showPeakLabels
        log.info('Peak labels toggled', { now: next })
        set({ showPeakLabels: next })
      },

      toggleCoastlines: () => {
        const next = !get().showCoastlines
        log.info('Coastlines toggled', { now: next })
        set({ showCoastlines: next })
      },

      toggleRivers: () => {
        const next = !get().showRivers
        log.info('Rivers toggled', { now: next })
        set({ showRivers: next })
      },

      toggleLakes: () => {
        const next = !get().showLakes
        log.info('Lakes toggled', { now: next })
        set({ showLakes: next })
      },

      toggleGlaciers: () => {
        const next = !get().showGlaciers
        log.info('Glaciers toggled', { now: next })
        set({ showGlaciers: next })
      },

      toggleRoads: () => {
        const next = !get().showRoads
        log.info('Roads toggled', { now: next })
        set({ showRoads: next })
      },

      setVerticalExaggeration: (verticalExaggeration) => {
        log.info('Vertical exaggeration changed', { to: `${verticalExaggeration}×` })
        set({ verticalExaggeration })
      },

      toggleContourLines: () => {
        const next = !get().showContourLines
        log.info('Contour lines toggled', { now: next })
        set({ showContourLines: next })
      },

      toggleFill: () => {
        const next = !get().showFill
        log.info('Fill toggled', { now: next })
        set({ showFill: next })
      },

      toggleSilhouetteLines: () => {
        const next = !get().showSilhouetteLines
        log.info('Silhouette lines toggled', { now: next })
        set({ showSilhouetteLines: next })
      },

      toggleBandLines: () => {
        const next = !get().showBandLines
        log.info('Band lines toggled', { now: next })
        set({ showBandLines: next })
      },

      toggleSeeThroughMountains: () => {
        const next = !get().seeThroughMountains
        log.info('See-through mountains toggled', { now: next })
        set({ seeThroughMountains: next })
      },

      toggleDebugPanel: () => {
        const next = !get().showDebugPanel
        log.info('Debug panel toggled', { now: next })
        set({ showDebugPanel: next })
      },

      resetToDefaults: () => {
        log.warn('Settings reset to defaults!')
        set(DEFAULT_SETTINGS)
      },
    }),
    {
      name: 'earthcontours-settings',      // localStorage key
      version: 11,                         // bump when persisted shape changes
      /**
       * Migrations:
       * v1→v2: snap old verticalExaggeration values to new set (1|2|4|10|20).
       * v2→v3: replace showRiverLabels + showWaterLabels with showRivers + showLakes + showGlaciers.
       * v3→v4: add showFill (default false), showBandLines default changed to false.
       * v4→v5: add darkMode.
       * v5→v6: fix showFill/showBandLines defaults — v4 wrongly set them to false,
       *        making terrain invisible for existing users.
       * v6→v7: replace solidTerrain (unused) with showSilhouetteLines.
       * v7→v8: cap verticalExaggeration at 4× (removed 10× and 20×).
       * v8→v9: add showRoads (default false).
       * v9→v10: add seeThroughMountains (default false).
       * v10→v11: Settings system audit — delete all orphaned settings
       *          (coordFormat, showTownLabels, contourAnimation, colorTheme,
       *          labelSize, reduceMotion, locationAccuracy, autoDetectRegion,
       *          batteryMode, targetFPS, downloadOnWifiOnly, dataResolution,
       *          defaultRegionId).  Default showBandLines to false (moved
       *          to Advanced).
       */
      migrate: (persisted: unknown, fromVersion: number) => {
        const state = persisted as Record<string, unknown>
        if (fromVersion < 11) {
          log.info('Migrating settings v10→v11: removing orphaned keys, band lines default off')
          for (const key of REMOVED_KEYS_V11) delete state[key]
          // Reset Band Lines default — it's now Advanced and off by default.
          // Existing users who had it on keep their preference (only wipe if undefined).
          if (state.showBandLines === undefined) state.showBandLines = false
        }
        if (fromVersion < 10) {
          if (state.seeThroughMountains === undefined) state.seeThroughMountains = false
        }
        if (fromVersion < 9) {
          if (state.showRoads === undefined) state.showRoads = false
        }
        if (fromVersion < 2 && typeof state.verticalExaggeration === 'number') {
          const VALID: VerticalExaggeration[] = [1, 1.5, 2, 4, 10]
          const old = state.verticalExaggeration as number
          const snapped = VALID.reduce((best, v) =>
            Math.abs(v - old) < Math.abs(best - old) ? v : best
          )
          log.info('Migrating verticalExaggeration', { from: old, to: snapped })
          state.verticalExaggeration = snapped
        }
        if (fromVersion < 8 && typeof state.verticalExaggeration === 'number') {
          if (state.verticalExaggeration > 10) {
            log.info('Migrating verticalExaggeration v7→v8: capping to 10×', { from: state.verticalExaggeration })
            state.verticalExaggeration = 10
          }
        }
        if (fromVersion < 7) {
          log.info('Migrating settings v6→v7: replace solidTerrain with showSilhouetteLines')
          delete state.solidTerrain
          if (state.showSilhouetteLines === undefined) state.showSilhouetteLines = true
        }
        if (fromVersion < 6) {
          log.info('Migrating settings v5→v6: fix showFill default to true')
          state.showFill = true
          if (state.darkMode === undefined) state.darkMode = true
        }
        if (fromVersion < 4) {
          log.info('Migrating settings v3→v4: add showFill')
          if (state.showFill === undefined) state.showFill = true
        }
        if (fromVersion < 3) {
          log.info('Migrating water settings v2→v3')
          state.showRivers = state.showRiverLabels ?? true
          state.showLakes = state.showWaterLabels ?? true
          state.showGlaciers = false
          delete state.showRiverLabels
          delete state.showWaterLabels
        }
        return state as unknown as AppSettings
      },
      storage: createJSONStorage(() => {
        try {
          return localStorage
        } catch (err) {
          log.warn('localStorage unavailable, settings will not persist', err)
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          }
        }
      }),
      // Only persist settings values, not action functions.
      partialize: (state) => ({
        units: state.units,
        darkMode: state.darkMode,
        showPeakLabels: state.showPeakLabels,
        showCoastlines: state.showCoastlines,
        showRivers: state.showRivers,
        showLakes: state.showLakes,
        showGlaciers: state.showGlaciers,
        showRoads: state.showRoads,
        verticalExaggeration: state.verticalExaggeration,
        showContourLines: state.showContourLines,
        showFill: state.showFill,
        showSilhouetteLines: state.showSilhouetteLines,
        showBandLines: state.showBandLines,
        seeThroughMountains: state.seeThroughMountains,
        showDebugPanel: state.showDebugPanel,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          log.error('Failed to rehydrate settings from localStorage', error)
        } else {
          log.info('Settings loaded from localStorage', {
            units: state?.units,
          })
        }
      },
    },
  ),
)
