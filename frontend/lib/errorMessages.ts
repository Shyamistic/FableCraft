/**
 * Error message formatting for user-facing errors.
 *
 * Maps backend error codes, HTTP status codes, and raw errors to
 * child-friendly messages suitable for ages 4-8. Messages are fun,
 * encouraging, and contain no technical jargon, status codes, or
 * stack traces.
 *
 * Validates: Requirements 16.5
 */

// ─── Error Codes (matching backend ErrorCode enum) ───────────────────────────

export type BackendErrorCode =
  | "CONTENT_BLOCKED"
  | "GENERATION_FAILED"
  | "VALIDATION_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "EMPTY_DRAWING"
  | "CUSTOM_LESSON_REJECTED"
  | "PIN_LOCKOUT"
  | "PIN_INCORRECT"
  | "ROOM_EXPIRED"
  | "TIMEOUT";

// ─── Formatted Error Result ──────────────────────────────────────────────────

export interface FormattedError {
  /** Child-friendly message to display to the user. */
  message: string;
  /** Whether a retry button should be shown. */
  showRetry: boolean;
}

// ─── Error Code → Friendly Message Map ───────────────────────────────────────

const ERROR_CODE_MESSAGES: Record<BackendErrorCode, FormattedError> = {
  CONTENT_BLOCKED: {
    message:
      "Let's try drawing something different! Your character needs to be friendly and fun.",
    showRetry: false,
  },
  GENERATION_FAILED: {
    message: "Oops! Our magic paintbrush needs another try. Let's do that again!",
    showRetry: true,
  },
  VALIDATION_ERROR: {
    message: "Hmm, something doesn't look quite right. Can you try again?",
    showRetry: true,
  },
  SERVICE_UNAVAILABLE: {
    message:
      "Our story machine is taking a little break. Try again in a moment!",
    showRetry: true,
  },
  FILE_TOO_LARGE: {
    message: "That picture is too big! Try a smaller one.",
    showRetry: false,
  },
  UNSUPPORTED_FORMAT: {
    message:
      "We need a PNG, JPG, or WEBP picture. Can you pick a different one?",
    showRetry: false,
  },
  EMPTY_DRAWING: {
    message:
      "Your drawing needs a bit more! Add some more colors and shapes.",
    showRetry: false,
  },
  CUSTOM_LESSON_REJECTED: {
    message:
      "Let's pick a different topic! How about one of these fun lessons?",
    showRetry: false,
  },
  PIN_LOCKOUT: {
    message: "Too many tries! Wait a minute and try again.",
    showRetry: false,
  },
  PIN_INCORRECT: {
    message: "That's not the right code. Try again!",
    showRetry: false,
  },
  ROOM_EXPIRED: {
    message:
      "The invite code expired. Create a new one to play with a friend!",
    showRetry: false,
  },
  TIMEOUT: {
    message:
      "Our story machine is taking a little break. Try again in a moment!",
    showRetry: true,
  },
};

// ─── HTTP Status → Friendly Message Map ──────────────────────────────────────

const HTTP_STATUS_MESSAGES: Record<number, FormattedError> = {
  400: {
    message: "Hmm, something doesn't look quite right. Can you try again?",
    showRetry: true,
  },
  401: {
    message: "That's not the right code. Try again!",
    showRetry: false,
  },
  403: {
    message: "Oops, you can't do that right now.",
    showRetry: false,
  },
  404: {
    message: "We couldn't find what you're looking for. Let's try something else!",
    showRetry: false,
  },
  408: {
    message:
      "That took too long! Let's try again.",
    showRetry: true,
  },
  413: {
    message: "That picture is too big! Try a smaller one.",
    showRetry: false,
  },
  422: {
    message:
      "Let's try drawing something different! Your character needs to be friendly and fun.",
    showRetry: false,
  },
  429: {
    message: "Whoa, slow down! Wait a moment before trying again.",
    showRetry: false,
  },
  500: {
    message:
      "Our story machine is taking a little break. Try again in a moment!",
    showRetry: true,
  },
  502: {
    message:
      "Our story machine is taking a little break. Try again in a moment!",
    showRetry: true,
  },
  503: {
    message:
      "Our story machine is taking a little break. Try again in a moment!",
    showRetry: true,
  },
  504: {
    message: "That took too long! Let's try again.",
    showRetry: true,
  },
};

// ─── Network Error Detection ─────────────────────────────────────────────────

const NETWORK_ERROR_KEYWORDS = [
  "network",
  "fetch",
  "failed to fetch",
  "networkerror",
  "aborterror",
  "typeerror",
  "econnrefused",
  "enotfound",
  "dns",
  "offline",
  "internet",
  "connection",
];

const TIMEOUT_ERROR_KEYWORDS = ["timeout", "timedout", "timed out", "aborted"];

// ─── Banned Pattern Detection (ensures no technical details leak) ─────────────

/**
 * Patterns that should NEVER appear in user-facing error messages.
 * Used for validation in tests and as a safety check.
 */
export const BANNED_ERROR_PATTERNS: RegExp[] = [
  /\d{3}/, // HTTP status codes (e.g., 500, 404)
  /stack\s*trace/i,
  /at\s+[\w.]+\s*\(/i, // Stack trace lines like "at Function.Module ("
  /Error:\s/i, // Raw Error: prefix
  /TypeError/i,
  /ReferenceError/i,
  /SyntaxError/i,
  /undefined/i,
  /null\b/i,
  /\bnull\b/,
  /exception/i,
  /traceback/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /ETIMEDOUT/i,
  /https?:\/\//i, // URLs
  /\bapi\b/i, // API references
  /\bjson\b/i, // JSON references
  /\bhttp\b/i, // HTTP references
  /\bsql\b/i, // SQL references
  /\baws\b/i, // AWS references
  /\bbedrock\b/i,
  /\bs3\b/i,
  /\blambda\b/i,
  /\bpolly\b/i,
  /\bprovider\b/i,
  /\bserver\b/i,
  /\bclient\b/i,
  /\bdatabase\b/i,
  /\bbackend\b/i,
  /\bfrontend\b/i,
  /\bresponse\b/i,
  /\brequest\b/i,
  /\bendpoint\b/i,
];

// ─── Default Fallback ────────────────────────────────────────────────────────

const DEFAULT_ERROR: FormattedError = {
  message: "Something went a little wonky! Let's try that again.",
  showRetry: true,
};

// ─── Main Formatting Function ────────────────────────────────────────────────

/**
 * Represents the input error that the formatter can handle.
 * This can be a backend API response, an HTTP error, or a raw Error object.
 */
export interface BackendError {
  /** Backend error code (e.g., "CONTENT_BLOCKED"). */
  code?: string;
  /** Raw message from the backend (may be child-friendly already). */
  message?: string;
  /** HTTP status code from the response. */
  status?: number;
}

/**
 * Formats any backend error into a child-friendly message.
 *
 * Takes a backend error (HTTP status, error code, or raw message) and returns
 * a child-friendly message string with retry information. Ensures no status
 * codes, stack traces, or technical jargon appear in the output.
 *
 * @param error - The error to format (BackendError object, Error instance, or unknown)
 * @returns A FormattedError with a child-friendly message and retry flag
 */
export function formatErrorMessage(error: unknown): FormattedError {
  // Handle null/undefined
  if (error == null) {
    return DEFAULT_ERROR;
  }

  // Handle BackendError-shaped objects (from API responses)
  if (isBackendError(error)) {
    // Try error code first (most specific)
    if (error.code && Object.prototype.hasOwnProperty.call(ERROR_CODE_MESSAGES, error.code)) {
      return ERROR_CODE_MESSAGES[error.code as BackendErrorCode];
    }

    // Try HTTP status code
    if (error.status && Object.prototype.hasOwnProperty.call(HTTP_STATUS_MESSAGES, error.status)) {
      return HTTP_STATUS_MESSAGES[error.status];
    }

    // Try to detect error type from the message
    if (error.message) {
      const detected = detectErrorFromMessage(error.message);
      if (detected) {
        return detected;
      }
    }

    return DEFAULT_ERROR;
  }

  // Handle native Error instances (network errors, timeouts, etc.)
  if (error instanceof Error) {
    const detected = detectErrorFromMessage(error.message);
    if (detected) {
      return detected;
    }

    // Check error name for common error types
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return ERROR_CODE_MESSAGES.TIMEOUT;
    }

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return {
        message:
          "We can't reach our story machine right now. Check your connection and try again!",
        showRetry: true,
      };
    }

    return DEFAULT_ERROR;
  }

  // Handle string errors
  if (typeof error === "string") {
    const detected = detectErrorFromMessage(error);
    if (detected) {
      return detected;
    }
    return DEFAULT_ERROR;
  }

  return DEFAULT_ERROR;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isBackendError(error: unknown): error is BackendError {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const obj = error as Record<string, unknown>;
  return (
    "code" in obj ||
    "status" in obj ||
    ("message" in obj && typeof obj.message === "string")
  );
}

function detectErrorFromMessage(message: string): FormattedError | null {
  const lower = message.toLowerCase();

  // Check for network errors
  if (NETWORK_ERROR_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      message:
        "We can't reach our story machine right now. Check your connection and try again!",
      showRetry: true,
    };
  }

  // Check for timeout errors
  if (TIMEOUT_ERROR_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return ERROR_CODE_MESSAGES.TIMEOUT;
  }

  return null;
}

/**
 * Validates that a message string contains no technical jargon or banned patterns.
 * Useful for testing that all error messages are child-friendly.
 *
 * @param message - The message to validate
 * @returns true if the message is safe for display to children
 */
export function isChildFriendlyMessage(message: string): boolean {
  return !BANNED_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
