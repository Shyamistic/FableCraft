'use client'

import { useRef, useState, useCallback } from 'react'
import { Sparkles, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import DrawingCanvas, { DrawingCanvasHandle } from './DrawingCanvas'
import ImageUploader from './ImageUploader'
import { Character } from '../lib/types'
import { BRAND_COLORS } from '../lib/branding'

/**
 * CharacterStudio component orchestrates the character creation flow:
 * 1. Drawing/uploading artwork
 * 2. Previewing the submitted artwork
 * 3. Entering a character name
 * 4. Calling the backend to generate an animated character
 * 5. Displaying the animated character alongside the original drawing
 *
 * Requirements: 1.3, 1.6, 3.4, 3.5, 3.6, 16.5, 16.6
 */

type InputMode = 'draw' | 'upload'
type StudioStep = 'input' | 'preview' | 'generating' | 'result' | 'error'

export interface CharacterStudioProps {
  /** Session ID for the current user session */
  sessionId: string
  /** Called when character generation is complete */
  onCharacterGenerated?: (character: Character) => void
  /** Optional API base URL override (defaults to '') */
  apiBaseUrl?: string
}

export default function CharacterStudio({
  sessionId,
  onCharacterGenerated,
  apiBaseUrl = '',
}: CharacterStudioProps) {
  const canvasRef = useRef<DrawingCanvasHandle>(null)

  const [inputMode, setInputMode] = useState<InputMode>('draw')
  const [step, setStep] = useState<StudioStep>('input')
  const [imageData, setImageData] = useState<string | null>(null)
  const [characterName, setCharacterName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingVisible, setLoadingVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [generatedCharacter, setGeneratedCharacter] = useState<Character | null>(null)

  // ─── Handle drawing submission ─────────────────────────────────────────
  const handleSubmitDrawing = useCallback(() => {
    let data: string | null = null

    if (inputMode === 'draw') {
      data = canvasRef.current?.getImageData() || null
    } else {
      data = imageData
    }

    if (!data) {
      return
    }

    setImageData(data)
    setStep('preview')
  }, [inputMode, imageData])

  // ─── Handle image upload ───────────────────────────────────────────────
  const handleImageReady = useCallback((base64Data: string) => {
    setImageData(base64Data)
  }, [])

  // ─── Handle going back to input step ───────────────────────────────────
  const handleBackToInput = useCallback(() => {
    setStep('input')
    setNameError(null)
    setErrorMessage(null)
  }, [])

  // ─── Handle character generation ───────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    // Validate character name
    const trimmedName = characterName.trim()
    if (!trimmedName) {
      setNameError('Please give your character a name!')
      return
    }

    setNameError(null)
    setIsLoading(true)
    setStep('generating')

    // Show loading indicator within 1 second (we show immediately for best UX)
    const loadingTimer = setTimeout(() => {
      setLoadingVisible(true)
    }, 0)

    try {
      // Strip the data URL prefix to get just the base64 data
      const base64Content = imageData?.includes(',')
        ? imageData.split(',')[1]
        : imageData

      const response = await fetch(`${apiBaseUrl}/api/characters/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawing_data: base64Content,
          character_name: trimmedName,
          session_id: sessionId,
        }),
      })

      const data = await response.json()

      if (!response.ok || data.status === 'error') {
        // Use the message from backend if available, otherwise child-friendly fallback
        const message =
          data.message ||
          "Oops! Something went wrong creating your character. Let's try again!"
        setErrorMessage(message)
        setStep('error')
        return
      }

      // Success
      const character: Character = data.character
      setGeneratedCharacter(character)
      setStep('result')
      onCharacterGenerated?.(character)
    } catch {
      setErrorMessage(
        "Oh no! We couldn't reach the character creator right now. Please try again in a moment!"
      )
      setStep('error')
    } finally {
      clearTimeout(loadingTimer)
      setIsLoading(false)
      setLoadingVisible(true) // Ensure it was visible
    }
  }, [characterName, imageData, apiBaseUrl, sessionId, onCharacterGenerated])

  // ─── Handle retry from error state ─────────────────────────────────────
  const handleRetry = useCallback(() => {
    setErrorMessage(null)
    setStep('preview')
  }, [])

  // ─── Handle starting over ──────────────────────────────────────────────
  const handleStartOver = useCallback(() => {
    setStep('input')
    setImageData(null)
    setCharacterName('')
    setNameError(null)
    setErrorMessage(null)
    setGeneratedCharacter(null)
    setIsLoading(false)
    setLoadingVisible(false)
  }, [])

  // ─── Render: Input Step ────────────────────────────────────────────────
  if (step === 'input') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-4xl mx-auto p-4" data-testid="character-studio">
        <h1
          className="text-3xl font-bold text-center"
          style={{ color: BRAND_COLORS.tertiary }}
        >
          Create Your Character
        </h1>
        <p className="text-gray-600 text-center text-lg">
          Draw or upload a picture, and we&apos;ll bring it to life!
        </p>

        {/* Mode Selector */}
        <div className="flex gap-2" role="tablist" aria-label="Input mode">
          <button
            role="tab"
            aria-selected={inputMode === 'draw'}
            onClick={() => setInputMode('draw')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              inputMode === 'draw'
                ? 'text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            style={{
              backgroundColor: inputMode === 'draw' ? BRAND_COLORS.primary : undefined,
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            ✏️ Draw
          </button>
          <button
            role="tab"
            aria-selected={inputMode === 'upload'}
            onClick={() => setInputMode('upload')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              inputMode === 'upload'
                ? 'text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            style={{
              backgroundColor: inputMode === 'upload' ? BRAND_COLORS.primary : undefined,
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            📷 Upload
          </button>
        </div>

        {/* Drawing Canvas or Image Uploader */}
        <div className="w-full" role="tabpanel">
          {inputMode === 'draw' ? (
            <DrawingCanvas ref={canvasRef} />
          ) : (
            <ImageUploader onImageReady={handleImageReady} />
          )}
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmitDrawing}
          data-testid="submit-drawing-btn"
          className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-white text-lg shadow-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: BRAND_COLORS.primary, minWidth: '44px', minHeight: '44px' }}
        >
          <Sparkles size={24} />
          Next: Name Your Character
        </button>
      </div>
    )
  }

  // ─── Render: Preview Step ──────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto p-4" data-testid="character-studio">
        <button
          onClick={handleBackToInput}
          className="self-start flex items-center gap-1 text-gray-600 hover:text-gray-800 transition-colors"
          style={{ minWidth: '44px', minHeight: '44px' }}
          aria-label="Go back to drawing"
        >
          <ArrowLeft size={20} />
          Back
        </button>

        <h2
          className="text-2xl font-bold text-center"
          style={{ color: BRAND_COLORS.tertiary }}
        >
          Preview Your Artwork
        </h2>

        {/* Artwork preview */}
        <div className="w-full flex justify-center">
          <div className="rounded-2xl overflow-hidden shadow-lg border-2 border-gray-200 bg-white">
            <img
              src={imageData || ''}
              alt="Your submitted artwork"
              data-testid="artwork-preview"
              className="block max-w-full"
              style={{ maxWidth: '600px', maxHeight: '400px', objectFit: 'contain' }}
            />
          </div>
        </div>

        {/* Name input */}
        <div className="w-full max-w-sm space-y-2">
          <label
            htmlFor="character-name"
            className="block text-lg font-semibold text-gray-700 text-center"
          >
            What&apos;s your character&apos;s name?
          </label>
          <input
            id="character-name"
            type="text"
            value={characterName}
            onChange={(e) => {
              setCharacterName(e.target.value)
              if (nameError) setNameError(null)
            }}
            placeholder="e.g. Sparkle, Buddy, Luna..."
            data-testid="character-name-input"
            className="w-full px-4 py-3 text-lg rounded-xl border-2 border-gray-300 focus:border-purple-500 focus:outline-none transition-colors"
            maxLength={50}
            aria-describedby={nameError ? 'name-error' : undefined}
          />
          {nameError && (
            <p
              id="name-error"
              className="text-center text-sm font-medium"
              style={{ color: BRAND_COLORS.error }}
              role="alert"
              data-testid="name-error"
            >
              {nameError}
            </p>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          data-testid="generate-btn"
          className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-white text-lg shadow-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: BRAND_COLORS.success, minWidth: '44px', minHeight: '44px' }}
        >
          <Sparkles size={24} />
          Bring My Character to Life!
        </button>
      </div>
    )
  }

  // ─── Render: Generating Step (Loading) ─────────────────────────────────
  if (step === 'generating') {
    return (
      <div
        className="flex flex-col items-center justify-center gap-6 w-full max-w-2xl mx-auto p-8 min-h-[400px]"
        data-testid="character-studio"
      >
        <div
          className="flex flex-col items-center gap-4"
          role="status"
          aria-live="polite"
          data-testid="loading-indicator"
        >
          <Loader2
            size={64}
            className="animate-spin"
            style={{ color: BRAND_COLORS.tertiary }}
          />
          <h2
            className="text-2xl font-bold text-center"
            style={{ color: BRAND_COLORS.tertiary }}
          >
            Creating your character...
          </h2>
          <p className="text-gray-500 text-center text-lg">
            Our artists are working their magic! ✨
          </p>
        </div>
      </div>
    )
  }

  // ─── Render: Error Step ────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div
        className="flex flex-col items-center justify-center gap-6 w-full max-w-2xl mx-auto p-8 min-h-[400px]"
        data-testid="character-studio"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle size={64} style={{ color: BRAND_COLORS.error }} />
          <h2
            className="text-2xl font-bold"
            style={{ color: BRAND_COLORS.error }}
          >
            Uh oh!
          </h2>
          <p
            className="text-lg text-gray-700 max-w-md"
            role="alert"
            data-testid="error-message"
          >
            {errorMessage}
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleRetry}
              data-testid="retry-btn"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: BRAND_COLORS.primary, minWidth: '44px', minHeight: '44px' }}
            >
              Try Again
            </button>
            <button
              onClick={handleStartOver}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render: Result Step (side-by-side display) ────────────────────────
  if (step === 'result' && generatedCharacter) {
    return (
      <div
        className="flex flex-col items-center gap-6 w-full max-w-5xl mx-auto p-4"
        data-testid="character-studio"
      >
        <h2
          className="text-3xl font-bold text-center"
          style={{ color: BRAND_COLORS.tertiary }}
        >
          Meet {generatedCharacter.name}! 🎉
        </h2>

        {/* Side-by-side: Original Drawing + Generated Character */}
        <div
          className="flex flex-col md:flex-row gap-6 w-full items-center justify-center overflow-hidden"
          data-testid="character-comparison"
        >
          {/* Original Drawing */}
          <div className="flex flex-col items-center gap-2 w-full md:w-1/2 max-w-[400px]">
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Your Drawing
            </p>
            <div className="rounded-2xl overflow-hidden shadow-lg border-2 border-gray-200 bg-white w-full">
              <img
                src={generatedCharacter.original_drawing_url}
                alt="Your original drawing"
                data-testid="original-drawing"
                className="block w-full h-auto"
                style={{ maxHeight: '400px', objectFit: 'contain' }}
              />
            </div>
          </div>

          {/* Generated Character */}
          <div className="flex flex-col items-center gap-2 w-full md:w-1/2 max-w-[400px]">
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: BRAND_COLORS.success }}>
              Animated Character
            </p>
            <div className="rounded-2xl overflow-hidden shadow-lg border-2 bg-white w-full" style={{ borderColor: BRAND_COLORS.success }}>
              <img
                src={generatedCharacter.generated_image_url}
                alt={`${generatedCharacter.name} - your animated character`}
                data-testid="generated-character"
                className="block w-full h-auto"
                style={{ maxHeight: '400px', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>

        {/* Character Details */}
        <div className="text-center space-y-1">
          <p className="text-gray-600">
            <span className="font-semibold">{generatedCharacter.name}</span> is a{' '}
            <span className="font-semibold">{generatedCharacter.mood}</span>{' '}
            <span className="font-semibold">{generatedCharacter.character_type}</span>
          </p>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            {generatedCharacter.character_description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={handleStartOver}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            Draw Another
          </button>
        </div>
      </div>
    )
  }

  // Fallback (should not reach here)
  return null
}
