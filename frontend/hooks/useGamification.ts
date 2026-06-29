'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  type GamificationState,
  type Achievement,
  type BookshelfEntry,
  type WeeklyChallenge,
  DEFAULT_ACHIEVEMENTS,
  xpForLevel,
  evaluateAchievements,
  getWeeklyChallenge,
  XP_REWARDS,
} from '@/lib/achievements'

const STORAGE_KEY = 'fablecraft_gamification'
const MAX_BOOKSHELF = 100

const INITIAL_STATE: GamificationState = {
  xp: 0,
  level: 1,
  streak: { current: 0, lastActiveDate: null, longestStreak: 0 },
  questsCompleted: 0,
  charactersCreated: 0,
  achievements: DEFAULT_ACHIEVEMENTS,
  genresExplored: [],
  hasPerfectQuest: false,
  hasCollabQuest: false,
  weeklyChallenge: null,
  bookshelf: [],
}

export function useGamification() {
  const [state, setState] = useState<GamificationState>(INITIAL_STATE)
  const [isHydrated, setIsHydrated] = useState(false)
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([])

  // Hydrate from localStorage only on client after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setState(migrateState(JSON.parse(stored)))
      }
    } catch {}
    setIsHydrated(true)
  }, [])

  // Persist on change (only after hydration)
  useEffect(() => {
    if (!isHydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage full or unavailable
    }
  }, [state, isHydrated])

  // Initialize/update weekly challenge
  useEffect(() => {
    setState(prev => {
      const challenge = getWeeklyChallenge(prev.weeklyChallenge)
      if (challenge.id !== prev.weeklyChallenge?.id) {
        return { ...prev, weeklyChallenge: challenge }
      }
      return prev
    })
  }, [])

  const awardXP = useCallback((amount: number) => {
    setState(prev => {
      let newXP = prev.xp + amount
      let newLevel = prev.level
      while (newXP >= xpForLevel(newLevel + 1)) {
        newLevel++
      }
      return { ...prev, xp: newXP, level: newLevel }
    })
  }, [])

  const recordActivity = useCallback(() => {
    const today = new Date().toISOString().split('T')[0]
    setState(prev => {
      const { lastActiveDate, current, longestStreak } = prev.streak
      if (lastActiveDate === today) return prev

      let newCurrent = 1
      if (lastActiveDate) {
        const last = new Date(lastActiveDate)
        const todayDate = new Date(today)
        const diffDays = Math.floor((todayDate.getTime() - last.getTime()) / 86400000)
        if (diffDays === 1) newCurrent = current + 1
      }

      // Update weekly challenge progress for streak type
      let updatedChallenge = prev.weeklyChallenge
      if (updatedChallenge && updatedChallenge.type === 'streaks' && !updatedChallenge.completed) {
        updatedChallenge = {
          ...updatedChallenge,
          progress: updatedChallenge.progress + 1,
          completed: updatedChallenge.progress + 1 >= updatedChallenge.target,
        }
      }

      return {
        ...prev,
        streak: {
          current: newCurrent,
          lastActiveDate: today,
          longestStreak: Math.max(longestStreak, newCurrent),
        },
        weeklyChallenge: updatedChallenge,
      }
    })
  }, [])

  const incrementQuests = useCallback((genre?: string) => {
    setState(prev => {
      const newGenres = genre && !prev.genresExplored.includes(genre)
        ? [...prev.genresExplored, genre]
        : prev.genresExplored

      // Update weekly challenge progress for quest type
      let updatedChallenge = prev.weeklyChallenge
      if (updatedChallenge && updatedChallenge.type === 'quests' && !updatedChallenge.completed) {
        updatedChallenge = {
          ...updatedChallenge,
          progress: updatedChallenge.progress + 1,
          completed: updatedChallenge.progress + 1 >= updatedChallenge.target,
        }
      }

      return {
        ...prev,
        questsCompleted: prev.questsCompleted + 1,
        genresExplored: newGenres,
        weeklyChallenge: updatedChallenge,
      }
    })
  }, [])

  const incrementCharacters = useCallback(() => {
    setState(prev => {
      // Update weekly challenge progress for drawing type
      let updatedChallenge = prev.weeklyChallenge
      if (updatedChallenge && updatedChallenge.type === 'drawings' && !updatedChallenge.completed) {
        updatedChallenge = {
          ...updatedChallenge,
          progress: updatedChallenge.progress + 1,
          completed: updatedChallenge.progress + 1 >= updatedChallenge.target,
        }
      }

      return {
        ...prev,
        charactersCreated: prev.charactersCreated + 1,
        weeklyChallenge: updatedChallenge,
      }
    })
  }, [])

  const markPerfectQuest = useCallback(() => {
    setState(prev => ({ ...prev, hasPerfectQuest: true }))
  }, [])

  const markCollabQuest = useCallback(() => {
    setState(prev => ({ ...prev, hasCollabQuest: true }))
  }, [])

  const checkAchievements = useCallback(() => {
    setState(prev => {
      const unlocked = evaluateAchievements(prev)
      if (unlocked.length > 0) {
        setNewlyUnlocked(unlocked)
      }
      return { ...prev, achievements: [...prev.achievements] }
    })
  }, [])

  const clearNewlyUnlocked = useCallback(() => {
    setNewlyUnlocked([])
  }, [])

  const addToBookshelf = useCallback((entry: BookshelfEntry) => {
    setState(prev => {
      const updated = [entry, ...prev.bookshelf].slice(0, MAX_BOOKSHELF)
      return { ...prev, bookshelf: updated }
    })
  }, [])

  return {
    ...state,
    newlyUnlocked,
    awardXP,
    recordActivity,
    incrementQuests,
    incrementCharacters,
    markPerfectQuest,
    markCollabQuest,
    checkAchievements,
    clearNewlyUnlocked,
    addToBookshelf,
    xpForNextLevel: xpForLevel(state.level + 1),
    xpProgress: state.xp / xpForLevel(state.level + 1),
    XP_REWARDS,
  }
}

/**
 * Migrates old gamification state format to new format.
 */
function migrateState(data: any): GamificationState {
  // If it already has the new fields, return as-is
  if (data.genresExplored !== undefined && data.bookshelf !== undefined) {
    // Ensure achievements have full data
    if (data.achievements && data.achievements.length > 0 && !data.achievements[0].title) {
      data.achievements = DEFAULT_ACHIEVEMENTS.map((def) => {
        const existing = data.achievements.find((a: any) => a.id === def.id)
        return { ...def, unlockedAt: existing?.unlockedAt || null }
      })
    }
    return data as GamificationState
  }

  // Migrate from old format
  return {
    xp: data.xp || 0,
    level: data.level || 1,
    streak: data.streak || { current: 0, lastActiveDate: null, longestStreak: 0 },
    questsCompleted: data.questsCompleted || 0,
    charactersCreated: data.charactersCreated || 0,
    achievements: DEFAULT_ACHIEVEMENTS.map((def) => {
      const existing = data.achievements?.find((a: any) => a.id === def.id)
      return { ...def, unlockedAt: existing?.unlockedAt || null }
    }),
    genresExplored: data.genresExplored || [],
    hasPerfectQuest: data.hasPerfectQuest || false,
    hasCollabQuest: data.hasCollabQuest || false,
    weeklyChallenge: data.weeklyChallenge || null,
    bookshelf: data.bookshelf || [],
  }
}
