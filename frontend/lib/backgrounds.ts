/**
 * Background image configuration for each screen/genre.
 * Maps app views and quest genres to their corresponding background images.
 */

import type { Genre } from './types'

export type ScreenType = 'home' | 'quest' | 'gallery' | 'drawing' | 'celebration'

/**
 * Background image paths mapped to screen types and genres.
 * Images are served from /public/backgrounds/ as generated PNGs.
 */
const BACKGROUND_IMAGES: Record<string, string> = {
  home: '/backgrounds/prompt1.png',
  fantasy_kingdom: '/backgrounds/prompt2.png',
  outer_space: '/backgrounds/prompt3.png',
  underwater_world: '/backgrounds/prompt4.png',
  jungle_safari: '/backgrounds/prompt5.png',
  gallery: '/backgrounds/prompt6.png',
  drawing: '/backgrounds/prompt7.png',
  celebration: '/backgrounds/prompt8.png',
}

/**
 * CSS gradient fallbacks when background images fail to load.
 */
const FALLBACK_GRADIENTS: Record<string, string> = {
  home: 'linear-gradient(160deg, #FFF9F0 0%, #FFF3E8 30%, #F8F0FF 60%, #FFF9F0 100%)',
  fantasy_kingdom: 'linear-gradient(160deg, #F8F0FF 0%, #FFE4F0 50%, #FFF5D6 100%)',
  outer_space: 'linear-gradient(160deg, #1a1040 0%, #2D1B4E 50%, #E8D5FF 100%)',
  underwater_world: 'linear-gradient(160deg, #D5F5FF 0%, #E0FFF5 50%, #D5F0FF 100%)',
  jungle_safari: 'linear-gradient(160deg, #E8F5E0 0%, #FFF8D6 50%, #D5F0E8 100%)',
  gallery: 'linear-gradient(160deg, #FFF9F0 0%, #F0E8FF 50%, #FFF9F0 100%)',
  drawing: 'linear-gradient(160deg, #FFFFFF 0%, #FFF9F0 50%, #FFFFFF 100%)',
  celebration: 'linear-gradient(160deg, #FFF5D6 0%, #FFE4F0 50%, #E8D5FF 100%)',
}

/**
 * Gets the background image URL for a given screen or genre.
 */
export function getBackgroundImage(screen: ScreenType, genre?: Genre | null): string {
  if (screen === 'quest' && genre) {
    return BACKGROUND_IMAGES[genre] || BACKGROUND_IMAGES.home
  }
  return BACKGROUND_IMAGES[screen] || BACKGROUND_IMAGES.home
}

/**
 * Gets the CSS fallback gradient for a given screen or genre.
 */
export function getFallbackGradient(screen: ScreenType, genre?: Genre | null): string {
  if (screen === 'quest' && genre) {
    return FALLBACK_GRADIENTS[genre] || FALLBACK_GRADIENTS.home
  }
  return FALLBACK_GRADIENTS[screen] || FALLBACK_GRADIENTS.home
}

/**
 * Returns CSS style object for background with image + fallback gradient.
 */
export function getBackgroundStyle(screen: ScreenType, genre?: Genre | null): React.CSSProperties {
  const imageUrl = getBackgroundImage(screen, genre)
  const fallback = getFallbackGradient(screen, genre)

  return {
    backgroundImage: `url('${imageUrl}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
    backgroundRepeat: 'no-repeat',
    backgroundColor: '#FFF9F0', // base fallback color
  }
}
