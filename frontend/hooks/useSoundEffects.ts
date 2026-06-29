'use client'

import { useCallback, useRef, useEffect } from 'react'

/**
 * Sound effect URLs from Mixkit (royalty-free).
 * These are external CDN links that may occasionally fail.
 * The hook handles failures silently — the app continues without sound.
 */
const SFX_URLS: Record<string, string> = {
  button_click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568.wav',
  correct_answer: 'https://assets.mixkit.co/active_storage/sfx/2013/2013.wav',
  wrong_answer: 'https://assets.mixkit.co/active_storage/sfx/2955/2955.wav',
  coin_earned: 'https://assets.mixkit.co/active_storage/sfx/888/888.wav',
  page_turn: 'https://assets.mixkit.co/active_storage/sfx/2617/2617.wav',
  confetti_pop: 'https://assets.mixkit.co/active_storage/sfx/1434/1434.wav',
  achievement_unlock: 'https://assets.mixkit.co/active_storage/sfx/2018/2018.wav',
  level_up: 'https://assets.mixkit.co/active_storage/sfx/2019/2019.wav',
}

export type SoundEffect = keyof typeof SFX_URLS

export function useSoundEffects() {
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map())
  const isMuted = useRef(false)
  const loadFailed = useRef<Set<string>>(new Set())

  // Preload common sounds (best-effort)
  useEffect(() => {
    Object.entries(SFX_URLS).forEach(([key, url]) => {
      try {
        const audio = new Audio()
        audio.preload = 'auto'
        audio.src = url
        audio.volume = 0.5
        audio.onerror = () => {
          loadFailed.current.add(key)
        }
        audioCache.current.set(key, audio)
      } catch {
        loadFailed.current.add(key)
      }
    })
  }, [])

  const play = useCallback((effect: SoundEffect) => {
    if (isMuted.current) return
    if (loadFailed.current.has(effect)) return

    try {
      const cached = audioCache.current.get(effect)
      if (cached) {
        // Clone to allow overlapping plays
        const clone = cached.cloneNode() as HTMLAudioElement
        clone.volume = 0.5
        clone.play().catch(() => {}) // Ignore autoplay blocks silently
      }
    } catch {
      // Silently ignore audio playback failures
    }
  }, [])

  const setMuted = useCallback((muted: boolean) => {
    isMuted.current = muted
  }, [])

  return { play, setMuted }
}
