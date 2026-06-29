'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface AccessibilitySettings {
  largeTextMode: boolean
  highContrastMode: boolean
  reducedMotion: boolean
  simplifiedNavigation: boolean
}

interface AccessibilityContextValue {
  settings: AccessibilitySettings
  updateSetting: (key: keyof AccessibilitySettings, value: boolean) => void
  resetToDefaults: () => void
}

const STORAGE_KEY = 'fablecraft_accessibility'

const DEFAULT_SETTINGS: AccessibilitySettings = {
  largeTextMode: false,
  highContrastMode: false,
  reducedMotion: false,
  simplifiedNavigation: false,
}

const AccessibilityContext = createContext<AccessibilityContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSetting: () => {},
  resetToDefaults: () => {},
})

export function useAccessibility() {
  return useContext(AccessibilityContext)
}

export default function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(DEFAULT_SETTINGS)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setSettings(prev => ({ ...prev, ...JSON.parse(stored) }))
      }
    } catch {}
    setIsHydrated(true)
  }, [])

  // Persist settings (only after hydration)
  useEffect(() => {
    if (!isHydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {}
  }, [settings, isHydrated])

  // Apply CSS classes to body based on settings
  useEffect(() => {
    const body = document.body
    body.classList.toggle('large-text-mode', settings.largeTextMode)
    body.classList.toggle('high-contrast-mode', settings.highContrastMode)
    body.classList.toggle('reduced-motion-mode', settings.reducedMotion)
    body.classList.toggle('simplified-nav-mode', settings.simplifiedNavigation)
  }, [settings])

  // Respect system preference for reduced motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) {
      setSettings(prev => ({ ...prev, reducedMotion: true }))
    }
  }, [])

  const updateSetting = useCallback((key: keyof AccessibilitySettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
  }, [])

  return (
    <AccessibilityContext.Provider value={{ settings, updateSetting, resetToDefaults }}>
      {children}
    </AccessibilityContext.Provider>
  )
}
