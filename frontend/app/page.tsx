'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings, Home, Users, Map, BookOpen } from 'lucide-react'
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_COLORS,
  BRAND_LOGO_PATH,
  BRAND_LOGO_ALT,
} from '@/lib/branding'
import { getBackgroundStyle } from '@/lib/backgrounds'
import type { Quest, Character, Genre, GalleryEntry } from '@/lib/types'
import { useGamification } from '@/hooks/useGamification'
import { useBackgroundMusic } from '@/hooks/useBackgroundMusic'
import CharacterStudio from '@/components/CharacterStudio'
import CharacterGallery from '@/components/CharacterGallery'
import LessonSelector from '@/components/LessonSelector'
import GenreSelector from '@/components/GenreSelector'
import QuestBook from '@/components/QuestBook'
import ParentDashboard from '@/components/ParentDashboard'
import CollaborativeMode from '@/components/CollaborativeMode'
import AnalyticsProvider from '@/components/AnalyticsProvider'
import AccessibilityProvider from '@/components/AccessibilityProvider'
import AchievementToast from '@/components/AchievementToast'
import XPProgressBar from '@/components/XPProgressBar'
import WeeklyChallenge from '@/components/WeeklyChallenge'
import Bookshelf from '@/components/Bookshelf'
import AdventureMap from '@/components/AdventureMap'
import DifficultySelector, { DifficultyLevel, DIFFICULTY_CONFIGS } from '@/components/DifficultySelector'
import OnboardingFlow, { OnboardingStep, OnboardingFlowData } from '@/components/OnboardingFlow'
import {
  generateSessionId,
  getPersistedParentPin,
  getPersistedParentStats,
  getPersistedRecentQuests,
  getPersistedGallery,
  addCharacterToGallery,
} from '@/lib/persistence'

/**
 * Main application page integrating all frontend components.
 *
 * Flow: Home → CharacterStudio → LessonSelector → GenreSelector → QuestBook
 * Access points: CharacterGallery, ParentDashboard (settings icon), CollaborativeMode
 * Wrapped in AnalyticsProvider for Novus.ai tracking.
 *
 * Validates: Requirements 16.4, 17.2
 */

type AppView = 'home' | 'onboarding' | 'gallery' | 'quest' | 'collaboration' | 'bookshelf' | 'adventure-map'

export default function Page() {
  const [activeView, setActiveView] = useState<AppView>('home')
  const [showParentDashboard, setShowParentDashboard] = useState(false)
  const [sessionId, setSessionId] = useState<string>('')

  // Character state
  const [generatedCharacter, setGeneratedCharacter] = useState<Character | null>(null)

  // Quest state
  const [selectedLesson, setSelectedLesson] = useState<string>('')
  const [selectedGenre, setSelectedGenre] = useState<Genre>('fantasy_kingdom')
  const [questData, setQuestData] = useState<Quest | null>(null)
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium')

  // UI state
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string>('')

  // Gamification & Music hooks
  const gamification = useGamification()
  // Dynamic genre: play quest genre music during quests, menu music otherwise
  const musicGenre = activeView === 'quest' && questData ? questData.genre : 'menu'
  const { isPlaying: musicPlaying, play: playMusic, stop: stopMusic } = useBackgroundMusic(musicGenre)

  // Initialize session ID on mount and record activity for streak
  useEffect(() => {
    setSessionId(generateSessionId())
    gamification.recordActivity()

    // Preload all background images so they appear instantly on view change
    const bgImages = [
      '/backgrounds/prompt1.png', '/backgrounds/prompt2.png',
      '/backgrounds/prompt3.png', '/backgrounds/prompt4.png',
      '/backgrounds/prompt5.png', '/backgrounds/prompt6.png',
      '/backgrounds/prompt7.png', '/backgrounds/prompt8.png',
    ]
    bgImages.forEach(src => {
      const img = new Image()
      img.src = src
    })
  }, [])

  // Auto-play music when entering quest view (if music was already playing)
  useEffect(() => {
    if (activeView === 'quest' && questData && musicPlaying) {
      // Genre change triggers auto-switch in the hook
    }
  }, [activeView, questData])

  // Check achievements whenever relevant state changes
  useEffect(() => {
    gamification.checkAchievements()
  }, [gamification.questsCompleted, gamification.charactersCreated, gamification.streak.current])

  // ─── Character Studio callback ──────────────────────────────────────────
  const [characterJustGenerated, setCharacterJustGenerated] = useState(false)

  const handleCharacterGenerated = useCallback((character: Character) => {
    setGeneratedCharacter(character)
    setSelectedLesson('')
    setSelectedGenre('fantasy_kingdom')
    setQuestData(null)
    setError('')
    gamification.awardXP(25)
    gamification.incrementCharacters()

    // Save character to persistent gallery
    addCharacterToGallery({
      id: character.id,
      name: character.name,
      generated_image_url: character.generated_image_url,
      original_drawing_url: character.original_drawing_url,
      created_at: character.created_at,
    })

    // Delay the forceStep so user can see the generated character
    setCharacterJustGenerated(false)
    setTimeout(() => setCharacterJustGenerated(true), 18000)
  }, [gamification])

  // ─── Lesson Selection callback ──────────────────────────────────────────
  const handleLessonSelected = useCallback((lesson: string) => {
    setSelectedLesson(lesson)
    // Auto-advance to genre step after lesson selection (small delay for visual feedback)
    setCharacterJustGenerated(false) // Reset so forceStep doesn't interfere
    setTimeout(() => {
      // Force step to genre
      setForceGenreStep(true)
    }, 500)
  }, [])

  const [forceGenreStep, setForceGenreStep] = useState(false)

  // ─── Genre Selection callback ───────────────────────────────────────────
  const handleGenreSelected = useCallback((genre: Genre) => {
    setSelectedGenre(genre)
    handleCreateQuest(genre)
  }, [generatedCharacter, selectedLesson, sessionId])

  // ─── Create quest after lesson and genre are selected ────────────────
  const handleCreateQuest = async (genre: Genre) => {
    if (!generatedCharacter || !selectedLesson) {
      setError('Missing character or lesson information')
      return
    }

    setIsGenerating(true)
    setError('')

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

      const response = await fetch(`${apiUrl}/api/quests/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_id: generatedCharacter.id,
          character_name: generatedCharacter.name,
          character_description: generatedCharacter.character_description,
          lesson: selectedLesson,
          genre: genre,
          session_id: sessionId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to create quest' }))
        throw new Error(errorData.detail || errorData.message || 'Failed to create quest')
      }

      const data = await response.json()
      setQuestData(data.quest || data)
      setActiveView('quest')
    } catch (err: any) {
      setError(err.message || 'Failed to create quest. Please try again.')
      console.error('Error creating quest:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  // ─── Quest completion ───────────────────────────────────────────────────
  const handleQuestComplete = useCallback((coinsEarned?: number) => {
    const coins = coinsEarned || 0
    gamification.awardXP(100)
    if (coins === 8) gamification.markPerfectQuest()
    gamification.incrementQuests(selectedGenre)

    // Add to bookshelf
    if (questData) {
      gamification.addToBookshelf({
        questId: questData.id,
        title: questData.title,
        characterName: questData.character_name,
        genre: questData.genre,
        completedAt: new Date().toISOString(),
        coinsEarned: coins,
        coverImageUrl: questData.scenes?.[0]?.image_url || '',
      })

      // Sync quest completion to DynamoDB (best-effort, non-blocking)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      fetch(`${apiUrl}/api/quests/${questData.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: sessionId,
          coins_earned: coins,
          lesson: selectedLesson,
        }),
      }).catch(() => {
        // Non-blocking: don't interrupt user experience if sync fails
      })
    }

    setGeneratedCharacter(null)
    setSelectedLesson('')
    setSelectedGenre('fantasy_kingdom')
    setQuestData(null)
    setError('')
    setCharacterJustGenerated(false)
    setForceGenreStep(false)
    setActiveView('home')
  }, [gamification, selectedGenre, questData, sessionId, selectedLesson])

  // ─── Gallery character selection ────────────────────────────────────────
  const handleGalleryCharacterSelected = useCallback((galleryEntry: GalleryEntry) => {
    const character: Character = {
      id: galleryEntry.id,
      name: galleryEntry.name,
      character_type: '',
      character_description: '',
      colors_used: [],
      artistic_style: '',
      mood: '',
      generated_image_url: galleryEntry.generated_image_url,
      original_drawing_url: galleryEntry.original_drawing_url,
      created_at: galleryEntry.created_at,
    }
    setGeneratedCharacter(character)
    setSelectedLesson('')
    setSelectedGenre('fantasy_kingdom')
    setQuestData(null)
    setError('')
    // Jump to onboarding at the lesson step since character is pre-loaded
    setActiveView('onboarding')
  }, [])

  // ─── Onboarding flow complete ───────────────────────────────────────────
  const handleOnboardingComplete = useCallback((data: OnboardingFlowData) => {
    if (data.quest) {
      setQuestData(data.quest)
      setActiveView('quest')
    }
  }, [])

  // ─── Navigation handlers ────────────────────────────────────────────────
  const handleGoHome = useCallback(() => {
    setActiveView('home')
    setGeneratedCharacter(null)
    setSelectedLesson('')
    setSelectedGenre('fantasy_kingdom')
    setQuestData(null)
    setError('')
    setIsGenerating(false)
  }, [])

  const handleStartCollaborative = useCallback(() => {
    setActiveView('collaboration')
  }, [])

  // ─── Render step content for the OnboardingFlow ─────────────────────────
  const renderStepContent = useCallback((step: OnboardingStep, data: OnboardingFlowData) => {
    switch (step) {
      case 'draw':
      case 'name':
      case 'generate':
        return (
          <CharacterStudio
            sessionId={sessionId}
            apiBaseUrl={process.env.NEXT_PUBLIC_API_URL || ''}
            onCharacterGenerated={handleCharacterGenerated}
          />
        )

      case 'lesson':
        return (
          <div>
            {generatedCharacter && (
              <div className="mb-6 text-center">
                <p className="text-2xl font-semibold" style={{ color: BRAND_COLORS.primary }}>
                  Great job! Now pick what {generatedCharacter.name} should learn about.
                </p>
              </div>
            )}
            <LessonSelector
              sessionId={sessionId}
              onLessonSelected={handleLessonSelected}
            />
          </div>
        )

      case 'genre':
        return (
          <div>
            <div className="mb-6 text-center">
              <p className="text-2xl font-semibold" style={{ color: BRAND_COLORS.primary }}>
                Choose a world for your adventure!
              </p>
            </div>
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div
                  className="animate-spin rounded-full h-16 w-16 border-b-4"
                  style={{ borderColor: BRAND_COLORS.primary }}
                />
                <p className="text-xl font-semibold" style={{ color: BRAND_COLORS.primary }}>
                  Creating your quest...
                </p>
              </div>
            ) : (
              <GenreSelector onGenreSelected={handleGenreSelected} />
            )}
            {error && (
              <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: BRAND_COLORS.error + '20' }}>
                <p style={{ color: BRAND_COLORS.error }} className="font-semibold">
                  {error}
                </p>
                <button
                  onClick={() => setError('')}
                  className="mt-2 px-4 py-2 rounded-lg text-white font-semibold"
                  style={{ backgroundColor: BRAND_COLORS.primary, minWidth: '44px', minHeight: '44px' }}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )

      case 'play':
        if (questData) {
          return (
            <QuestBook
              quest={questData}
              onQuestComplete={handleQuestComplete}
            />
          )
        }
        return (
          <div className="text-center py-12">
            <p className="text-xl" style={{ color: BRAND_COLORS.tertiary }}>
              Your adventure is loading...
            </p>
          </div>
        )

      default:
        return null
    }
  }, [sessionId, generatedCharacter, selectedLesson, isGenerating, error, questData, handleCharacterGenerated, handleLessonSelected, handleGenreSelected, handleQuestComplete])

  // Determine current background based on active view and genre
  const getScreenBackground = () => {
    switch (activeView) {
      case 'quest': return getBackgroundStyle('quest', selectedGenre)
      case 'gallery': return getBackgroundStyle('gallery')
      case 'bookshelf': return getBackgroundStyle('gallery')
      case 'adventure-map': return getBackgroundStyle('home')
      default: return getBackgroundStyle('home')
    }
  }

  return (
    <AnalyticsProvider>
      <AccessibilityProvider>
      {/* Achievement Toast */}
      {gamification.newlyUnlocked.length > 0 && (
        <AchievementToast
          achievement={gamification.newlyUnlocked[0]}
          onDismiss={gamification.clearNewlyUnlocked}
        />
      )}
      <main
        className="min-h-screen transition-colors duration-500 overflow-x-hidden relative"
        style={{
          ...getScreenBackground(),
          maxWidth: '100vw',
        }}
      >
        {/* ─── Decorative Floating Elements ───────────────────────────────── */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
          {/* Floating pencils */}
          <img src="/pencils/3.png" alt="" className="bg-decoration animate-sway" style={{ top: '8%', left: '2%', width: '40px', transform: 'rotate(-15deg)' }} />
          <img src="/pencils/7.png" alt="" className="bg-decoration animate-float-cloud" style={{ top: '20%', right: '3%', width: '35px', transform: 'rotate(10deg)', animationDelay: '1s' }} />
          <img src="/pencils/12.png" alt="" className="bg-decoration animate-sway" style={{ bottom: '15%', left: '4%', width: '38px', transform: 'rotate(-20deg)', animationDelay: '2s' }} />
          <img src="/pencils/16.png" alt="" className="bg-decoration animate-float-cloud" style={{ bottom: '25%', right: '5%', width: '42px', transform: 'rotate(15deg)', animationDelay: '0.5s' }} />
          <img src="/pencils/19.png" alt="" className="bg-decoration animate-sway" style={{ top: '55%', left: '6%', width: '30px', animationDelay: '1.5s' }} />

          {/* Sparkle stars */}
          <span className="bg-decoration animate-sparkle text-2xl" style={{ top: '12%', left: '15%' }}>✨</span>
          <span className="bg-decoration animate-sparkle text-xl" style={{ top: '35%', right: '12%', animationDelay: '0.7s' }}>⭐</span>
          <span className="bg-decoration animate-sparkle text-2xl" style={{ bottom: '20%', left: '20%', animationDelay: '1.4s' }}>🌟</span>
          <span className="bg-decoration animate-sparkle text-lg" style={{ top: '60%', right: '15%', animationDelay: '2.1s' }}>✨</span>
          <span className="bg-decoration animate-sparkle text-xl" style={{ top: '75%', left: '10%', animationDelay: '0.3s' }}>💫</span>

          {/* Soft cloud shapes */}
          <div className="bg-decoration animate-float-cloud" style={{ top: '5%', left: '30%', width: '120px', height: '60px', background: 'rgba(255,255,255,0.5)', borderRadius: '50px', filter: 'blur(2px)' }} />
          <div className="bg-decoration animate-float-cloud" style={{ top: '15%', right: '20%', width: '100px', height: '50px', background: 'rgba(255,255,255,0.4)', borderRadius: '40px', filter: 'blur(3px)', animationDelay: '2s' }} />
          <div className="bg-decoration animate-float-cloud" style={{ bottom: '10%', left: '40%', width: '140px', height: '55px', background: 'rgba(255,255,255,0.35)', borderRadius: '45px', filter: 'blur(2px)', animationDelay: '3s' }} />
        </div>
        {/* Parent Dashboard Overlay */}
        {showParentDashboard && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <ParentDashboard
                pin={getPersistedParentPin()}
                stats={getPersistedParentStats()}
                recentQuests={getPersistedRecentQuests()}
                onClose={() => setShowParentDashboard(false)}
              />
            </div>
          </div>
        )}

        <div className="max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8 py-4 w-full overflow-x-hidden relative z-10">
          {/* ─── Top Navigation Bar ───────────────────────────────────────── */}
          <nav
            className="mb-6 flex items-center justify-between rounded-3xl shadow-lg px-6 py-3 relative z-10"
            style={{
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '2px solid rgba(251, 191, 36, 0.2)',
              boxShadow: '0 4px 20px rgba(249, 115, 22, 0.08), 0 2px 8px rgba(139, 92, 246, 0.05)',
            }}
            aria-label="Main navigation"
          >
            {/* Left: Logo and Brand Name */}
            <div className="flex items-center gap-3">
              <div className="animate-bounce-gentle">
                <img
                  src={BRAND_LOGO_PATH}
                  alt={BRAND_LOGO_ALT}
                  className="h-10 w-10 md:h-12 md:w-12"
                />
              </div>
              <div className="hidden sm:block">
                <h1
                  className="text-2xl md:text-3xl font-bold leading-tight"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.tertiary})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {BRAND_NAME}
                </h1>
                <p className="text-xs md:text-sm" style={{ color: BRAND_COLORS.tertiary }}>
                  {BRAND_TAGLINE}
                </p>
              </div>
              {/* Gamification indicators */}
              <div className="hidden sm:flex items-center gap-2 ml-3">
                {gamification.streak.current > 0 && (
                  <span className="text-sm font-bold flex items-center gap-1" style={{ color: BRAND_COLORS.secondary }}>
                    🔥 {gamification.streak.current}
                  </span>
                )}
                <XPProgressBar
                  xp={gamification.xp}
                  level={gamification.level}
                  xpForNextLevel={gamification.xpForNextLevel}
                  xpProgress={gamification.xpProgress}
                />
              </div>
            </div>

            {/* Center: Home Button (shown when not on home) */}
            {activeView !== 'home' && (
              <button
                onClick={handleGoHome}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-white transition-all hover:scale-105 shadow-md"
                style={{
                  background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
                  minWidth: '44px',
                  minHeight: '44px',
                  boxShadow: '0 4px 14px rgba(249, 115, 22, 0.3)',
                }}
                aria-label="Go to home screen"
              >
                <Home size={20} />
                <span className="hidden sm:inline">Home</span>
              </button>
            )}

            {/* Right: Collaboration and Settings Buttons */}
            <div className="flex items-center gap-2">
              {activeView === 'home' && (
                <>
                  <button
                    onClick={() => setActiveView('adventure-map')}
                    className="flex items-center gap-1 px-3 py-2.5 rounded-full font-bold transition-all hover:scale-105"
                    style={{
                      background: `${BRAND_COLORS.success}15`,
                      color: BRAND_COLORS.success,
                      minWidth: '44px',
                      minHeight: '44px',
                    }}
                    title="Adventure Map"
                    aria-label="Open adventure map"
                  >
                    <Map size={18} />
                    <span className="hidden lg:inline text-sm">Map</span>
                  </button>
                  <button
                    onClick={() => setActiveView('bookshelf')}
                    className="flex items-center gap-1 px-3 py-2.5 rounded-full font-bold transition-all hover:scale-105"
                    style={{
                      background: `${BRAND_COLORS.secondary}15`,
                      color: BRAND_COLORS.secondary,
                      minWidth: '44px',
                      minHeight: '44px',
                    }}
                    title="My Bookshelf"
                    aria-label="Open bookshelf"
                  >
                    <BookOpen size={18} />
                    <span className="hidden lg:inline text-sm">Books</span>
                  </button>
                  <button
                    onClick={handleStartCollaborative}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full font-bold transition-all hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND_COLORS.info}, ${BRAND_COLORS.tertiary})`,
                      color: 'white',
                      minWidth: '44px',
                      minHeight: '44px',
                      boxShadow: '0 4px 14px rgba(56, 189, 248, 0.3)',
                    }}
                    title="Play with a friend"
                    aria-label="Start collaborative mode"
                  >
                    <Users size={20} />
                    <span className="hidden md:inline">Play Together</span>
                  </button>
                </>
              )}
              {/* Music toggle */}
              <button
                onClick={() => {
                  if (musicPlaying) {
                    stopMusic()
                  } else {
                    playMusic()
                  }
                }}
                className="p-2 rounded-full transition-all hover:scale-110 opacity-70 hover:opacity-100"
                style={{ color: BRAND_COLORS.info }}
                title={musicPlaying ? "Mute music" : "Play music"}
                aria-label={musicPlaying ? "Mute background music" : "Play background music"}
              >
                {musicPlaying ? '🎵' : '🔇'}
              </button>
              {/* Parent Dashboard settings icon - reduced size, not prominent to children */}
              <button
                onClick={() => setShowParentDashboard(!showParentDashboard)}
                className="p-2.5 rounded-full transition-all hover:scale-110 opacity-50 hover:opacity-100"
                style={{
                  background: 'rgba(139, 92, 246, 0.08)',
                  color: '#999',
                }}
                title="Parent Dashboard"
                aria-label="Open parent dashboard"
              >
                <Settings size={18} />
              </button>
            </div>
          </nav>

          {/* ─── Home Screen ──────────────────────────────────────────────── */}
          {activeView === 'home' && (
            <div className="animate-slide-up relative z-10 py-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 min-h-[calc(100vh-350px)]">
                {/* Start New Adventure (triggers OnboardingFlow) */}
                <button
                  onClick={() => setActiveView('onboarding')}
                  className="relative overflow-hidden rounded-[32px] p-10 text-center transition-all hover:scale-[1.02] focus:outline-none focus:ring-4 group"
                  style={{
                    background: `linear-gradient(145deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
                    color: 'white',
                    minHeight: '280px',
                    boxShadow: '0 12px 40px rgba(249, 115, 22, 0.25), 0 4px 12px rgba(251, 191, 36, 0.15)',
                  }}
                  aria-label="Create a new adventure"
                >
                  {/* Decorative inner elements */}
                  <div className="absolute top-4 right-6 text-4xl animate-sparkle opacity-60">✨</div>
                  <div className="absolute bottom-6 left-6 text-3xl animate-bounce-gentle opacity-50">🎨</div>
                  <div className="absolute top-1/2 right-8 w-16 h-16 rounded-full bg-white/10 group-hover:bg-white/20 transition-all" />

                  <div className="relative z-10 flex flex-col items-center justify-center h-full">
                    <div className="text-7xl mb-5 group-hover:animate-bounce-gentle" aria-hidden="true">🖌️</div>
                    <h2 className="text-3xl md:text-4xl font-bold mb-3 drop-shadow-sm">Create New Adventure</h2>
                    <p className="text-lg md:text-xl opacity-90 max-w-xs">Draw a character and go on a magical quest!</p>
                    <div className="mt-5 px-6 py-2.5 bg-white/20 rounded-full text-sm font-bold tracking-wide uppercase backdrop-blur-sm">
                      Let&apos;s Go! →
                    </div>
                  </div>
                </button>

                {/* Character Gallery */}
                <button
                  onClick={() => setActiveView('gallery')}
                  className="relative overflow-hidden rounded-[32px] p-10 text-center transition-all hover:scale-[1.02] focus:outline-none focus:ring-4 group"
                  style={{
                    background: `linear-gradient(145deg, ${BRAND_COLORS.tertiary}, ${BRAND_COLORS.info})`,
                    color: 'white',
                    minHeight: '280px',
                    boxShadow: '0 12px 40px rgba(139, 92, 246, 0.2), 0 4px 12px rgba(56, 189, 248, 0.15)',
                  }}
                  aria-label="Open character gallery"
                >
                  {/* Decorative inner elements */}
                  <div className="absolute top-4 left-6 text-4xl animate-sparkle opacity-60" style={{ animationDelay: '0.5s' }}>⭐</div>
                  <div className="absolute bottom-6 right-6 text-3xl animate-bounce-gentle opacity-50" style={{ animationDelay: '1s' }}>🦄</div>
                  <div className="absolute bottom-1/3 left-8 w-14 h-14 rounded-full bg-white/10 group-hover:bg-white/20 transition-all" />

                  <div className="relative z-10 flex flex-col items-center justify-center h-full">
                    <div className="text-7xl mb-5 group-hover:animate-bounce-gentle" aria-hidden="true">🎭</div>
                    <h2 className="text-3xl md:text-4xl font-bold mb-3 drop-shadow-sm">My Characters</h2>
                    <p className="text-lg md:text-xl opacity-90 max-w-xs">See all your amazing creations!</p>
                    <div className="mt-5 px-6 py-2.5 bg-white/20 rounded-full text-sm font-bold tracking-wide uppercase backdrop-blur-sm">
                      Open Gallery →
                    </div>
                  </div>
                </button>
              </div>

              {/* Weekly Challenge Card */}
              <div className="mt-6">
                <WeeklyChallenge challenge={gamification.weeklyChallenge} />
              </div>
            </div>
          )}

          {/* ─── Onboarding Flow (Main User Journey) ──────────────────────── */}
          {activeView === 'onboarding' && (
            <div
              className="cute-card p-6 md:p-8 animate-slide-up relative z-10"
            >
              <OnboardingFlow
                sessionId={sessionId}
                apiBaseUrl={process.env.NEXT_PUBLIC_API_URL || ''}
                onComplete={handleOnboardingComplete}
                renderStepContent={renderStepContent}
                forceStep={forceGenreStep ? 'genre' : characterJustGenerated ? 'lesson' : null}
              />
            </div>
          )}

          {/* ─── Character Gallery View ───────────────────────────────────── */}
          {activeView === 'gallery' && (
            <div
              className="cute-card p-6 md:p-8 animate-slide-up relative z-10"
            >
              <CharacterGallery
                characters={getPersistedGallery()}
                onCharacterSelected={handleGalleryCharacterSelected}
                onCreateNew={() => setActiveView('onboarding')}
              />
            </div>
          )}

          {/* ─── Quest Book (Full-screen play) ────────────────────────────── */}
          {activeView === 'quest' && questData && (
            <div className="animate-slide-up relative z-10">
              <QuestBook
                quest={questData}
                onQuestComplete={handleQuestComplete}
              />
            </div>
          )}

          {/* ─── Collaborative Mode ───────────────────────────────────────── */}
          {activeView === 'collaboration' && (
            <div
              className="cute-card p-6 md:p-8 animate-slide-up relative z-10"
            >
              <CollaborativeMode
                playerName="Player"
                quest={null}
                onClose={() => setActiveView('home')}
              />
            </div>
          )}

          {/* ─── Bookshelf View ────────────────────────────────────────────── */}
          {activeView === 'bookshelf' && (
            <div className="cute-card p-6 md:p-8 animate-slide-up relative z-10">
              <Bookshelf
                entries={gamification.bookshelf}
                onClose={() => setActiveView('home')}
              />
            </div>
          )}

          {/* ─── Adventure Map View ────────────────────────────────────────── */}
          {activeView === 'adventure-map' && (
            <div className="cute-card p-6 md:p-8 animate-slide-up relative z-10">
              <AdventureMap
                questsCompleted={gamification.questsCompleted}
                genresExplored={gamification.genresExplored}
                level={gamification.level}
                xpProgress={gamification.xpProgress}
                onClose={() => setActiveView('home')}
              />
            </div>
          )}
        </div>
      </main>
      </AccessibilityProvider>
    </AnalyticsProvider>
  )
}
