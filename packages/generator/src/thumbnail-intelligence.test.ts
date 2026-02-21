import { describe, it, expect, vi } from 'vitest';
import { ThumbnailIntelligence, THUMBNAIL_PATTERNS } from './thumbnail-intelligence.js';
import type { Logger } from '@kidsvid/shared';

const mockLogger: Logger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
} as unknown as Logger;

describe('ThumbnailIntelligence', () => {
  describe('generateSpec', () => {
    it('generates a thumbnail spec for educational content', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const spec = ti.generateSpec({
        title: 'Count to 5 with Cosmo!',
        category: 'educational',
        topic: 'counting numbers',
        characterName: 'Cosmo',
      });

      expect(spec.prompt).toContain('Cosmo');
      expect(spec.prompt).toContain('counting numbers');
      expect(spec.dominantColors.length).toBeGreaterThan(0);
      expect(spec.characterExpression).toBeDefined();
      expect(spec.composition).toBeDefined();
    });

    it('uses category-specific styles', () => {
      const ti = new ThumbnailIntelligence(mockLogger);

      const songSpec = ti.generateSpec({
        title: 'ABC Song',
        category: 'song',
        topic: 'alphabet',
      });
      expect(songSpec.style).toContain('colorful');

      const storySpec = ti.generateSpec({
        title: 'Forest Adventure',
        category: 'story',
        topic: 'forest animals',
      });
      expect(storySpec.style).toContain('adventure');
    });

    it('generates text overlay from title', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const spec = ti.generateSpec({
        title: 'Learn Colors with Melody',
        category: 'educational',
        topic: 'colors',
        episodeNumber: 3,
      });

      expect(spec.textOverlay).toContain('Ep.3');
    });

    it('falls back to educational style for unknown category', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const spec = ti.generateSpec({
        title: 'Test',
        category: 'unknown_category',
        topic: 'test topic',
      });

      expect(spec.dominantColors.length).toBeGreaterThan(0);
    });
  });

  describe('generateVariants', () => {
    it('generates 3 variants by default', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const variants = ti.generateVariants({
        title: 'Count to 10',
        category: 'educational',
        topic: 'counting',
        characterName: 'Cosmo',
      });

      expect(variants).toHaveLength(3);
    });

    it('variant B is a close-up', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const variants = ti.generateVariants({
        title: 'Test',
        category: 'educational',
        topic: 'test',
        characterName: 'Cosmo',
      });

      expect(variants[1].composition).toContain('70%');
      expect(variants[1].prompt).toContain('close-up');
    });

    it('variant C is an action scene', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const variants = ti.generateVariants({
        title: 'Test',
        category: 'educational',
        topic: 'test',
      });

      expect(variants[2].style).toContain('action');
    });

    it('respects custom count', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const variants = ti.generateVariants({
        title: 'Test',
        category: 'educational',
        topic: 'test',
        count: 2,
      });

      expect(variants).toHaveLength(2);
    });
  });

  describe('buildDallePrompt', () => {
    it('generates a complete DALL-E prompt', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const spec = ti.generateSpec({
        title: 'Shapes Fun',
        category: 'educational',
        topic: 'shapes',
        characterName: 'Cosmo',
      });

      const prompt = ti.buildDallePrompt(spec);

      expect(prompt).toContain('YouTube kids video thumbnail');
      expect(prompt).toContain('NO text');
      expect(prompt).toContain('Child-safe');
      expect(prompt).toContain('bright saturated colors');
    });
  });

  describe('analyzePatterns', () => {
    it('returns analysis rules for all dimensions', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const patterns = ti.analyzePatterns();

      expect(patterns.colorRules.length).toBeGreaterThan(3);
      expect(patterns.compositionRules.length).toBeGreaterThan(3);
      expect(patterns.expressionRules.length).toBeGreaterThan(3);
      expect(patterns.textRules.length).toBeGreaterThan(3);
    });

    it('color rules include specific colors', () => {
      const ti = new ThumbnailIntelligence(mockLogger);
      const { colorRules } = ti.analyzePatterns();

      const allRules = colorRules.join(' ');
      expect(allRules).toContain('yellow');
      expect(allRules).toContain('red');
      expect(allRules).toContain('blue');
    });
  });
});

describe('THUMBNAIL_PATTERNS', () => {
  it('defines high-performing colors', () => {
    expect(THUMBNAIL_PATTERNS.colors.high_performing.length).toBeGreaterThan(3);
  });

  it('defines composition rules', () => {
    expect(THUMBNAIL_PATTERNS.composition.rules.length).toBeGreaterThan(3);
  });

  it('defines expression guidelines', () => {
    expect(THUMBNAIL_PATTERNS.expressions.top_performing.length).toBeGreaterThan(2);
    expect(THUMBNAIL_PATTERNS.expressions.avoid.length).toBeGreaterThan(2);
  });

  it('defines text rules', () => {
    expect(THUMBNAIL_PATTERNS.text.rules.length).toBeGreaterThan(3);
  });
});
