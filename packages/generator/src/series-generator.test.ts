import { describe, it, expect, vi } from 'vitest';
import { SeriesGenerator, SERIES_TEMPLATES } from './series-generator.js';
import type { Logger } from '@kidsvid/shared';

const mockLogger: Logger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
} as unknown as Logger;

describe('SeriesGenerator', () => {
  describe('generate', () => {
    it('generates a complete series definition', () => {
      const gen = new SeriesGenerator(mockLogger);
      const series = gen.generate({
        name: 'Counting Adventures with Cosmo',
        educationalCategory: 'early_math',
        topic: 'counting and numbers',
        ageBracket: '4-6',
        totalEpisodes: 10,
        characterIds: [0],
      });

      expect(series.id).toBe('counting-adventures-with-cosmo-s1');
      expect(series.name).toBe('Counting Adventures with Cosmo');
      expect(series.totalEpisodes).toBe(10);
      expect(series.episodeOutlines).toHaveLength(10);
      expect(series.storyArc).toContain('10-episode journey');
      expect(series.educationalCategory).toBe('early_math');
      expect(series.ageBracket).toBe('4-6');
    });

    it('generates correct episode progression', () => {
      const gen = new SeriesGenerator(mockLogger);
      const series = gen.generate({
        name: 'Math Fun',
        educationalCategory: 'early_math',
        topic: 'math',
        ageBracket: '2-4',
        totalEpisodes: 5,
        characterIds: [4],
      });

      const episodes = series.episodeOutlines;

      // First episode has no build-on
      expect(episodes[0].episodeNumber).toBe(1);
      expect(episodes[0].buildOn).toContain('First episode');

      // Second episode builds on first
      expect(episodes[1].episodeNumber).toBe(2);
      expect(episodes[1].buildOn).toContain('Episode 1');

      // Each episode has a different topic
      const topics = episodes.map(e => e.topic);
      expect(new Set(topics).size).toBe(5);
    });

    it('adjusts duration by age bracket', () => {
      const gen = new SeriesGenerator(mockLogger);

      const young = gen.generate({
        name: 'Toddler Show',
        educationalCategory: 'early_math',
        topic: 'numbers',
        ageBracket: '2-4',
        totalEpisodes: 1,
        characterIds: [0],
      });

      const old = gen.generate({
        name: 'Big Kid Show',
        educationalCategory: 'early_math',
        topic: 'numbers',
        ageBracket: '6-8',
        totalEpisodes: 1,
        characterIds: [0],
      });

      expect(young.episodeOutlines[0].targetDuration).toBe(150);
      expect(old.episodeOutlines[0].targetDuration).toBe(270);
    });

    it('includes engagement hooks in every episode', () => {
      const gen = new SeriesGenerator(mockLogger);
      const series = gen.generate({
        name: 'Test',
        educationalCategory: 'phonics_reading',
        topic: 'ABCs',
        ageBracket: '2-4',
        totalEpisodes: 5,
        characterIds: [1],
      });

      for (const ep of series.episodeOutlines) {
        expect(ep.engagementHooks.length).toBeGreaterThanOrEqual(2);
        expect(ep.engagementHooks).toContain('call_response');
        expect(ep.engagementHooks).toContain('reward_loop');
      }
    });

    it('supports custom season number', () => {
      const gen = new SeriesGenerator(mockLogger);
      const series = gen.generate({
        name: 'Color Quest',
        educationalCategory: 'science',
        topic: 'colors',
        ageBracket: '2-4',
        totalEpisodes: 3,
        characterIds: [0],
        season: 2,
      });

      expect(series.season).toBe(2);
      expect(series.id).toBe('color-quest-s2');
    });
  });

  describe('generateFromPrompt', () => {
    it('parses "10-episode series teaching colors to 3-year-olds"', () => {
      const gen = new SeriesGenerator(mockLogger);
      const series = gen.generateFromPrompt(
        'Create a 10-episode series teaching colors to 3-year-olds',
      );

      expect(series.totalEpisodes).toBe(10);
      expect(series.ageBracket).toBe('2-4');
      expect(series.educationalCategory).toBe('science');
    });

    it('parses counting series prompt', () => {
      const gen = new SeriesGenerator(mockLogger);
      const series = gen.generateFromPrompt(
        'Create a 5-episode series about counting for 4-year-olds',
      );

      expect(series.totalEpisodes).toBe(5);
      expect(series.ageBracket).toBe('4-6');
      expect(series.educationalCategory).toBe('early_math');
    });

    it('parses alphabet series prompt', () => {
      const gen = new SeriesGenerator(mockLogger);
      const series = gen.generateFromPrompt(
        'Make a 26-episode alphabet series for 2-year-olds',
      );

      expect(series.totalEpisodes).toBe(26);
      expect(series.educationalCategory).toBe('phonics_reading');
    });

    it('parses named series prompt', () => {
      const gen = new SeriesGenerator(mockLogger);
      const series = gen.generateFromPrompt(
        'Create a 10-episode series called "Luna\'s Numbers" teaching counting to 3-year-olds',
      );

      expect(series.name).toBe("Luna's Numbers");
    });

    it('defaults to 10 episodes when not specified', () => {
      const gen = new SeriesGenerator(mockLogger);
      const series = gen.generateFromPrompt('series about music for 5-year-olds');

      expect(series.totalEpisodes).toBe(10);
    });
  });

  describe('getTopicsForCategory', () => {
    it('returns topics for early_math', () => {
      const gen = new SeriesGenerator(mockLogger);
      const topics = gen.getTopicsForCategory('early_math');

      expect(topics.length).toBeGreaterThan(5);
      expect(topics).toContain('numbers 1-5');
      expect(topics).toContain('simple patterns (AB, AB)');
    });

    it('returns topics for all categories', () => {
      const gen = new SeriesGenerator(mockLogger);
      const categories = [
        'early_math', 'phonics_reading', 'science',
        'social_emotional', 'world_knowledge', 'problem_solving', 'music_rhythm',
      ] as const;

      for (const cat of categories) {
        const topics = gen.getTopicsForCategory(cat);
        expect(topics.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('SERIES_TEMPLATES', () => {
  it('has pre-built templates for common themes', () => {
    expect(SERIES_TEMPLATES.counting_basics).toBeDefined();
    expect(SERIES_TEMPLATES.alphabet_adventure).toBeDefined();
    expect(SERIES_TEMPLATES.science_explorers).toBeDefined();
    expect(SERIES_TEMPLATES.feelings_friends).toBeDefined();
    expect(SERIES_TEMPLATES.world_discovery).toBeDefined();
  });

  it('templates have required fields', () => {
    for (const [, tmpl] of Object.entries(SERIES_TEMPLATES)) {
      expect(tmpl.educationalCategory).toBeDefined();
      expect(tmpl.topic).toBeDefined();
      expect(tmpl.ageBracket).toBeDefined();
      expect(tmpl.characterIds.length).toBeGreaterThan(0);
    }
  });
});
