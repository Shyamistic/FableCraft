/**
 * Achievement definitions and evaluation logic for the gamification system.
 */

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  criteria: AchievementCriteria
  unlockedAt: string | null
}

export type AchievementCriteria =
  | { type: 'quests_completed'; count: number }
  | { type: 'first_drawing' }
  | { type: 'all_genres_explored' }
  | { type: 'streak_days'; count: number }
  | { type: 'characters_created'; count: number }
  | { type: 'perfect_quest' }
  | { type: 'collaborative_quest' }

export interface GamificationState {
  xp: number
  level: number
  streak: {
    current: number
    lastActiveDate: string | null
    longestStreak: number
  }
  questsCompleted: number
  charactersCreated: number
  achievements: Achievement[]
  genresExplored: string[]
  hasPerfectQuest: boolean
  hasCollabQuest: boolean
  weeklyChallenge: WeeklyChallenge | null
  bookshelf: BookshelfEntry[]
}

export interface WeeklyChallenge {
  id: string
  title: string
  description: string
  target: number
  progress: number
  type: 'quests' | 'drawings' | 'streaks'
  startDate: string
  completed: boolean
}

export interface BookshelfEntry {
  questId: string
  title: string
  characterName: string
  genre: string
  completedAt: string
  coinsEarned: number
  coverImageUrl: string
}

/** XP required to reach a given level (exponential curve gentle for kids) */
export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1))
}

/** XP earned per action */
export const XP_REWARDS = {
  quest_completed: 100,
  perfect_quest: 50,
  drawing_created: 25,
  collaborative_quest: 75,
  daily_login: 10,
  weekly_challenge_complete: 200,
} as const

/** Default achievement definitions */
export const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'first_drawing', title: 'First Masterpiece', description: 'Created your first drawing!', icon: '🎨', criteria: { type: 'first_drawing' }, unlockedAt: null },
  { id: 'quest_5', title: 'Story Explorer', description: 'Completed 5 quests!', icon: '📚', criteria: { type: 'quests_completed', count: 5 }, unlockedAt: null },
  { id: 'quest_10', title: 'Adventure Master', description: 'Completed 10 quests!', icon: '🏆', criteria: { type: 'quests_completed', count: 10 }, unlockedAt: null },
  { id: 'quest_25', title: 'Legendary Storyteller', description: 'Completed 25 quests!', icon: '👑', criteria: { type: 'quests_completed', count: 25 }, unlockedAt: null },
  { id: 'all_genres', title: 'World Traveler', description: 'Explored all story worlds!', icon: '🌍', criteria: { type: 'all_genres_explored' }, unlockedAt: null },
  { id: 'streak_3', title: 'On a Roll!', description: '3 days in a row!', icon: '🔥', criteria: { type: 'streak_days', count: 3 }, unlockedAt: null },
  { id: 'streak_7', title: 'Week Warrior', description: '7 days in a row!', icon: '⚡', criteria: { type: 'streak_days', count: 7 }, unlockedAt: null },
  { id: 'perfect_quest', title: 'Perfect Score', description: 'Got all 8 stars in one quest!', icon: '⭐', criteria: { type: 'perfect_quest' }, unlockedAt: null },
  { id: 'characters_5', title: 'Character Creator', description: 'Created 5 characters!', icon: '🎭', criteria: { type: 'characters_created', count: 5 }, unlockedAt: null },
  { id: 'collab_quest', title: 'Team Player', description: 'Completed a quest with a friend!', icon: '🤝', criteria: { type: 'collaborative_quest' }, unlockedAt: null },
]

/**
 * Evaluates all achievements against current state and returns newly unlocked ones.
 */
export function evaluateAchievements(state: GamificationState): Achievement[] {
  const newlyUnlocked: Achievement[] = []

  for (const achievement of state.achievements) {
    if (achievement.unlockedAt !== null) continue

    let met = false
    switch (achievement.criteria.type) {
      case 'quests_completed':
        met = state.questsCompleted >= achievement.criteria.count
        break
      case 'first_drawing':
        met = state.charactersCreated > 0
        break
      case 'all_genres_explored':
        met = state.genresExplored.length >= 4
        break
      case 'streak_days':
        met = state.streak.current >= achievement.criteria.count
        break
      case 'characters_created':
        met = state.charactersCreated >= achievement.criteria.count
        break
      case 'perfect_quest':
        met = state.hasPerfectQuest
        break
      case 'collaborative_quest':
        met = state.hasCollabQuest
        break
    }

    if (met) {
      achievement.unlockedAt = new Date().toISOString()
      newlyUnlocked.push(achievement)
    }
  }

  return newlyUnlocked
}

/** Weekly challenge rotation pool */
const CHALLENGE_POOL: Omit<WeeklyChallenge, 'id' | 'startDate' | 'progress' | 'completed'>[] = [
  { title: 'Quest Master', description: 'Complete 3 quests this week!', target: 3, type: 'quests' },
  { title: 'Creative Burst', description: 'Create 5 drawings this week!', target: 5, type: 'drawings' },
  { title: 'Steady Explorer', description: 'Play 4 days this week!', target: 4, type: 'streaks' },
  { title: 'Story Marathon', description: 'Complete 5 quests this week!', target: 5, type: 'quests' },
  { title: 'Art Gallery', description: 'Create 3 characters this week!', target: 3, type: 'drawings' },
]

/**
 * Gets the current weekly challenge based on the week number.
 * Resets every Monday.
 */
export function getWeeklyChallenge(existingChallenge: WeeklyChallenge | null): WeeklyChallenge {
  const now = new Date()
  const startOfWeek = new Date(now)
  const day = startOfWeek.getDay()
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1) // Monday
  startOfWeek.setDate(diff)
  startOfWeek.setHours(0, 0, 0, 0)
  const weekStart = startOfWeek.toISOString().split('T')[0]

  // If existing challenge is from this week, keep it
  if (existingChallenge && existingChallenge.startDate === weekStart) {
    return existingChallenge
  }

  // Generate new challenge for this week
  const weekNum = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))
  const challengeIndex = weekNum % CHALLENGE_POOL.length
  const template = CHALLENGE_POOL[challengeIndex]

  return {
    ...template,
    id: `week_${weekStart}`,
    startDate: weekStart,
    progress: 0,
    completed: false,
  }
}
