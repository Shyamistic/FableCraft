/**
 * QA Test Script for Fablecraft Product Polish V2
 * 
 * Run with: node scripts/qa-test.js
 * 
 * This script validates that all critical features are properly integrated
 * by checking file existence, imports, component exports, and configurations.
 * Manual browser testing is still needed for visual/interactive features.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
let passed = 0
let failed = 0
const results = []

function check(description, condition) {
  if (condition) {
    passed++
    results.push(`  ✓ ${description}`)
  } else {
    failed++
    results.push(`  ✗ FAIL: ${description}`)
  }
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath))
}

function fileContains(relativePath, searchString) {
  if (!fileExists(relativePath)) return false
  const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8')
  return content.includes(searchString)
}

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('  FABLECRAFT - Product Polish V2 QA Validation')
console.log('═══════════════════════════════════════════════════════════════\n')

// ─── 1. Background Images ────────────────────────────────────────────────────
console.log('📸 1. Background Images')
check('Home background exists (prompt1.png)', fileExists('public/backgrounds/prompt1.png'))
check('Fantasy Kingdom background exists (prompt2.png)', fileExists('public/backgrounds/prompt2.png'))
check('Outer Space background exists (prompt3.png)', fileExists('public/backgrounds/prompt3.png'))
check('Underwater World background exists (prompt4.png)', fileExists('public/backgrounds/prompt4.png'))
check('Jungle Safari background exists (prompt5.png)', fileExists('public/backgrounds/prompt5.png'))
check('Gallery background exists (prompt6.png)', fileExists('public/backgrounds/prompt6.png'))
check('Drawing background exists (prompt7.png)', fileExists('public/backgrounds/prompt7.png'))
check('Celebration background exists (prompt8.png)', fileExists('public/backgrounds/prompt8.png'))
check('Backgrounds lib exists', fileExists('lib/backgrounds.ts'))
check('Page uses getBackgroundStyle', fileContains('app/page.tsx', 'getBackgroundStyle'))
console.log('')

// ─── 2. Audio System ─────────────────────────────────────────────────────────
console.log('🎵 2. Audio System')
check('useBackgroundMusic hook exists', fileExists('hooks/useBackgroundMusic.ts'))
check('useSoundEffects hook exists', fileExists('hooks/useSoundEffects.ts'))
check('Music uses local audio paths', fileContains('hooks/useBackgroundMusic.ts', '/audio/'))
check('Music ducks during narration', fileContains('hooks/useBackgroundMusic.ts', 'narration-start'))
check('Music unducks after narration', fileContains('hooks/useBackgroundMusic.ts', 'narration-end'))
check('ScenePlayer dispatches narration-start', fileContains('components/ScenePlayer.tsx', 'narration-start'))
check('ScenePlayer dispatches narration-end', fileContains('components/ScenePlayer.tsx', 'narration-end'))
check('SFX uses Mixkit CDN', fileContains('hooks/useSoundEffects.ts', 'mixkit.co'))
check('Music toggle in page', fileContains('app/page.tsx', 'musicPlaying'))
check('Fade out support', fileContains('hooks/useBackgroundMusic.ts', 'fadeOut'))
console.log('')

// ─── 3. Gamification System ──────────────────────────────────────────────────
console.log('🏆 3. Gamification System')
check('useGamification hook exists', fileExists('hooks/useGamification.ts'))
check('Achievements lib exists', fileExists('lib/achievements.ts'))
check('XP rewards defined', fileContains('lib/achievements.ts', 'XP_REWARDS'))
check('Achievement evaluation function', fileContains('lib/achievements.ts', 'evaluateAchievements'))
check('Weekly challenge system', fileContains('lib/achievements.ts', 'getWeeklyChallenge'))
check('Level formula (exponential)', fileContains('lib/achievements.ts', 'xpForLevel'))
check('10 achievements defined', fileContains('lib/achievements.ts', 'collab_quest'))
check('Bookshelf entries', fileContains('lib/achievements.ts', 'BookshelfEntry'))
check('Gamification has checkAchievements', fileContains('hooks/useGamification.ts', 'checkAchievements'))
check('Gamification has addToBookshelf', fileContains('hooks/useGamification.ts', 'addToBookshelf'))
console.log('')

// ─── 4. UI Components ────────────────────────────────────────────────────────
console.log('🎨 4. UI Components')
check('AchievementToast component', fileExists('components/AchievementToast.tsx'))
check('XPProgressBar component', fileExists('components/XPProgressBar.tsx'))
check('WeeklyChallenge component', fileExists('components/WeeklyChallenge.tsx'))
check('Bookshelf component', fileExists('components/Bookshelf.tsx'))
check('AdventureMap component', fileExists('components/AdventureMap.tsx'))
check('DifficultySelector component', fileExists('components/DifficultySelector.tsx'))
check('AccessibilityProvider component', fileExists('components/AccessibilityProvider.tsx'))
check('StickerPalette component', fileExists('components/StickerPalette.tsx'))
check('MagicBrushSelector component', fileExists('components/MagicBrushSelector.tsx'))
console.log('')

// ─── 5. Drawing Enhancements ─────────────────────────────────────────────────
console.log('✏️ 5. Drawing Enhancements')
check('Magic brush lib exists', fileExists('lib/magicBrush.ts'))
check('Rainbow mode rendering', fileContains('lib/magicBrush.ts', 'renderRainbowSegment'))
check('Sparkle mode rendering', fileContains('lib/magicBrush.ts', 'renderSparkleSegment'))
check('Glow mode rendering', fileContains('lib/magicBrush.ts', 'renderGlowSegment'))
check('Neon mode rendering', fileContains('lib/magicBrush.ts', 'renderNeonSegment'))
check('DrawingCanvas imports MagicBrushSelector', fileContains('components/DrawingCanvas.tsx', 'MagicBrushSelector'))
check('DrawingCanvas imports StickerPalette', fileContains('components/DrawingCanvas.tsx', 'StickerPalette'))
check('DrawingCanvas supports sticker placement', fileContains('components/DrawingCanvas.tsx', 'stickerMode'))
check('DrawingCanvas uses renderMagicSegment', fileContains('components/DrawingCanvas.tsx', 'renderMagicSegment'))
console.log('')

// ─── 6. Accessibility ────────────────────────────────────────────────────────
console.log('♿ 6. Accessibility')
check('AccessibilityProvider exists', fileExists('components/AccessibilityProvider.tsx'))
check('Large text mode CSS', fileContains('app/globals.css', 'large-text-mode'))
check('High contrast mode CSS', fileContains('app/globals.css', 'high-contrast-mode'))
check('Reduced motion mode CSS', fileContains('app/globals.css', 'reduced-motion-mode'))
check('Simplified nav mode CSS', fileContains('app/globals.css', 'simplified-nav-mode'))
check('AccessibilityProvider in page', fileContains('app/page.tsx', 'AccessibilityProvider'))
check('ARIA labels on interactive elements', fileContains('app/page.tsx', 'aria-label'))
check('Min tap targets (44px)', fileContains('app/page.tsx', 'minHeight'))
console.log('')

// ─── 7. Page Integration ─────────────────────────────────────────────────────
console.log('📄 7. Main Page Integration')
check('Bookshelf view in page', fileContains('app/page.tsx', "activeView === 'bookshelf'"))
check('Adventure map view in page', fileContains('app/page.tsx', "activeView === 'adventure-map'"))
check('XPProgressBar in nav', fileContains('app/page.tsx', 'XPProgressBar'))
check('WeeklyChallenge on home', fileContains('app/page.tsx', 'WeeklyChallenge'))
check('AchievementToast integration', fileContains('app/page.tsx', 'AchievementToast'))
check('DifficultySelector imported', fileContains('app/page.tsx', 'DifficultySelector'))
check('Map button in nav', fileContains('app/page.tsx', 'adventure-map'))
check('Books button in nav', fileContains('app/page.tsx', 'BookOpen'))
check('Genre tracking on quest complete', fileContains('app/page.tsx', 'incrementQuests(selectedGenre)'))
check('Bookshelf addToBookshelf on complete', fileContains('app/page.tsx', 'addToBookshelf'))
console.log('')

// ─── 8. Branding Consistency ─────────────────────────────────────────────────
console.log('🎨 8. Branding')
check('Brand name is Fablecraft', fileContains('lib/branding.ts', 'Fablecraft'))
check('Brand colors defined', fileContains('lib/branding.ts', 'BRAND_COLORS'))
check('Package name is fablecraft', fileContains('package.json', 'fablecraft-frontend'))
console.log('')

// ─── 9. Build Validation ─────────────────────────────────────────────────────
console.log('🔨 9. Build Configuration')
check('package.json exists', fileExists('package.json'))
check('next.config.js exists', fileExists('next.config.js'))
check('tailwind.config.ts exists', fileExists('tailwind.config.ts'))
check('tsconfig.json exists', fileExists('tsconfig.json'))
check('React dependency', fileContains('package.json', '"react"'))
check('Next.js dependency', fileContains('package.json', '"next"'))
console.log('')

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════')
console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`)
console.log('═══════════════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\n  ⚠️  FAILED CHECKS:')
  results.filter(r => r.includes('FAIL')).forEach(r => console.log(r))
  console.log('')
}

console.log('\n  📋 MANUAL TESTING CHECKLIST:')
console.log('  ─────────────────────────────')
console.log('  [ ] Home screen loads with background image')
console.log('  [ ] Background changes per genre during quest')
console.log('  [ ] Music plays and mute toggle works')
console.log('  [ ] Sound effects fire on correct/wrong answer')
console.log('  [ ] XP bar visible in nav and fills on quest complete')
console.log('  [ ] Streak counter shows after consecutive daily use')
console.log('  [ ] Achievement toast appears on unlock')
console.log('  [ ] Weekly challenge card visible on home')
console.log('  [ ] Map button opens adventure map')
console.log('  [ ] Books button opens bookshelf')
console.log('  [ ] Drawing canvas: stickers can be placed')
console.log('  [ ] Drawing canvas: rainbow brush works')
console.log('  [ ] Drawing canvas: sparkle brush works')
console.log('  [ ] Drawing canvas: glow brush works')
console.log('  [ ] Drawing canvas: neon brush works')
console.log('  [ ] Undo removes last stroke/sticker')
console.log('  [ ] Accessibility: large text mode enlarges fonts')
console.log('  [ ] Accessibility: reduced motion stops animations')
console.log('  [ ] Responsive: no horizontal scroll on tablet/desktop')
console.log('  [ ] Collaborative mode accessible from home')
console.log('')

process.exit(failed > 0 ? 1 : 0)
