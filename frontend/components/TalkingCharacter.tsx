'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CharacterPoses {
  neutral: string | null   // character standing calmly
  talking: string | null   // character mid-speech
  happy: string | null     // character celebrating
}

export interface TalkingCharacterProps {
  /** Character name, shown below the character */
  name: string
  /** Fallback static image URL (original generated character image) */
  imageUrl: string
  /** Three-pose images for lip-sync animation (from Nova Canvas) */
  poses?: CharacterPoses | null
  /** Nova Reel intro video URL — plays once on first mount, then switches to image */
  introVideoUrl?: string | null
  /** When true, animate the character as if talking (synced to TTS playback) */
  isTalking?: boolean
  /** When true, show the "happy" celebratory pose */
  isHappy?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Additional CSS classes */
  className?: string
  /** Called when the intro video finishes playing */
  onIntroComplete?: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE_MAP = {
  sm: 'w-24 h-24',
  md: 'w-40 h-40',
  lg: 'w-56 h-56',
}

// Talking pose alternation interval (ms) — simulates mouth moving
const TALK_INTERVAL_MS = 320

// ─── Component ────────────────────────────────────────────────────────────────

export default function TalkingCharacter({
  name,
  imageUrl,
  poses,
  introVideoUrl,
  isTalking = false,
  isHappy = false,
  size = 'md',
  className = '',
  onIntroComplete,
}: TalkingCharacterProps) {
  const [showVideo, setShowVideo] = useState(!!introVideoUrl)
  const [talkFrame, setTalkFrame] = useState<'neutral' | 'talking'>('neutral')
  const [bounce, setBounce] = useState(false)
  const talkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // ── Intro video logic ──────────────────────────────────────────────────────
  const handleVideoEnd = useCallback(() => {
    setShowVideo(false)
    onIntroComplete?.()
  }, [onIntroComplete])

  const handleVideoError = useCallback(() => {
    setShowVideo(false)
  }, [])

  // ── Talking animation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isTalking && poses?.talking) {
      talkTimerRef.current = setInterval(() => {
        setTalkFrame(prev => (prev === 'neutral' ? 'talking' : 'neutral'))
      }, TALK_INTERVAL_MS)
    } else {
      setTalkFrame('neutral')
      if (talkTimerRef.current) {
        clearInterval(talkTimerRef.current)
        talkTimerRef.current = null
      }
    }
    return () => {
      if (talkTimerRef.current) clearInterval(talkTimerRef.current)
    }
  }, [isTalking, poses?.talking])

  // ── Happy bounce ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isHappy) {
      setBounce(true)
      const t = setTimeout(() => setBounce(false), 1200)
      return () => clearTimeout(t)
    }
  }, [isHappy])

  // ── Resolve which image to display ────────────────────────────────────────
  const displayImage = (() => {
    if (isHappy && poses?.happy) return poses.happy
    if (isTalking && poses?.talking && talkFrame === 'talking') return poses.talking
    if (poses?.neutral) return poses.neutral
    return imageUrl
  })()

  const sizeClass = SIZE_MAP[size]

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div
        className={`
          relative ${sizeClass} rounded-full overflow-hidden
          shadow-lg border-4 border-white
          transition-transform duration-150
          ${bounce ? 'animate-bounce' : ''}
          ${isTalking ? 'ring-4 ring-purple-400 ring-opacity-60' : ''}
        `}
      >
        {/* Nova Reel intro video — plays once, then fades to image */}
        {showVideo && introVideoUrl && (
          <video
            ref={videoRef}
            src={introVideoUrl}
            autoPlay
            muted={false}
            playsInline
            onEnded={handleVideoEnd}
            onError={handleVideoError}
            className="absolute inset-0 w-full h-full object-cover z-10"
          />
        )}

        {/* Static / pose image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayImage}
          alt={`${name} the story character`}
          className={`
            w-full h-full object-cover
            transition-opacity duration-200
            ${showVideo ? 'opacity-0' : 'opacity-100'}
          `}
          draggable={false}
        />

        {/* Talking pulse ring */}
        {isTalking && !showVideo && (
          <span className="absolute inset-0 rounded-full animate-ping bg-purple-300 opacity-20 pointer-events-none" />
        )}
      </div>

      {/* Character name badge */}
      <span className="text-sm font-bold text-purple-700 bg-purple-100 px-3 py-0.5 rounded-full shadow-sm select-none">
        {name}
      </span>
    </div>
  )
}
