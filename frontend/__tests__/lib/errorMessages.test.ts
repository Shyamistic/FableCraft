/**
 * Unit tests for the error message formatting module.
 *
 * Tests cover:
 * - Backend error code mapping to child-friendly messages
 * - HTTP status code mapping
 * - Network error detection
 * - Timeout error detection
 * - No technical jargon in any output
 * - Retry button presence for retryable errors
 * - Graceful handling of unknown/null/malformed errors
 *
 * Validates: Requirements 16.5
 */

import {
  formatErrorMessage,
  isChildFriendlyMessage,
  BANNED_ERROR_PATTERNS,
  type BackendError,
  type BackendErrorCode,
  type FormattedError,
} from "@/lib/errorMessages";

// ─── Tests: Backend Error Code Mapping ───────────────────────────────────────

describe("formatErrorMessage - backend error codes", () => {
  const errorCodesWithRetry: BackendErrorCode[] = [
    "GENERATION_FAILED",
    "VALIDATION_ERROR",
    "SERVICE_UNAVAILABLE",
    "TIMEOUT",
  ];

  const errorCodesWithoutRetry: BackendErrorCode[] = [
    "CONTENT_BLOCKED",
    "FILE_TOO_LARGE",
    "UNSUPPORTED_FORMAT",
    "EMPTY_DRAWING",
    "CUSTOM_LESSON_REJECTED",
    "PIN_LOCKOUT",
    "PIN_INCORRECT",
    "ROOM_EXPIRED",
  ];

  it.each(errorCodesWithRetry)(
    "shows retry for error code %s",
    (code) => {
      const result = formatErrorMessage({ code });
      expect(result.showRetry).toBe(true);
      expect(result.message.length).toBeGreaterThan(0);
    }
  );

  it.each(errorCodesWithoutRetry)(
    "does not show retry for error code %s",
    (code) => {
      const result = formatErrorMessage({ code });
      expect(result.showRetry).toBe(false);
      expect(result.message.length).toBeGreaterThan(0);
    }
  );

  it("returns child-friendly message for CONTENT_BLOCKED", () => {
    const result = formatErrorMessage({ code: "CONTENT_BLOCKED" });
    expect(result.message).toContain("friendly");
    expect(result.message).toContain("fun");
  });

  it("returns child-friendly message for FILE_TOO_LARGE", () => {
    const result = formatErrorMessage({ code: "FILE_TOO_LARGE" });
    expect(result.message.toLowerCase()).toContain("big");
  });

  it("returns child-friendly message for UNSUPPORTED_FORMAT", () => {
    const result = formatErrorMessage({ code: "UNSUPPORTED_FORMAT" });
    expect(result.message).toContain("PNG");
  });

  it("returns child-friendly message for EMPTY_DRAWING", () => {
    const result = formatErrorMessage({ code: "EMPTY_DRAWING" });
    expect(result.message.toLowerCase()).toContain("more");
  });

  it("returns child-friendly message for PIN_LOCKOUT", () => {
    const result = formatErrorMessage({ code: "PIN_LOCKOUT" });
    expect(result.message.toLowerCase()).toContain("wait");
  });

  it("returns child-friendly message for ROOM_EXPIRED", () => {
    const result = formatErrorMessage({ code: "ROOM_EXPIRED" });
    expect(result.message.toLowerCase()).toContain("expired");
  });
});

// ─── Tests: HTTP Status Code Mapping ─────────────────────────────────────────

describe("formatErrorMessage - HTTP status codes", () => {
  const retryableStatuses = [400, 408, 500, 502, 503, 504];
  const nonRetryableStatuses = [401, 403, 404, 413, 422, 429];

  it.each(retryableStatuses)(
    "shows retry for HTTP status %d",
    (status) => {
      const result = formatErrorMessage({ status });
      expect(result.showRetry).toBe(true);
    }
  );

  it.each(nonRetryableStatuses)(
    "does not show retry for HTTP status %d",
    (status) => {
      const result = formatErrorMessage({ status });
      expect(result.showRetry).toBe(false);
    }
  );

  it("returns a message for 500 server errors", () => {
    const result = formatErrorMessage({ status: 500 });
    expect(result.message.toLowerCase()).toContain("try again");
  });

  it("returns a message for 429 rate limiting", () => {
    const result = formatErrorMessage({ status: 429 });
    expect(result.message.toLowerCase()).toContain("wait");
  });
});

// ─── Tests: Network Errors ───────────────────────────────────────────────────

describe("formatErrorMessage - network errors", () => {
  it("handles fetch TypeError (network failure)", () => {
    const error = new TypeError("Failed to fetch");
    const result = formatErrorMessage(error);
    expect(result.showRetry).toBe(true);
    expect(result.message.toLowerCase()).toContain("connection");
  });

  it("handles network error message in BackendError", () => {
    const result = formatErrorMessage({ message: "NetworkError when attempting to fetch resource" });
    expect(result.showRetry).toBe(true);
  });

  it("handles offline error messages", () => {
    const result = formatErrorMessage({ message: "The Internet connection appears to be offline" });
    expect(result.showRetry).toBe(true);
  });
});

// ─── Tests: Timeout Errors ───────────────────────────────────────────────────

describe("formatErrorMessage - timeout errors", () => {
  it("handles AbortError (timeout)", () => {
    const error = new DOMException("The operation was aborted", "AbortError");
    const result = formatErrorMessage(error);
    expect(result.showRetry).toBe(true);
  });

  it("handles timeout message in BackendError", () => {
    const result = formatErrorMessage({ message: "Request timed out" });
    expect(result.showRetry).toBe(true);
  });

  it("handles timeout error code", () => {
    const result = formatErrorMessage({ code: "TIMEOUT" });
    expect(result.showRetry).toBe(true);
    expect(result.message.toLowerCase()).toContain("try again");
  });
});

// ─── Tests: Error Code Precedence ────────────────────────────────────────────

describe("formatErrorMessage - precedence", () => {
  it("prefers error code over HTTP status", () => {
    const result = formatErrorMessage({
      code: "CONTENT_BLOCKED",
      status: 500,
    });
    expect(result.message).toContain("friendly");
    expect(result.showRetry).toBe(false);
  });

  it("falls back to HTTP status when error code is unknown", () => {
    const result = formatErrorMessage({
      code: "UNKNOWN_CODE",
      status: 500,
    });
    expect(result.showRetry).toBe(true);
  });
});

// ─── Tests: Unknown/Null/Malformed Errors ────────────────────────────────────

describe("formatErrorMessage - fallback handling", () => {
  it("returns default error for null", () => {
    const result = formatErrorMessage(null);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.showRetry).toBe(true);
  });

  it("returns default error for undefined", () => {
    const result = formatErrorMessage(undefined);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.showRetry).toBe(true);
  });

  it("returns default error for empty object", () => {
    const result = formatErrorMessage({});
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.showRetry).toBe(true);
  });

  it("returns default error for a number", () => {
    const result = formatErrorMessage(42);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.showRetry).toBe(true);
  });

  it("returns default error for a random string", () => {
    const result = formatErrorMessage("something broke");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("handles string with network keyword", () => {
    const result = formatErrorMessage("network connection lost");
    expect(result.showRetry).toBe(true);
  });
});

// ─── Tests: No Technical Jargon (Requirement 16.5) ──────────────────────────

describe("formatErrorMessage - no technical jargon", () => {
  const allErrorCodes: BackendErrorCode[] = [
    "CONTENT_BLOCKED",
    "GENERATION_FAILED",
    "VALIDATION_ERROR",
    "SERVICE_UNAVAILABLE",
    "FILE_TOO_LARGE",
    "UNSUPPORTED_FORMAT",
    "EMPTY_DRAWING",
    "CUSTOM_LESSON_REJECTED",
    "PIN_LOCKOUT",
    "PIN_INCORRECT",
    "ROOM_EXPIRED",
    "TIMEOUT",
  ];

  it.each(allErrorCodes)(
    "message for error code %s contains no banned patterns",
    (code) => {
      const result = formatErrorMessage({ code });
      expect(isChildFriendlyMessage(result.message)).toBe(true);
    }
  );

  it("messages for HTTP statuses contain no banned patterns", () => {
    const statuses = [400, 401, 403, 404, 408, 413, 422, 429, 500, 502, 503, 504];
    for (const status of statuses) {
      const result = formatErrorMessage({ status });
      expect(isChildFriendlyMessage(result.message)).toBe(true);
    }
  });

  it("default fallback message contains no banned patterns", () => {
    const result = formatErrorMessage({});
    expect(isChildFriendlyMessage(result.message)).toBe(true);
  });

  it("network error message contains no banned patterns", () => {
    const result = formatErrorMessage(new TypeError("Failed to fetch"));
    expect(isChildFriendlyMessage(result.message)).toBe(true);
  });

  it("timeout error message contains no banned patterns", () => {
    const result = formatErrorMessage(new DOMException("Aborted", "AbortError"));
    expect(isChildFriendlyMessage(result.message)).toBe(true);
  });
});

// ─── Tests: isChildFriendlyMessage ───────────────────────────────────────────

describe("isChildFriendlyMessage", () => {
  it("returns true for a simple friendly message", () => {
    expect(isChildFriendlyMessage("Let's try again!")).toBe(true);
  });

  it("returns false for messages with HTTP status codes", () => {
    expect(isChildFriendlyMessage("Error 500: Internal Server Error")).toBe(false);
  });

  it("returns false for messages with stack traces", () => {
    expect(isChildFriendlyMessage("at Function.Module._resolveFilename (node:internal)")).toBe(false);
  });

  it("returns false for messages with raw error prefixes", () => {
    expect(isChildFriendlyMessage("Error: ECONNREFUSED")).toBe(false);
  });

  it("returns false for messages mentioning API", () => {
    expect(isChildFriendlyMessage("The API returned an error")).toBe(false);
  });

  it("returns false for messages mentioning server", () => {
    expect(isChildFriendlyMessage("Server returned 404")).toBe(false);
  });

  it("returns false for messages with URLs", () => {
    expect(isChildFriendlyMessage("Failed to connect to https://api.example.com")).toBe(false);
  });
});
