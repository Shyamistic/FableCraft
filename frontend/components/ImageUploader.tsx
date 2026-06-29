'use client'

import { useRef, useState, useCallback } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'
import { BRAND_COLORS } from '../lib/branding'

/** Accepted MIME types for image upload. */
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** Accepted file extensions for the input element. */
const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.webp'

/** Maximum file size in bytes (5 MB). */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

/** Preview canvas dimensions. */
const PREVIEW_MAX_WIDTH = 900
const PREVIEW_MAX_HEIGHT = 600

interface ImageUploaderProps {
  /** Called with the base64-encoded image data when a valid file is selected. */
  onImageReady: (base64Data: string) => void
}

/**
 * Validates the file format.
 * Returns an error message if invalid, or null if valid.
 */
export function validateFileFormat(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Please use a PNG, JPG, or WEBP image'
  }
  return null
}

/**
 * Validates the file size.
 * Returns an error message if invalid, or null if valid.
 */
export function validateFileSize(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'Your picture is too big! Please pick one smaller than 5 MB'
  }
  return null
}

export default function ImageUploader({ onImageReady }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const processFile = useCallback(
    (file: File) => {
      setError(null)

      // Validate format
      const formatError = validateFileFormat(file)
      if (formatError) {
        setError(formatError)
        setPreview(null)
        return
      }

      // Validate size
      const sizeError = validateFileSize(file)
      if (sizeError) {
        setError(sizeError)
        setPreview(null)
        return
      }

      // Read the file as base64
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64Data = e.target?.result as string
        setPreview(base64Data)
        onImageReady(base64Data)
      }
      reader.onerror = () => {
        setError('Something went wrong reading your picture. Please try again!')
        setPreview(null)
      }
      reader.readAsDataURL(file)
    },
    [onImageReady]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
    // Reset input so re-selecting the same file triggers change
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const handleRemove = () => {
    setPreview(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      {/* Drop zone / preview area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex items-center justify-center rounded-3xl border-2 border-dashed transition-colors overflow-hidden ${
          isDragOver
            ? 'border-orange-400 bg-orange-50'
            : 'border-gray-300 bg-white'
        }`}
        style={{ maxWidth: `${PREVIEW_MAX_WIDTH}px`, maxHeight: `${PREVIEW_MAX_HEIGHT}px` }}
      >
        {preview ? (
          /* Image preview scaled to fit canvas while preserving aspect ratio */
          <div className="relative w-full" style={{ maxWidth: `${PREVIEW_MAX_WIDTH}px`, maxHeight: `${PREVIEW_MAX_HEIGHT}px` }}>
            <img
              src={preview}
              alt="Uploaded image preview"
              className="block mx-auto"
              style={{
                maxWidth: `${PREVIEW_MAX_WIDTH}px`,
                maxHeight: `${PREVIEW_MAX_HEIGHT}px`,
                objectFit: 'contain',
              }}
            />
            {/* Remove button */}
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 flex items-center justify-center rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600 transition-colors"
              style={{ minWidth: '44px', minHeight: '44px', width: '44px', height: '44px' }}
              aria-label="Remove uploaded image"
            >
              <X size={24} />
            </button>
          </div>
        ) : (
          /* Empty state — upload prompt */
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <ImageIcon size={64} className="text-gray-300 mb-4" />
            <p className="text-lg font-semibold text-gray-600 mb-1">
              Drop your picture here
            </p>
            <p className="text-sm text-gray-400 mb-4">
              PNG, JPG, or WEBP — up to 5 MB
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: BRAND_COLORS.primary, minWidth: '44px', minHeight: '44px' }}
            >
              <Upload size={20} />
              Choose a Picture
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload an image"
      />

      {/* Error message */}
      {error && (
        <p
          className="text-center text-sm font-medium rounded-lg px-4 py-2"
          style={{ color: BRAND_COLORS.error, backgroundColor: '#FFF1F2' }}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
