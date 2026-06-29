/**
 * Property-based tests for session duration formatting in the Parent Dashboard.
 *
 * Tests that the formatDuration function correctly converts any non-negative
 * integer of minutes into the "Xh Ym" format with proper edge case handling.
 *
 * **Validates: Requirements 11.5**
 */

import * as fc from 'fast-check';
import { formatDuration } from '@/components/ParentDashboard';

// ─── Property 21: Session Duration Formatting ────────────────────────────────

describe('Property 21: Session Duration Formatting', () => {
  /**
   * **Validates: Requirements 11.5**
   *
   * For any non-negative integer of minutes, formatDuration outputs the correct
   * "Xh Ym" format where X=floor(minutes/60) and Y=minutes%60, with correct
   * edge cases:
   * - 0 minutes → "0m"
   * - Exact hours (minutes%60 === 0) → "Xh" (no minutes shown)
   * - 0 hours (minutes < 60) → "Ym" (no hours shown)
   * - General case → "Xh Ym"
   */
  it('formats any non-negative minutes into the correct "Xh Ym" pattern', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100000 }), // non-negative integers up to a large value
        (totalMinutes: number) => {
          const result = formatDuration(totalMinutes);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;

          if (totalMinutes === 0) {
            // Edge case: 0 minutes → "0m"
            expect(result).toBe('0m');
          } else if (hours === 0) {
            // No hours, only minutes → "Ym"
            expect(result).toBe(`${minutes}m`);
          } else if (minutes === 0) {
            // Exact hours, no remaining minutes → "Xh"
            expect(result).toBe(`${hours}h`);
          } else {
            // General case → "Xh Ym"
            expect(result).toBe(`${hours}h ${minutes}m`);
          }
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('always returns "0m" for zero minutes', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('returns only hours component when minutes are exactly divisible by 60', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // positive number of hours
        (hours: number) => {
          const totalMinutes = hours * 60;
          const result = formatDuration(totalMinutes);

          // Should be "Xh" with no minutes component
          expect(result).toBe(`${hours}h`);
          // Should not contain 'm'
          expect(result).not.toContain('m');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns only minutes component when total is less than 60', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 59 }), // 1-59 minutes (no hours)
        (totalMinutes: number) => {
          const result = formatDuration(totalMinutes);

          // Should be "Ym" with no hours component
          expect(result).toBe(`${totalMinutes}m`);
          // Should not contain 'h'
          expect(result).not.toContain('h');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('output is always parseable back to the original minutes value', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100000 }),
        (totalMinutes: number) => {
          const result = formatDuration(totalMinutes);

          // Parse the output back to minutes
          const hoursMatch = result.match(/(\d+)h/);
          const minutesMatch = result.match(/(\d+)m/);

          const parsedHours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
          const parsedMinutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;

          const reconstructed = parsedHours * 60 + parsedMinutes;
          expect(reconstructed).toBe(totalMinutes);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('treats negative values as 0 minutes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: -1 }), // negative minutes
        (totalMinutes: number) => {
          const result = formatDuration(totalMinutes);
          expect(result).toBe('0m');
        }
      ),
      { numRuns: 200 }
    );
  });
});
