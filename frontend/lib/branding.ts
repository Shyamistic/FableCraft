/**
 * Branding constants for the application.
 * All brand-related values (name, colors, typeface, logo) are centralized here
 * so that every screen uses a consistent identity.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4
 */

// ─── Brand Name ──────────────────────────────────────────────────────────────

/** The product name used across all user-facing text, metadata, and deployment. */
export const BRAND_NAME = "Fablecraft";

/** A short tagline for marketing and meta descriptions. */
export const BRAND_TAGLINE =
  "Turn your drawings into magical story adventures!";

// ─── Color Palette (6 colors) ────────────────────────────────────────────────

/**
 * The brand color palette. No screen should use a color outside this set
 * (besides standard white/black for text and backgrounds).
 */
export const BRAND_COLORS = {
  /** Warm orange — primary action color (buttons, highlights) */
  primary: "#F97316",
  /** Sunny gold — secondary accent (progress, coins, badges) */
  secondary: "#FBBF24",
  /** Soft purple — tertiary accent (quest book, headers) */
  tertiary: "#8B5CF6",
  /** Sky blue — informational, links, TTS controls */
  info: "#38BDF8",
  /** Fresh green — success states, correct answers */
  success: "#34D399",
  /** Warm rose — error states, incorrect feedback */
  error: "#FB7185",
} as const;

/** Convenience array for iteration. */
export const BRAND_COLOR_VALUES = Object.values(BRAND_COLORS);

// ─── Typography ──────────────────────────────────────────────────────────────

/** Primary typeface used across the entire application. */
export const BRAND_TYPEFACE = "Pally";

/** Font import URL (loaded in layout.tsx <head>). */
export const BRAND_FONT_URL =
  "https://api.fontshare.com/v2/css?f[]=pally@500&display=swap";

// ─── Logo ────────────────────────────────────────────────────────────────────

/** Path to the logo placeholder image served from /public. */
export const BRAND_LOGO_PATH = "/logo-placeholder.svg";

/** Alt text for the logo image. */
export const BRAND_LOGO_ALT = `${BRAND_NAME} logo`;
