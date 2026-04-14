/**
 * EarthContours — SETTINGS Screen
 *
 * Reorganized v3 layout (settings system audit):
 *   1. About
 *   2. Take a Tour
 *   3. Appearance   (dark mode, units)
 *   4. Map          (map-only + shared map/explore overlays)
 *   5. Explore      (explore-only controls + note about shared overlays)
 *   6. Scan         (scan render toggles)
 *   7. Location     (GPS permission UI — always visible)
 *   8. Advanced     (collapsible, closed on every open — dev flags)
 *   9. Feedback & Support
 *
 * Every setting that appears here is actually consumed somewhere in the app.
 * The audit removed 13 unused settings; see settingsStore.ts v11 migration.
 */

import React, { useCallback, useState } from 'react'
import { useSettingsStore, useLocationStore, useUIStore } from '../../store'
import { createLogger } from '../../core/logger'
import { submitFeedback } from '../../data/feedbackService'
import type { UnitSystem } from '../../core/types'
import styles from './SettingsScreen.module.css'

const log = createLogger('SCREEN:SETTINGS')

// ─── Helper sub-components ─────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean
  onChange: () => void
  id: string
  label: string
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, id, label }) => (
  <label className={styles.toggle} htmlFor={id} aria-label={label}>
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={onChange}
    />
    <div className={styles.toggleTrack} />
    <div className={styles.toggleThumb} />
  </label>
)

interface SegmentedProps<T extends string | number> {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}

function Segmented<T extends string | number>({
  options, value, onChange, ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          className={`${styles.segmentBtn} ${value === opt.value ? styles.active : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

interface RowProps {
  label: string
  description?: string
  children: React.ReactNode
}

const Row: React.FC<RowProps> = ({ label, description, children }) => (
  <div className={styles.row}>
    <div className={styles.rowLeft}>
      <div className={styles.rowLabel}>{label}</div>
      {description && <div className={styles.rowDescription}>{description}</div>}
    </div>
    {children}
  </div>
)

interface SectionProps {
  icon: string
  title: string
  note?: string
  children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({ icon, title, note, children }) => (
  <div className={styles.section}>
    <div className={styles.sectionHeader}>
      <span className={styles.sectionIcon} aria-hidden="true">{icon}</span>
      <span className={styles.sectionTitle}>{title}</span>
    </div>
    {note && <div className={styles.sectionNote}>{note}</div>}
    {children}
  </div>
)

/**
 * Advanced section — collapsible, always starts collapsed on every open.
 * State is local (useState), not persisted, so devs have to expand it each
 * session.  Keeps experimental flags out of the way for normal users.
 */
interface AdvancedSectionProps {
  children: React.ReactNode
}

const AdvancedSection: React.FC<AdvancedSectionProps> = ({ children }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.advancedHeader}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="advanced-content"
      >
        <span className={styles.sectionIcon} aria-hidden="true">◇</span>
        <span className={styles.sectionTitle}>Advanced</span>
        <span className={`${styles.advancedChevron} ${open ? styles.advancedChevronOpen : ''}`} aria-hidden="true">▾</span>
      </button>
      {open && <div id="advanced-content">{children}</div>}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

const SettingsScreen: React.FC = () => {
  const settings = useSettingsStore()
  const { gpsPermission, requestGPS } = useLocationStore()
  const startTutorial = useUIStore((s) => s.startTutorial)

  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [feedbackIssueUrl, setFeedbackIssueUrl] = useState<string | null>(null)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [showLocationHelp, setShowLocationHelp] = useState(false)

  log.debug('SettingsScreen render', {
    units: settings.units,
    darkMode: settings.darkMode,
  })

  const handleFeedbackSubmit = useCallback(async () => {
    if (!feedbackText.trim()) return

    setFeedbackStatus('sending')
    setFeedbackError(null)
    setFeedbackIssueUrl(null)

    log.info('Submitting feedback to GitHub', { length: feedbackText.length })

    const result = await submitFeedback(feedbackText)

    if (result.success) {
      setFeedbackStatus('sent')
      setFeedbackIssueUrl(result.issueUrl ?? null)
      setFeedbackText('')
      setTimeout(() => {
        setFeedbackStatus('idle')
        setFeedbackIssueUrl(null)
      }, 5000)
    } else {
      setFeedbackStatus('error')
      setFeedbackError(result.error ?? 'Unknown error')
      log.error('Feedback submission failed', { error: result.error })
    }
  }, [feedbackText])

  const handleExportLogs = useCallback(() => {
    log.info('Export logs triggered')
    const logData = `EarthContours Log Export\n${new Date().toISOString()}\n\nLog export not yet implemented in MVP.\nCheck browser console for detailed logs.`
    const blob = new Blob([logData], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `earthcontours-logs-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleResetSettings = useCallback(() => {
    if (!resetConfirm) {
      setResetConfirm(true)
      setTimeout(() => setResetConfirm(false), 3000)
      return
    }
    log.warn('Settings reset confirmed by user')
    settings.resetToDefaults()
    setResetConfirm(false)
  }, [resetConfirm, settings])

  const handleRequestGPS = useCallback(async () => {
    log.info('GPS permission request triggered from settings')
    try {
      await requestGPS()
    } catch (err) {
      log.error('GPS request failed from settings', err)
    }
  }, [requestGPS])

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>SETTINGS</div>
        <div className={styles.headerSubtitle}>App preferences and configuration</div>
      </div>

      {/* Scrollable content */}
      <div className={styles.scrollArea} role="main">

        {/* ── About ── */}
        <Section icon="◈" title="About Earth Contours">
          <div className={styles.aboutText}>
            Earth Contours visualizes real terrain elevation data on your phone.
            Use the Map to browse topographic tiles and select locations, Explore
            to view 3D terrain with contour lines, and Scan for a first-person
            360° panoramic skyline with ridgeline rendering and peak identification.
            All elevation data comes from AWS Terrarium DEM tiles.
          </div>
        </Section>

        {/* ── Take a Tour ── */}
        <Section icon="◈" title="Take a Tour">
          <div className={styles.aboutText}>
            Learn how each screen works with a quick visual guide.
          </div>
          <div className={styles.tourButtons}>
            <button className={styles.tourBtn} onClick={() => startTutorial('map')}>
              Map Tutorial
            </button>
            <button className={styles.tourBtn} onClick={() => startTutorial('explore')}>
              Explore Tutorial
            </button>
            <button className={styles.tourBtn} onClick={() => startTutorial('scan')}>
              Scan Tutorial
            </button>
          </div>
        </Section>

        {/* ── Appearance ── */}
        <Section icon="◈" title="Appearance">
          <Row label="Dark Mode" description="Switch between dark and light theme for sunlight readability">
            <Toggle
              id="toggle-darkmode"
              label="Toggle dark mode"
              checked={settings.darkMode}
              onChange={settings.toggleDarkMode}
            />
          </Row>
          <Row label="Unit System" description="Feet and miles, or meters and km">
            <Segmented<UnitSystem>
              options={[
                { value: 'imperial', label: 'Imperial' },
                { value: 'metric',   label: 'Metric' },
              ]}
              value={settings.units}
              onChange={(v) => settings.setUnits(v)}
              ariaLabel="Unit system"
            />
          </Row>
        </Section>

        {/* ── Map ── */}
        <Section
          icon="⊕"
          title="Map"
          note="Overlays marked “shared” also appear on the Explore 3D view."
        >
          <Row label="Roads" description="Show road overlay on map (zoom 8+)">
            <Toggle id="toggle-roads" label="Toggle roads" checked={settings.showRoads} onChange={settings.toggleRoads} />
          </Row>
          <Row label="Peak Labels" description="Mountain name labels — shared with Explore and Scan">
            <Toggle id="toggle-peaks" label="Toggle peak labels" checked={settings.showPeakLabels} onChange={settings.togglePeakLabels} />
          </Row>
          <Row label="Coastlines" description="Coastline outlines — shared with Explore">
            <Toggle id="toggle-coastlines" label="Toggle coastlines" checked={settings.showCoastlines} onChange={settings.toggleCoastlines} />
          </Row>
          <Row label="Rivers" description="Rivers and streams — shared with Explore">
            <Toggle id="toggle-rivers" label="Toggle rivers" checked={settings.showRivers} onChange={settings.toggleRivers} />
          </Row>
          <Row label="Lakes" description="Lakes and reservoirs — shared with Explore">
            <Toggle id="toggle-lakes" label="Toggle lakes" checked={settings.showLakes} onChange={settings.toggleLakes} />
          </Row>
          <Row label="Glaciers" description="Glaciers and ice features — shared with Explore">
            <Toggle id="toggle-glaciers" label="Toggle glaciers" checked={settings.showGlaciers} onChange={settings.toggleGlaciers} />
          </Row>
        </Section>

        {/* ── Explore ── */}
        <Section
          icon="⬡"
          title="Explore"
          note="Overlays are shared with Map — toggle them in the Map section."
        >
          <Row
            label="Vertical Exaggeration"
            description="Multiply terrain heights in the 3D view (also adjustable inline on the Explore screen)"
          >
            <div className={styles.exagOptions}>
              {([1, 1.5, 2, 4] as const).map((v) => (
                <button
                  key={v}
                  className={`${styles.exagBtn} ${settings.verticalExaggeration === v ? styles.active : ''}`}
                  onClick={() => settings.setVerticalExaggeration(v)}
                  aria-pressed={settings.verticalExaggeration === v}
                  aria-label={`${v}× vertical exaggeration`}
                >
                  {v}×
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* ── Scan ── */}
        <Section icon="◉" title="Scan">
          <Row label="Contour Lines" description="Show elevation contour lines in Scan view">
            <Toggle id="toggle-contours" label="Toggle contour lines" checked={settings.showContourLines} onChange={settings.toggleContourLines} />
          </Row>
          <Row label="Terrain Fill" description="Show solid terrain fill below ridgelines">
            <Toggle id="toggle-fill" label="Toggle terrain fill" checked={settings.showFill} onChange={settings.toggleFill} />
          </Row>
          <Row label="Silhouette Lines" description="Show silhouette edge strokes">
            <Toggle id="toggle-silhouette-lines" label="Toggle silhouette lines" checked={settings.showSilhouetteLines} onChange={settings.toggleSilhouetteLines} />
          </Row>
        </Section>

        {/* ── Location ── */}
        <Section icon="◎" title="Location">
          <Row
            label="GPS Permission"
            description={
              gpsPermission === 'denied'
                ? 'Location was denied — tap HOW TO ENABLE for instructions'
                : 'Required for real-time position tracking'
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span className={`${styles.statusBadge} ${
                gpsPermission === 'granted'     ? styles.statusGranted :
                gpsPermission === 'denied'      ? styles.statusDenied  :
                                                  styles.statusUnknown
              }`}>
                {gpsPermission === 'granted'     ? '● GRANTED' :
                 gpsPermission === 'denied'      ? '✕ DENIED'  :
                 gpsPermission === 'unavailable' ? '— N/A'     :
                                                   '? UNKNOWN' }
              </span>
              {gpsPermission === 'denied' ? (
                <button
                  className={styles.actionBtn}
                  onClick={() => setShowLocationHelp((v) => !v)}
                >
                  {showLocationHelp ? 'HIDE' : 'HOW TO ENABLE'}
                </button>
              ) : gpsPermission !== 'granted' ? (
                <button className={styles.actionBtn} onClick={handleRequestGPS}>
                  REQUEST
                </button>
              ) : null}
            </div>
          </Row>
          {showLocationHelp && gpsPermission === 'denied' && (
            <div className={styles.locationHelp} role="note">
              <div className={styles.locationHelpTitle}>Re-enable Location Access</div>
              <div className={styles.locationHelpBody}>
                <p><strong>iPhone (Safari):</strong></p>
                <p>Settings &gt; Privacy &amp; Security &gt; Location Services &gt; Safari Websites &gt; While Using the App</p>
                <p><strong>Android (Chrome):</strong></p>
                <p>Tap the lock icon in the address bar &gt; Permissions &gt; Location &gt; Allow</p>
              </div>
              <button
                className={styles.actionBtn}
                onClick={() => {
                  log.info('User attempting GPS re-request after reading help')
                  handleRequestGPS()
                }}
                style={{ marginTop: 'var(--space-3)' }}
              >
                TRY AGAIN
              </button>
            </div>
          )}
        </Section>

        {/* ── Advanced (collapsible, closed by default every open) ── */}
        <AdvancedSection>
          <Row label="Band Lines" description="Depth band ridgeline strokes in Scan view (experimental)">
            <Toggle id="toggle-band-lines" label="Toggle band lines" checked={settings.showBandLines} onChange={settings.toggleBandLines} />
          </Row>
          <Row label="See-through Mountains" description="Draw contour lines through terrain (disables occlusion)">
            <Toggle id="toggle-see-through-mountains" label="Toggle see-through mountains" checked={settings.seeThroughMountains} onChange={settings.toggleSeeThroughMountains} />
          </Row>
          <Row label="Debug Panel" description="Show diagnostics overlay on Scan screen">
            <Toggle id="toggle-debug-panel" label="Toggle debug panel" checked={settings.showDebugPanel} onChange={settings.toggleDebugPanel} />
          </Row>
        </AdvancedSection>

        {/* ── Feedback & Support ── */}
        <Section icon="◈" title="Feedback & Support">
          <div className={styles.feedbackArea}>
            <textarea
              className={styles.textarea}
              placeholder="Describe a bug, request a feature, or share feedback..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              aria-label="Feedback text"
              rows={4}
              disabled={feedbackStatus === 'sending'}
            />
            <div className={styles.feedbackActions}>
              <button
                className={styles.actionBtn}
                onClick={handleFeedbackSubmit}
                disabled={!feedbackText.trim() || feedbackStatus === 'sending'}
                aria-label="Submit feedback as GitHub issue"
              >
                {feedbackStatus === 'sending' ? 'SENDING...' :
                 feedbackStatus === 'sent'    ? '✓ SENT' :
                 feedbackStatus === 'error'   ? 'RETRY' :
                                                'SUBMIT'}
              </button>
              <button
                className={styles.actionBtn}
                onClick={handleExportLogs}
                aria-label="Export debug logs"
              >
                EXPORT LOGS
              </button>
            </div>

            {feedbackStatus === 'sent' && feedbackIssueUrl && (
              <div className={styles.feedbackSuccess} role="status">
                Feedback submitted!{' '}
                <a
                  href={feedbackIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.feedbackLink}
                >
                  View issue on GitHub
                </a>
              </div>
            )}

            {feedbackStatus === 'error' && feedbackError && (
              <div className={styles.feedbackErrorMsg} role="alert">
                {feedbackError}
              </div>
            )}
          </div>
          <Row label="Reset All Settings" description="Restore all settings to their default values">
            <button
              className={`${styles.actionBtn} ${styles.danger}`}
              onClick={handleResetSettings}
              aria-label={resetConfirm ? 'Confirm settings reset' : 'Reset all settings'}
            >
              {resetConfirm ? 'CONFIRM?' : 'RESET'}
            </button>
          </Row>
        </Section>

        {/* Version info */}
        <div className={styles.versionInfo}>
          <div className={styles.logoMark}>◈</div>
          <div className={styles.versionText}>Earth Contours v3.0</div>
          <div className={styles.versionText}>Built with React + Vite + Zustand</div>
          <div className={styles.versionText}>Map tiles © OpenTopoMap contributors</div>
        </div>

      </div>
    </div>
  )
}

export default SettingsScreen
