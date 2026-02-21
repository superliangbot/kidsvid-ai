import { describe, it, expect, vi } from 'vitest';
import { ContentDeduplicator } from './dedup.js';
import type { Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';

const mockLogger: Logger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
} as unknown as Logger;

function createMockDb(existingVideos: Array<{ id: number; title: string; tags: string[]; generationMetadata: Record<string, unknown> | null }>) {
  return {
    query: {
      generatedVideos: {
        findMany: vi.fn().mockResolvedValue(existingVideos),
      },
    },
  } as unknown as Database;
}

describe('ContentDeduplicator', () => {
  it('returns no duplicate when DB is empty', async () => {
    const db = createMockDb([]);
    const dedup = new ContentDeduplicator(db, mockLogger);
    const result = await dedup.check({
      topic: 'counting to 5',
      category: 'educational',
      educationalCategory: 'early_math',
      ageBracket: '2-4',
    });
    expect(result.isDuplicate).toBe(false);
    expect(result.similarCount).toBe(0);
    expect(result.suggestedAngle).toBeNull();
  });

  it('detects duplicate when similar title exists', async () => {
    const db = createMockDb([
      { id: 1, title: 'Counting to 5 with Cosmo!', tags: ['counting'], generationMetadata: null },
    ]);
    const dedup = new ContentDeduplicator(db, mockLogger);
    const result = await dedup.check({
      topic: 'counting to 5',
      category: 'educational',
      educationalCategory: 'early_math',
      ageBracket: '2-4',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.similarCount).toBe(1);
    expect(result.suggestedAngle).toBeDefined();
    expect(result.suggestedAngle).not.toBe('counting to 5');
  });

  it('suggests unique angle when duplicate found', async () => {
    const db = createMockDb([
      { id: 1, title: 'Counting to 5 Fun', tags: [], generationMetadata: null },
    ]);
    const dedup = new ContentDeduplicator(db, mockLogger);
    const result = await dedup.check({
      topic: 'counting to 5',
      category: 'educational',
      educationalCategory: 'early_math',
      ageBracket: '2-4',
    });
    expect(result.suggestedAngle).toContain('counting to 5');
    expect(result.suggestedAngle!.length).toBeGreaterThan('counting to 5'.length);
  });

  it('does not flag unrelated content as duplicate', async () => {
    const db = createMockDb([
      { id: 1, title: 'ABC Alphabet Song for Toddlers', tags: ['alphabet'], generationMetadata: null },
    ]);
    const dedup = new ContentDeduplicator(db, mockLogger);
    const result = await dedup.check({
      topic: 'counting to 5',
      category: 'educational',
      educationalCategory: 'early_math',
      ageBracket: '2-4',
    });
    expect(result.isDuplicate).toBe(false);
  });

  it('detects via metadata educationalObjective', async () => {
    const db = createMockDb([
      { id: 1, title: 'Fun Numbers!', tags: [], generationMetadata: { educationalObjective: 'Learn counting to 5' } },
    ]);
    const dedup = new ContentDeduplicator(db, mockLogger);
    const result = await dedup.check({
      topic: 'counting to 10',
      category: 'educational',
      educationalCategory: 'early_math',
      ageBracket: '2-4',
    });
    expect(result.isDuplicate).toBe(true);
  });
});
