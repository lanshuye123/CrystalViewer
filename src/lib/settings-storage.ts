import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from '@/types/crystal'

const STORAGE_KEY = 'crystalviewer.display-settings'

/**
 * Load persisted display settings from localStorage. Unknown or missing keys
 * fall back to the defaults, so old payloads never break the app.
 */
export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_DISPLAY_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>
    return {
      ...DEFAULT_DISPLAY_SETTINGS,
      ...parsed,
      // Nested records need a deep merge so payloads persisted before these
      // keys existed keep working.
      symmetryColors: { ...DEFAULT_DISPLAY_SETTINGS.symmetryColors, ...parsed.symmetryColors },
      hiddenSymmetryElements: parsed.hiddenSymmetryElements ?? [],
    }
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS }
  }
}

/** Persist display settings; silently ignores storage failures (quota, privacy mode). */
export function saveDisplaySettings(settings: DisplaySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage unavailable — settings simply do not persist.
  }
}
