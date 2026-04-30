/**
 * EarthContours — Splash Screen
 *
 * Shown on cold load while the default region's terrain loads in the
 * background. Exits when loadRegion resolves OR after a 600ms minimum
 * (whichever is later) so the splash never flashes too briefly.
 *
 * The progress bar is driven by terrainStore.loadingProgress directly —
 * no fake animation.
 */

import React, { useEffect, useState } from 'react'
import { useUIStore, useTerrainStore } from '../../store'
import { createLogger } from '../../core/logger'
import { DEFAULT_REGION_ID } from '../../core/constants'
import styles from './SplashScreen.module.css'

const log = createLogger('COMPONENT:SPLASH')

const MIN_SPLASH_MS = 600
const FADE_MS = 400

const SplashScreen: React.FC = () => {
  const setSplashComplete = useUIStore((state) => state.setSplashComplete)
  const initializeLayout = useUIStore((state) => state.initializeLayout)
  const loadRegion = useTerrainStore((state) => state.loadRegion)
  const loadingMessage = useTerrainStore((state) => state.loadingMessage)
  const loadingProgress = useTerrainStore((state) => state.loadingProgress)

  const [isFadingOut, setIsFadingOut] = useState(false)

  useEffect(() => {
    log.info('Splash screen mounted', { minMs: MIN_SPLASH_MS })

    initializeLayout()

    const startTime = Date.now()
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

    log.info('Starting background terrain load', { region: DEFAULT_REGION_ID })

    const loadPromise = loadRegion(DEFAULT_REGION_ID).catch((err) => {
      // Non-fatal — terrain UI shows error state; splash still exits.
      log.error('Background terrain load failed', err)
    })

    const minPromise = wait(MIN_SPLASH_MS)

    let cancelled = false
    Promise.all([loadPromise, minPromise]).then(() => {
      if (cancelled) return
      log.info('Splash exit conditions met', { elapsedMs: Date.now() - startTime })
      setIsFadingOut(true)
      setTimeout(() => {
        if (cancelled) return
        log.info('Splash fade complete — app ready')
        setSplashComplete()
      }, FADE_MS)
    })

    return () => {
      cancelled = true
      log.debug('Splash screen cleanup')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — intentionally run once

  return (
    <div
      className={`${styles.splash} ${isFadingOut ? styles.fadeOut : ''}`}
      role="status"
      aria-label="Loading EarthContours"
      aria-live="polite"
    >
      {/* Logo area */}
      <div className={styles.logoArea}>
        <img
          src="/Favicon3.svg"
          alt="Earth Contours logo"
          className={styles.logoImage}
          width="96"
          height="96"
        />
        <div className={styles.appName}>Earth Contours</div>
        <div className={styles.tagline}>Terrain Visualization</div>
      </div>

      {/* Loading progress */}
      <div className={styles.loadingSection}>
        <div
          className={styles.progressBar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(loadingProgress)}
        >
          <div
            className={styles.progressFill}
            style={{ width: `${loadingProgress}%` }}
          />
        </div>
        <div className={styles.loadingText}>
          {loadingMessage || 'Initializing...'}
        </div>
      </div>

      <div className={styles.version}>v3.0</div>
    </div>
  )
}

export default SplashScreen
