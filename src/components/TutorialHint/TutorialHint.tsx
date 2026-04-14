/**
 * TutorialHint — First-visit prompt for Map / Scan / Explore.
 *
 * Shows a small top-center pill on the user's very first visit to a given
 * screen (tracked per-screen in settingsStore, persisted to localStorage).
 * Tapping the pill opens the existing TutorialOverlay via startTutorial().
 * After ~4 seconds the pill auto-fades.  Either way, the screen is marked
 * "seen" and the pill never appears on that device again.
 *
 * Kept deliberately tiny: no libraries, no animation framework, one effect.
 */

import React, { useEffect, useState } from 'react'
import { useSettingsStore, useUIStore } from '../../store'
import { createLogger } from '../../core/logger'
import styles from './TutorialHint.module.css'

const log = createLogger('TUTORIAL-HINT')

/** How long the hint stays fully visible before the fade begins. */
const VISIBLE_MS = 4000
/** CSS fade-out duration — must match `transition: opacity` in the stylesheet. */
const FADE_MS = 1500

type HintScreen = 'map' | 'scan' | 'explore'

interface Props {
  screen: HintScreen
}

export const TutorialHint: React.FC<Props> = ({ screen }) => {
  const tutorialSeen = useSettingsStore((s) => s.tutorialSeen)
  const markTutorialSeen = useSettingsStore((s) => s.markTutorialSeen)
  const startTutorial = useUIStore((s) => s.startTutorial)
  const tutorialScreen = useUIStore((s) => s.tutorialScreen)

  const alreadySeen = tutorialSeen[screen]
  const overlayOpen = tutorialScreen === screen

  const shouldShow = !alreadySeen && !overlayOpen
  const [mounted, setMounted] = useState(shouldShow)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!shouldShow) return
    log.info('First-visit tutorial hint shown', { screen })

    const fadeTimer = window.setTimeout(() => setFading(true), VISIBLE_MS)
    const removeTimer = window.setTimeout(() => {
      setMounted(false)
      markTutorialSeen(screen)
    }, VISIBLE_MS + FADE_MS)

    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(removeTimer)
    }
  }, [shouldShow, screen, markTutorialSeen])

  if (!mounted) return null

  const handleClick = () => {
    log.info('Tutorial hint tapped', { screen })
    markTutorialSeen(screen)
    setMounted(false)
    startTutorial(screen)
  }

  return (
    <button
      type="button"
      className={`${styles.hint} ${fading ? styles.fading : ''}`}
      onClick={handleClick}
      aria-label={`Show tutorial for the ${screen} screen`}
    >
      New here? Tap for a quick guide
    </button>
  )
}
