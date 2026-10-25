import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from '@/types/crystal'

const STORAGE_KEY = 'crystalviewer.display-settings'

/**
 * Load persisted display settings. Unknown or missing keys fall back to the
 * defaults, so old payloads never break the app.
 *
 * Payloads written before symmetry helpers became opt-in are detected by the
 * absence of `symmetryOpacity` and treated as legacy: their
 * `showSymmetryElements` flag (which could be "show everything") is discarded
 * in favour of the new default, while colours and other choices are kept.
 */
export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_DISPLAY_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>
    const legacy = typeof parsed.symmetryOpacity !== 'number'
    return {
      ...DEFAULT_DISPLAY_SETTINGS,
      ...parsed,
      // Nested records need a deep merge so payloads persisted before these
      // keys existed keep working.
      symmetryColors: { ...DEFAULT_DISPLAY_SETTINGS.symmetryColors, ...parsed.symmetryColors },
      hiddenSymmetryElements: parsed.hiddenSymmetryElements ?? [],
      showSymmetryElements: legacy
        ? DEFAULT_DISPLAY_SETTINGS.showSymmetryElements
        : (parsed.showSymmetryElements ?? DEFAULT_DISPLAY_SETTINGS.showSymmetryElements),
      symmetryOpacity: legacy
        ? DEFAULT_DISPLAY_SETTINGS.symmetryOpacity
        : (parsed.symmetryOpacity as number),
      symmetryRadius:
        typeof parsed.symmetryRadius === 'number'
          ? parsed.symmetryRadius
          : DEFAULT_DISPLAY_SETTINGS.symmetryRadius,
      xrayMode:
        typeof parsed.xrayMode === 'boolean' ? parsed.xrayMode : DEFAULT_DISPLAY_SETTINGS.xrayMode,
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
