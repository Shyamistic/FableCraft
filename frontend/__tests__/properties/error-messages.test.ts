/**
 * Property-based tests for user-facing error messages.
 *
 * For any error returned by the backend (HTTP status, error code, or network failure),
 * the formatted error message SHALL contain no status codes (3-digit numbers), no stack
 * traces, no technical jargon (API, JSON, HTTP, AWS, Bedrock, S3, Lambda, Polly, provider,
 * server, client, database, backend, frontend, response, request, endpoint), and SHALL be
 * understandable by a child aged 4-8.
 *
 * **Validates: Requirements 16.5**
 */

import * as fc from 'fast-check';
import {
  formatErrorMessage,
  isChildFriendlyMessage,
  BANNED_ERROR_PATTERNS,
  BackendErrorCode,
} from '@/lib/errorMessages';

// ─── Generators ──────────────────────────────────────────────────────────────

/** All known backend error codes */
const backendErrorCodes: BackendErrorCode[] = [
  'CONTENT_BLOCKED',
  'GENERATION_FAILED',
  'VALIDATION_ERROR',
  'SERVICE_UNAVAILABLE',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FORMAT',
  'EMPTY_DRAWING',
  'CUSTOM_LESSON_REJECTED',
  'PIN_LOCKOUT',
  'PIN_INCORRECT',
  'ROOM_EXPIRED',
  'TIMEOUT',
];

/** Generator for backend error codes */
const arbBackendErrorCode = fc.constantFrom(...backendErrorCodes);

/** Generator for common HTTP error status codes */
const arbHttpStatus = fc.constantFrom(
  400, 401, 403, 404, 408, 413, 422, 429, 500, 502, 503, 504
);

/** Generator for arbitrary HTTP status codes (3xx, 4xx, 5xx) */
const arbAnyHttpStatus = fc.integer({ min: 300, max: 599 });

/** Generator for network failure error messages */
const arbNetworkErrorMessage = fc.constantFrom(
  'Failed to fetch',
  'NetworkError when attempting to fetch resource',
  'Network request failed',
  'TypeError: Failed to fetch',
  'ECONNREFUSED 127.0.0.1:3000',
  'ENOTFOUND api.example.com',
  'ERR_INTERNET_DISCONNECTED',
  'The Internet connection appears to be offline',
  'net::ERR_CONNECTION_REFUSED',
  'DNS lookup failed',
);

/** Generator for timeout error messages */
const arbTimeoutErrorMessage = fc.constantFrom(
  'timeout of 15000ms exceeded',
  'Request timed out',
  'AbortError: The operation was aborted',
  'ETIMEDOUT',
  'The request timed out',
);

/** Generator for technical error messages that should never leak */
const arbTechnicalMessage = fc.constantFrom(
  'Error: Cannot read property "data" of undefined',
  'TypeError: response.json is not a function',
  'SyntaxError: Unexpected token < in JSON at position 0',
  'ReferenceError: AWS is not defined',
  'Error: connect ECONNREFUSED 127.0.0.1:8000',
  'Internal Server Error at /api/characters/generate',
  'HTTP 500: Bedrock model invocation failed',
  'AxiosError: Request failed with status code 503',
  'Error: S3 bucket access denied',
  'Lambda function timeout after 30000ms',
  'Polly returned error: ThrottlingException',
  'Database connection pool exhausted',
  'Backend service returned null response',
  'Frontend rendering error in component CharacterStudio',
);

/** Generator for BackendError-shaped objects with code */
const arbBackendErrorWithCode = arbBackendErrorCode.map((code) => ({
  code,
  message: `Something failed for ${code}`,
  status: undefined,
}));

/** Generator for BackendError-shaped objects with HTTP status */
const arbBackendErrorWithStatus = arbAnyHttpStatus.map((status) => ({
  code: undefined,
  message: `Request failed with status ${status}`,
  status,
}));

/** Generator for native Error instances with technical messages */
const arbNativeError = arbTechnicalMessage.map((msg) => new Error(msg));

/** Generator for native Error instances that look like network errors */
const arbNetworkNativeError = arbNetworkErrorMessage.map((msg) => {
  const err = new TypeError(msg);
  err.name = 'TypeError';
  return err;
});

/** Generator for native Error instances that look like timeouts */
const arbTimeoutNativeError = arbTimeoutErrorMessage.map((msg) => {
  const err = new Error(msg);
  err.name = 'AbortError';
  return err;
});

// ─── Property 30: User-Facing Error Messages ─────────────────────────────────

describe('Property 30: User-Facing Error Messages', () => {
  /**
   * **Validates: Requirements 16.5**
   *
   * For any backend error code, the formatted message contains no banned patterns.
   */
  it('error code inputs produce messages with no status codes, stack traces, or technical jargon', () => {
    fc.assert(
      fc.property(arbBackendErrorWithCode, (error) => {
        const result = formatErrorMessage(error);

        // Message must not contain any banned pattern
        for (const pattern of BANNED_ERROR_PATTERNS) {
          expect(pattern.test(result.message)).toBe(false);
        }

        // isChildFriendlyMessage should agree
        expect(isChildFriendlyMessage(result.message)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  /**
   * **Validates: Requirements 16.5**
   *
   * For any HTTP status code error, the formatted message contains no banned patterns.
   */
  it('HTTP status code inputs produce messages with no status codes, stack traces, or technical jargon', () => {
    fc.assert(
      fc.property(arbBackendErrorWithStatus, (error) => {
        const result = formatErrorMessage(error);

        // Message must not contain any banned pattern
        for (const pattern of BANNED_ERROR_PATTERNS) {
          expect(pattern.test(result.message)).toBe(false);
        }

        expect(isChildFriendlyMessage(result.message)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  /**
   * **Validates: Requirements 16.5**
   *
   * For any native Error with a technical message, the formatted output never
   * leaks the raw message to the user.
   */
  it('native Error instances with technical messages produce child-friendly output', () => {
    fc.assert(
      fc.property(arbNativeError, (error) => {
        const result = formatErrorMessage(error);

        for (const pattern of BANNED_ERROR_PATTERNS) {
          expect(pattern.test(result.message)).toBe(false);
        }

        expect(isChildFriendlyMessage(result.message)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  /**
   * **Validates: Requirements 16.5**
   *
   * For any network failure error, the formatted message is child-friendly.
   */
  it('network failure errors produce child-friendly messages', () => {
    fc.assert(
      fc.property(arbNetworkNativeError, (error) => {
        const result = formatErrorMessage(error);

        for (const pattern of BANNED_ERROR_PATTERNS) {
          expect(pattern.test(result.message)).toBe(false);
        }

        expect(isChildFriendlyMessage(result.message)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 16.5**
   *
   * For any timeout error, the formatted message is child-friendly.
   */
  it('timeout errors produce child-friendly messages', () => {
    fc.assert(
      fc.property(arbTimeoutNativeError, (error) => {
        const result = formatErrorMessage(error);

        for (const pattern of BANNED_ERROR_PATTERNS) {
          expect(pattern.test(result.message)).toBe(false);
        }

        expect(isChildFriendlyMessage(result.message)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 16.5**
   *
   * For any error input (null, undefined, string, random object), the formatter
   * always returns a message that is child-friendly.
   */
  it('arbitrary inputs (null, undefined, strings, objects) always produce child-friendly messages', () => {
    const arbArbitraryError = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.string(), // arbitrary strings
      arbTechnicalMessage, // technical error strings
      fc.record({
        code: fc.option(fc.string(), { nil: undefined }),
        status: fc.option(fc.integer({ min: 100, max: 599 }), { nil: undefined }),
        message: fc.option(fc.string(), { nil: undefined }),
      })
    );

    fc.assert(
      fc.property(arbArbitraryError, (error) => {
        const result = formatErrorMessage(error);

        // Must always return an object with a message string
        expect(typeof result.message).toBe('string');
        expect(result.message.length).toBeGreaterThan(0);

        // Must always be child-friendly
        for (const pattern of BANNED_ERROR_PATTERNS) {
          expect(pattern.test(result.message)).toBe(false);
        }

        expect(isChildFriendlyMessage(result.message)).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * **Validates: Requirements 16.5**
   *
   * The formatted message always returns a non-empty string and a boolean showRetry flag.
   */
  it('always returns a well-formed FormattedError with message and showRetry', () => {
    const arbAnyError = fc.oneof(
      arbBackendErrorWithCode,
      arbBackendErrorWithStatus,
      arbNativeError,
      arbNetworkNativeError,
      arbTimeoutNativeError,
      fc.constant(null),
      fc.constant(undefined)
    );

    fc.assert(
      fc.property(arbAnyError, (error) => {
        const result = formatErrorMessage(error);

        expect(result).toBeDefined();
        expect(typeof result.message).toBe('string');
        expect(result.message.length).toBeGreaterThan(0);
        expect(typeof result.showRetry).toBe('boolean');
      }),
      { numRuns: 500 }
    );
  });
});
