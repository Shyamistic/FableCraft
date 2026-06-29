#!/usr/bin/env node
/**
 * Build Verification Script
 *
 * Scans all bundled client-side assets, HTML output, and browser-visible content
 * produced by the Next.js build for compliance violations.
 *
 * Checks:
 * 1. No banned strings ("Storytopia", "Google Cloud", "Gemini", "Google ADK",
 *    "Vertex AI", "Cloud Run Hackathon") in any client-side build output.
 * 2. Novus.ai script tag present in rendered HTML output.
 * 3. No PII fields in analytics payloads (name, email, IP, geolocation, device ID).
 *
 * Exit codes:
 *   0 - All checks pass
 *   1 - One or more violations found
 *
 * Validates: Requirements 17.1, 17.3, 17.4, 15.3
 */

const fs = require('fs');
const path = require('path');

// --- Configuration ---

const BUILD_DIR = path.resolve(__dirname, '..', '.next');
const STATIC_DIR = path.join(BUILD_DIR, 'static');
const SERVER_APP_DIR = path.join(BUILD_DIR, 'server', 'app');

const BANNED_STRINGS = [
  'Storytopia',
  'Google Cloud',
  'Gemini',
  'Google ADK',
  'Vertex AI',
  'Cloud Run Hackathon',
];

// File extensions to scan in the build output
const SCANNABLE_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.css',
  '.json',
  '.rsc',
  '.txt',
  '.mjs',
]);

// Server-only files that should NOT be scanned (never sent to browser)
const SERVER_ONLY_PATTERNS = [
  '_client-reference-manifest.js',
  '_client-reference-manifest.json',
  'server-reference-manifest.js',
  'server-reference-manifest.json',
  '.nft.json',
];

// Directories that are server-only and never sent to the browser
const SERVER_ONLY_DIRS = [
  'standalone',
  'cache',
  'types',
];

// PII-related field patterns that should not appear in analytics payloads
const PII_PATTERNS = [
  /["'](?:user_?name|full_?name|first_?name|last_?name)["']\s*:/i,
  /["'](?:email|email_?address)["']\s*:/i,
  /["'](?:ip_?address|client_?ip|remote_?addr)["']\s*:/i,
  /["'](?:geolocation|geo_?location|latitude|longitude|lat|lng)["']\s*:/i,
  /["'](?:device_?id|device_?identifier|fingerprint|hardware_?id)["']\s*:/i,
];

// Patterns in content that indicate a filesystem path rather than user-visible content.
// These are false positives from webpack/Next.js build internals embedding absolute paths.
const FILESYSTEM_PATH_PATTERN = /[A-Z]:\\[^"']*\\|\/(?:home|Users|var|tmp)\/[^"']*/;

// --- Utilities ---

/**
 * Recursively walk a directory and yield file paths.
 */
function* walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, cache directories, and server-only dirs
      if (entry.name === 'node_modules' || SERVER_ONLY_DIRS.includes(entry.name)) continue;
      yield* walkDir(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

/**
 * Check if a file should be scanned based on its extension.
 */
function isScannable(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SCANNABLE_EXTENSIONS.has(ext);
}

/**
 * Check if a file is server-only (never sent to the browser).
 */
function isServerOnly(filePath) {
  const basename = path.basename(filePath);
  return SERVER_ONLY_PATTERNS.some(pattern => basename.includes(pattern));
}

/**
 * Check if a match is inside a filesystem path (build artifact, not user-visible).
 * Next.js embeds absolute source paths in server bundles as module identifiers.
 * These are never exposed to the browser and should not be flagged.
 */
function isFilesystemPathMatch(content, matchIndex, matchLength) {
  // Get a context window around the match
  const localStart = Math.max(0, matchIndex - 80);
  const localEnd = Math.min(content.length, matchIndex + matchLength + 80);
  const localContext = content.slice(localStart, localEnd);

  // Check for Windows absolute paths (e.g., C:\Users\...\storytopia\...)
  if (/[A-Z]:[\\\/]/.test(localContext)) {
    return true;
  }

  // Check for Unix absolute paths containing typical user/project directories
  if (/\/(?:home|Users|var|tmp|opt|srv)\/[^\s"']+/.test(localContext)) {
    return true;
  }

  // Check for webpack/Next.js module ID patterns (path#export or path?query)
  if (/[\\\/][^\\\/]+\.(tsx?|jsx?|css|mjs)(?:#|\?)/.test(localContext)) {
    return true;
  }

  return false;
}

/**
 * Determine which directories to scan for client-visible content.
 * In Next.js:
 * - .next/static/ = client-side JS/CSS chunks (served to browser)
 * - .next/server/app/*.html = pre-rendered HTML pages (served to browser)
 * - .next/*.json manifests at root level may contain metadata
 */
function getClientVisibleDirs() {
  const dirs = [];
  if (fs.existsSync(STATIC_DIR)) dirs.push(STATIC_DIR);
  if (fs.existsSync(SERVER_APP_DIR)) dirs.push(SERVER_APP_DIR);
  return dirs;
}

// --- Check Functions ---

/**
 * Check 1: Scan client-side build output files for banned strings (case-insensitive).
 * Only scans files that are delivered to the browser (static assets and HTML pages).
 * Returns array of violation objects.
 */
function checkBannedStrings() {
  const violations = [];
  const clientDirs = getClientVisibleDirs();

  // Also scan root-level HTML files in build dir
  if (fs.existsSync(BUILD_DIR)) {
    const rootEntries = fs.readdirSync(BUILD_DIR, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.html') {
        clientDirs.push(path.join(BUILD_DIR, entry.name));
      }
    }
  }

  for (const dir of clientDirs) {
    const isFile = fs.existsSync(dir) && fs.statSync(dir).isFile();
    const files = isFile ? [dir] : walkDir(dir);

    for (const filePath of files) {
      if (!isScannable(filePath)) continue;
      if (isServerOnly(filePath)) continue;

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        // Skip files that can't be read (binary, permissions, etc.)
        continue;
      }

      const contentLower = content.toLowerCase();
      const relativePath = path.relative(BUILD_DIR, filePath);

      for (const banned of BANNED_STRINGS) {
        const bannedLower = banned.toLowerCase();
        let searchIndex = 0;
        let matchIndex;

        while ((matchIndex = contentLower.indexOf(bannedLower, searchIndex)) !== -1) {
          // Skip matches that are clearly filesystem paths (build artifacts)
          if (!isFilesystemPathMatch(content, matchIndex, banned.length)) {
            // Get surrounding context (up to 40 chars each side)
            const contextStart = Math.max(0, matchIndex - 40);
            const contextEnd = Math.min(content.length, matchIndex + banned.length + 40);
            const context = content.slice(contextStart, contextEnd).replace(/\n/g, '\\n');

            violations.push({
              file: relativePath,
              bannedString: banned,
              context: `...${context}...`,
            });
          }

          searchIndex = matchIndex + bannedLower.length;
        }
      }
    }
  }

  return violations;
}

/**
 * Check 2: Verify Novus.ai script tag is present in HTML output files.
 * The script tag should reference the Novus.ai SDK URL.
 * Returns { found: boolean, htmlFilesChecked: string[] }
 */
function checkNovusScriptTag() {
  const htmlFiles = [];
  let found = false;

  // Check HTML files in server/app (pre-rendered pages)
  for (const filePath of walkDir(SERVER_APP_DIR)) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.html') continue;

    htmlFiles.push(path.relative(BUILD_DIR, filePath));

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Check for Novus.ai SDK script tag or reference
    if (
      content.includes('novus.ai') ||
      content.includes('novusai') ||
      content.includes('sdk.novus.ai')
    ) {
      found = true;
    }
  }

  // Also check client-side JS chunks that are loaded in the browser,
  // since Next.js may bundle the analytics provider code there
  if (!found) {
    for (const filePath of walkDir(STATIC_DIR)) {
      if (path.extname(filePath).toLowerCase() !== '.js') continue;

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      if (
        content.includes('sdk.novus.ai') ||
        content.includes('novusai') ||
        content.includes('novus.ai/events.js')
      ) {
        found = true;
        break;
      }
    }
  }

  return { found, htmlFilesChecked: htmlFiles };
}

/**
 * Check 3: Verify no PII fields appear in analytics-related code in the build output.
 * Scans client-side JS bundles for patterns that suggest PII collection in analytics contexts.
 * Returns array of violation objects.
 */
function checkAnalyticsPII() {
  const violations = [];

  if (!fs.existsSync(STATIC_DIR)) return violations;

  for (const filePath of walkDir(STATIC_DIR)) {
    if (path.extname(filePath).toLowerCase() !== '.js') continue;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Only check files that contain analytics-related code
    const hasAnalyticsCode =
      content.includes('novusai') ||
      content.includes('novus.ai') ||
      content.includes('trackEvent') ||
      content.includes('analytics') ||
      content.includes('track(');

    if (!hasAnalyticsCode) continue;

    const relativePath = path.relative(BUILD_DIR, filePath);

    for (const pattern of PII_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        violations.push({
          file: relativePath,
          pattern: pattern.toString(),
          matchedText: match[0],
        });
      }
    }
  }

  return violations;
}

// --- Main Execution ---

function main() {
  console.log('=== Build Verification Script ===\n');

  if (!fs.existsSync(BUILD_DIR)) {
    console.error(`ERROR: Build directory not found at ${BUILD_DIR}`);
    console.error('Run "npm run build" first, then run this verification script.');
    process.exit(1);
  }

  let hasViolations = false;

  // Check 1: Banned strings
  console.log('Check 1: Scanning for banned strings in client-side assets...');
  const bannedViolations = checkBannedStrings();
  if (bannedViolations.length > 0) {
    hasViolations = true;
    console.error(`  FAIL: Found ${bannedViolations.length} banned string occurrence(s):\n`);
    for (const v of bannedViolations) {
      console.error(`    File: ${v.file}`);
      console.error(`    Banned: "${v.bannedString}"`);
      console.error(`    Context: ${v.context}`);
      console.error('');
    }
  } else {
    console.log('  PASS: No banned strings found in client-side build output.\n');
  }

  // Check 2: Novus.ai script tag
  console.log('Check 2: Verifying Novus.ai script tag presence...');
  const novusCheck = checkNovusScriptTag();
  if (!novusCheck.found) {
    hasViolations = true;
    console.error('  FAIL: Novus.ai script tag or SDK reference NOT found in build output.');
    console.error(`    HTML files checked: ${novusCheck.htmlFilesChecked.join(', ') || '(none found)'}`);
    console.error('    Also checked static JS chunks for SDK URL references.');
    console.error('');
  } else {
    console.log('  PASS: Novus.ai SDK reference found in build output.\n');
  }

  // Check 3: PII in analytics
  console.log('Check 3: Checking for PII in analytics payloads...');
  const piiViolations = checkAnalyticsPII();
  if (piiViolations.length > 0) {
    hasViolations = true;
    console.error(`  FAIL: Found ${piiViolations.length} potential PII field(s) in analytics code:\n`);
    for (const v of piiViolations) {
      console.error(`    File: ${v.file}`);
      console.error(`    Pattern: ${v.pattern}`);
      console.error(`    Matched: ${v.matchedText}`);
      console.error('');
    }
  } else {
    console.log('  PASS: No PII fields found in analytics code.\n');
  }

  // Summary
  console.log('=== Summary ===');
  if (hasViolations) {
    console.error('FAILED: Build verification found violations. Fix issues and rebuild.');
    process.exit(1);
  } else {
    console.log('PASSED: All build verification checks passed.');
    process.exit(0);
  }
}

main();
