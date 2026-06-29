/**
 * Property-based tests for Character Gallery persistence and ordering.
 *
 * These tests validate that the gallery utility functions correctly maintain
 * newest-first ordering, enforce capacity limits (50 displayed, 20 persisted),
 * and remove the oldest characters when exceeding limits.
 *
 * **Validates: Requirements 10.1, 10.2, 10.4**
 */

import * as fc from 'fast-check';
import {
  addCharacterToGallery,
  getPersistedGallery,
} from '@/components/CharacterGallery';
import { MAX_GALLERY_CHARACTERS, MAX_PERSISTED_CHARACTERS } from '@/lib/constants';
import type { GalleryEntry } from '@/lib/types';

// ─── Arbitraries (Generators) ────────────────────────────────────────────────

/**
 * Generates a valid GalleryEntry with a unique id and a valid ISO date.
 * Uses a counter-based timestamp to ensure unique created_at values.
 */
function arbGalleryEntry(index: number): fc.Arbitrary<GalleryEntry> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    generated_image_url: fc.constant(`https://cdn.example.com/characters/${index}.png`),
    original_drawing_url: fc.constant(`https://cdn.example.com/drawings/${index}.png`),
    created_at: fc.constant(new Date(Date.now() - (1000 - index) * 60000).toISOString()),
  });
}

/**
 * Generates a list of GalleryEntry items with distinct timestamps.
 * Each entry has a unique created_at based on its position in the sequence.
 */
function arbGalleryEntries(
  minLength: number,
  maxLength: number
): fc.Arbitrary<GalleryEntry[]> {
  return fc.integer({ min: minLength, max: maxLength }).chain((count) =>
    fc.tuple(
      ...Array.from({ length: count }, (_, i) => arbGalleryEntry(i))
    ).map((entries) => entries as GalleryEntry[])
  );
}

/**
 * Generates a single GalleryEntry with a timestamp newer than any existing entries.
 */
function arbNewCharacter(): fc.Arbitrary<GalleryEntry> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    generated_image_url: fc.webUrl(),
    original_drawing_url: fc.webUrl(),
    created_at: fc.constant(new Date(Date.now() + 100000).toISOString()),
  });
}

/**
 * Generates a sequence of characters to be added to the gallery one at a time.
 * Each character has a progressively newer timestamp.
 */
function arbCharacterSequence(
  minLength: number,
  maxLength: number
): fc.Arbitrary<GalleryEntry[]> {
  return fc.integer({ min: minLength, max: maxLength }).chain((count) => {
    const entries = Array.from({ length: count }, (_, i) =>
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 30 }),
        generated_image_url: fc.constant(`https://cdn.example.com/char/${i}.png`),
        original_drawing_url: fc.constant(`https://cdn.example.com/draw/${i}.png`),
        created_at: fc.constant(new Date(Date.now() + i * 1000).toISOString()),
      })
    );
    return fc.tuple(...entries).map((e) => e as GalleryEntry[]);
  });
}

// ─── Property 18: Character Gallery Persistence and Ordering ─────────────────

describe('Property 18: Character Gallery Persistence and Ordering', () => {
  /**
   * **Validates: Requirements 10.1, 10.2, 10.4**
   *
   * For any sequence of character additions, the gallery is always ordered
   * newest-first, capped at max limit (50 displayed, 20 persisted), and
   * oldest characters are removed when exceeding the limit.
   */

  it('gallery is always ordered newest-first after any sequence of additions', () => {
    fc.assert(
      fc.property(
        arbCharacterSequence(1, 60),
        (characters) => {
          let gallery: GalleryEntry[] = [];

          for (const char of characters) {
            gallery = addCharacterToGallery(gallery, char);
          }

          // Verify newest-first ordering: each entry's created_at >= next entry's created_at
          for (let i = 0; i < gallery.length - 1; i++) {
            const currentTime = new Date(gallery[i].created_at).getTime();
            const nextTime = new Date(gallery[i + 1].created_at).getTime();
            expect(currentTime).toBeGreaterThanOrEqual(nextTime);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('gallery never exceeds MAX_GALLERY_CHARACTERS (50) after any number of additions', () => {
    fc.assert(
      fc.property(
        arbCharacterSequence(1, 80),
        (characters) => {
          let gallery: GalleryEntry[] = [];

          for (const char of characters) {
            gallery = addCharacterToGallery(gallery, char);
            // After each addition, gallery must not exceed the limit
            expect(gallery.length).toBeLessThanOrEqual(MAX_GALLERY_CHARACTERS);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('oldest characters are removed when gallery exceeds the limit', () => {
    fc.assert(
      fc.property(
        arbCharacterSequence(MAX_GALLERY_CHARACTERS + 1, MAX_GALLERY_CHARACTERS + 20),
        (characters) => {
          let gallery: GalleryEntry[] = [];

          for (const char of characters) {
            gallery = addCharacterToGallery(gallery, char);
          }

          // Gallery is capped at MAX_GALLERY_CHARACTERS
          expect(gallery.length).toBe(MAX_GALLERY_CHARACTERS);

          // The gallery should contain only the most recent characters
          // Sort all input characters by created_at descending
          const sortedInput = [...characters]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            // Remove duplicates by id (addCharacterToGallery deduplicates)
            .filter((char, idx, arr) => arr.findIndex((c) => c.id === char.id) === idx);

          const expectedIds = new Set(
            sortedInput.slice(0, MAX_GALLERY_CHARACTERS).map((c) => c.id)
          );
          const actualIds = new Set(gallery.map((c) => c.id));

          expect(actualIds).toEqual(expectedIds);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('a newly added character always appears in the gallery', () => {
    fc.assert(
      fc.property(
        arbCharacterSequence(0, 49),
        arbNewCharacter(),
        (existingChars, newChar) => {
          let gallery: GalleryEntry[] = [];
          for (const char of existingChars) {
            gallery = addCharacterToGallery(gallery, char);
          }

          // Add the new character (it has the newest timestamp)
          gallery = addCharacterToGallery(gallery, newChar);

          // The new character must be present
          const found = gallery.find((c) => c.id === newChar.id);
          expect(found).toBeDefined();

          // The new character should be first (newest-first ordering)
          expect(gallery[0].id).toBe(newChar.id);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('persisted gallery never exceeds MAX_PERSISTED_CHARACTERS (20) and is newest-first', () => {
    fc.assert(
      fc.property(
        arbCharacterSequence(1, 60),
        (characters) => {
          let gallery: GalleryEntry[] = [];
          for (const char of characters) {
            gallery = addCharacterToGallery(gallery, char);
          }

          const persisted = getPersistedGallery(gallery);

          // Never exceeds persistence limit
          expect(persisted.length).toBeLessThanOrEqual(MAX_PERSISTED_CHARACTERS);

          // Persisted entries are ordered newest-first
          for (let i = 0; i < persisted.length - 1; i++) {
            const currentTime = new Date(persisted[i].created_at).getTime();
            const nextTime = new Date(persisted[i + 1].created_at).getTime();
            expect(currentTime).toBeGreaterThanOrEqual(nextTime);
          }

          // Persisted entries are a subset of the full gallery
          const galleryIds = new Set(gallery.map((c) => c.id));
          for (const entry of persisted) {
            expect(galleryIds.has(entry.id)).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('persisted gallery contains the most recent characters from the full gallery', () => {
    fc.assert(
      fc.property(
        arbCharacterSequence(MAX_PERSISTED_CHARACTERS + 1, 60),
        (characters) => {
          let gallery: GalleryEntry[] = [];
          for (const char of characters) {
            gallery = addCharacterToGallery(gallery, char);
          }

          const persisted = getPersistedGallery(gallery);

          // Should have exactly MAX_PERSISTED_CHARACTERS when gallery is larger
          expect(persisted.length).toBe(MAX_PERSISTED_CHARACTERS);

          // The persisted entries should be the top-N newest from the gallery
          const expectedPersisted = [...gallery]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, MAX_PERSISTED_CHARACTERS);

          const persistedIds = persisted.map((c) => c.id);
          const expectedIds = expectedPersisted.map((c) => c.id);

          expect(persistedIds).toEqual(expectedIds);
        }
      ),
      { numRuns: 200 }
    );
  });
});
