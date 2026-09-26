import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDisplaySettings, saveDisplaySettings } from '@/lib/settings-storage'
import { DEFAULT_DISPLAY_SETTINGS } from '@/types/crystal'

describe('settings-storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('returns defaults when nothing is stored', () => {
    expect(loadDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })

  it('round-trips persisted settings', () => {
    saveDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, showCell: false, showBonds: false })
    const loaded = loadDisplaySettings()
    expect(loaded.showCell).toBe(false)
    expect(loaded.showBonds).toBe(false)
    expect(loaded.modelType).toBe(DEFAULT_DISPLAY_SETTINGS.modelType)
  })

  it('falls back to defaults for a corrupted payload', () => {
    localStorage.setItem('crystalviewer.display-settings', '{not json')
    expect(loadDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })

  it('merges partial payloads with defaults', () => {
    localStorage.setItem('crystalviewer.display-settings', '{"showCell":false}')
    const loaded = loadDisplaySettings()
    expect(loaded.showCell).toBe(false)
    expect(loaded.showLabels).toBe(DEFAULT_DISPLAY_SETTINGS.showLabels)
  })
})
