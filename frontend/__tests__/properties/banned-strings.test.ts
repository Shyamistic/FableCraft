/**
 * Property-based tests for banned strings in source/build output files.
 *
 * Verifies that NO banned strings appear in any source files that contribute
 * to the build output (TypeScript, TSX, JSON, CSS). This ensures the rebranding
 * is complete and no references to the old product name or prior infrastructure
 * remain in user-facing code.
 *
 * **Validates: Requirements 17.1, 17.3, 17.4**
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..');

/** Banned strings that must not appear in any source/build output file. */
const BANNED_STRINGS = [
  'Storytopia',
  'Google Cloud',
  'Gemini',
  'Google ADK',
  'Vertex AI',
  'Cloud Run Hackathon',
];

/** File extensions to scan for banned strings. */
const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.json', '.css']);

/** Directories to exclude from scanning. */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  '.swc',
  'coverage',
  '__tests__',
]);

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Recursively collects all scannable source files from the frontend directory.
 */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SCANNABLE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Checks a file's content for a banned string (case-insensitive).
 * Returns an array of match locations if found.
 */
function findBannedStringInFile(
  filePath: string,
  bannedString: string
): { line: number; context: string }[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches: { line: number; context: string }[] = [];
  const bannedLower = bannedString.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(bannedLower)) {
      matches.push({
        line: i + 1,
        context: lines[i].trim().slice(0, 120),
      });
    }
  }

  return matches;
}

// ─── Collect files once for all tests ────────────────────────────────────────

const sourceFiles = collectSourceFiles(FRONTEND_ROOT);

// ─── Property 29: No Banned Strings in Build Output ──────────────────────────

describe('Property 29: No Banned Strings in Build Output', () => {
  /**
   * **Validates: Requirements 17.1, 17.3, 17.4**
   *
   * For any combination of source file and banned string, scanning the file's
   * content (case-insensitive) SHALL yield zero occurrences of that banned string.
   */
  it('no banned string appears in any source file (property-based)', () => {
    // Ensure we have source files to scan
    expect(sourceFiles.length).toBeGreaterThan(0);

    // Create arbitraries for file index and banned string index
    const fileIndexArb = fc.integer({ min: 0, max: sourceFiles.length - 1 });
    const bannedIndexArb = fc.integer({ min: 0, max: BANNED_STRINGS.length - 1 });

    fc.assert(
      fc.property(fileIndexArb, bannedIndexArb, (fileIdx, bannedIdx) => {
        const filePath = sourceFiles[fileIdx];
        const bannedString = BANNED_STRINGS[bannedIdx];

        const matches = findBannedStringInFile(filePath, bannedString);
        const relativePath = path.relative(FRONTEND_ROOT, filePath);

        if (matches.length > 0) {
          const details = matches
            .map((m) => `  Line ${m.line}: ${m.context}`)
            .join('\n');
          throw new Error(
            `Found banned string "${bannedString}" in ${relativePath}:\n${details}`
          );
        }
      }),
      { numRuns: Math.min(sourceFiles.length * BANNED_STRINGS.length, 1000) }
    );
  });

  /**
   * Exhaustive check: every source file is free of every banned string.
   * This complements the property test by ensuring full coverage.
   */
  it('exhaustive scan finds zero banned strings across all source files', () => {
    const violations: {
      file: string;
      bannedString: string;
      line: number;
      context: string;
    }[] = [];

    for (const filePath of sourceFiles) {
      for (const banned of BANNED_STRINGS) {
        const matches = findBannedStringInFile(filePath, banned);
        for (const match of matches) {
          violations.push({
            file: path.relative(FRONTEND_ROOT, filePath),
            bannedString: banned,
            line: match.line,
            context: match.context,
          });
        }
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .slice(0, 10) // Show first 10 violations
        .map(
          (v) =>
            `"${v.bannedString}" in ${v.file}:${v.line} → ${v.context}`
        )
        .join('\n');
      fail(
        `Found ${violations.length} banned string occurrence(s):\n${summary}`
      );
    }
  });

  /**
   * Property: the package.json name field does not contain any banned string.
   */
  it('package.json name field contains no banned strings', () => {
    const pkgPath = path.join(FRONTEND_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: BANNED_STRINGS.length - 1 }),
        (bannedIdx) => {
          const banned = BANNED_STRINGS[bannedIdx];
          const nameField = (pkg.name || '').toLowerCase();
          expect(nameField).not.toContain(banned.toLowerCase());
        }
      ),
      { numRuns: BANNED_STRINGS.length }
    );
  });

  /**
   * Property: for any randomly selected subset of source files, none contain
   * any banned string. This tests with shuffled sampling to catch issues
   * a sequential scan might mask through test ordering.
   */
  it('random file sampling finds no banned strings', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(sourceFiles, { minLength: 1, maxLength: Math.min(sourceFiles.length, 50) }),
        fc.integer({ min: 0, max: BANNED_STRINGS.length - 1 }),
        (fileSample, bannedIdx) => {
          const bannedString = BANNED_STRINGS[bannedIdx];

          for (const filePath of fileSample) {
            const matches = findBannedStringInFile(filePath, bannedString);
            if (matches.length > 0) {
              const relativePath = path.relative(FRONTEND_ROOT, filePath);
              throw new Error(
                `Found "${bannedString}" in ${relativePath} at line ${matches[0].line}`
              );
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
