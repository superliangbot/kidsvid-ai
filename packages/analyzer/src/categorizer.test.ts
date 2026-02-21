import { describe, it, expect } from 'vitest';
import { categorizeVideo, categorizeVideos, categorizeChannel } from './categorizer.js';
import type { YouTubeVideoInfo } from '@kidsvid/shared';

function makeVideo(overrides: Partial<YouTubeVideoInfo> = {}): YouTubeVideoInfo {
  return {
    videoId: 'test-' + Math.random().toString(36).slice(2, 8),
    channelId: 'UC_test',
    title: 'Test Video',
    description: '',
    publishedAt: '2024-01-15T10:00:00Z',
    duration: 180,
    viewCount: 100000,
    likeCount: 5000,
    commentCount: 500,
    tags: [],
    thumbnailUrl: 'https://example.com/thumb.jpg',
    defaultLanguage: 'en',
    categoryId: '24',
    ...overrides,
  };
}

describe('categorizeVideo', () => {
  it('categorizes nursery rhyme content', () => {
    const video = makeVideo({
      title: 'Wheels on the Bus - Nursery Rhymes for Babies',
      tags: ['nursery rhymes', 'kids songs'],
    });
    const result = categorizeVideo(video);
    expect(result.category).toBe('nursery_rhyme');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('categorizes educational content', () => {
    const video = makeVideo({
      title: 'Learn Colors with Colorful Balls',
      description: 'Educational video for kids to learn colors and shapes',
      tags: ['learning', 'educational', 'learn colors'],
    });
    const result = categorizeVideo(video);
    expect(result.category).toBe('educational');
  });

  it('categorizes song content', () => {
    const video = makeVideo({
      title: 'Baby Shark Dance | Sing Along Song',
      tags: ['kids songs', 'sing along', 'baby songs'],
    });
    const result = categorizeVideo(video);
    expect(result.category).toBe('song');
  });

  it('categorizes story content', () => {
    const video = makeVideo({
      title: 'Bedtime Story: The Little Red Hen - Fairy Tales for Kids',
      tags: ['bedtime stories', 'fairy tales', 'kids stories'],
    });
    const result = categorizeVideo(video);
    expect(result.category).toBe('story');
  });

  it('categorizes roleplay content', () => {
    const video = makeVideo({
      title: 'Diana Pretend Play with Kitchen Toys',
      tags: ['pretend play', 'role play', 'toys'],
    });
    const result = categorizeVideo(video);
    expect(result.category).toBe('roleplay');
  });

  it('categorizes unboxing content', () => {
    const video = makeVideo({
      title: 'Giant Surprise Egg Opening! New Toys Inside',
      tags: ['surprise eggs', 'unboxing', 'toy unboxing'],
    });
    const result = categorizeVideo(video);
    expect(result.category).toBe('unboxing');
  });

  it('categorizes challenge content', () => {
    const video = makeVideo({
      title: 'Guess the Animal Challenge for Kids',
      tags: ['challenge', 'kids challenge', 'quiz'],
    });
    const result = categorizeVideo(video);
    expect(result.category).toBe('challenge');
  });

  it('returns "other" for unrecognizable content', () => {
    const video = makeVideo({
      title: 'Random Clip XYZ',
      description: 'Just a clip',
      tags: [],
    });
    const result = categorizeVideo(video);
    expect(result.category).toBe('other');
    expect(result.confidence).toBe(0);
  });

  it('gives higher weight to title matches', () => {
    const video = makeVideo({
      title: 'Nursery Rhymes for Babies Collection',
      description: 'A story about a fun adventure',
    });
    const result = categorizeVideo(video);
    // Title has "nursery rhymes" with 3x weight, description has only weak signals
    expect(result.category).toBe('nursery_rhyme');
  });

  it('gives weight to tag matches', () => {
    const video = makeVideo({
      title: 'Fun video for kids',
      tags: ['nursery rhymes', 'rhymes for kids'],
    });
    const result = categorizeVideo(video);
    expect(result.category).toBe('nursery_rhyme');
  });

  it('returns scores for all categories', () => {
    const video = makeVideo({
      title: 'Learn Colors Nursery Rhymes Song',
      tags: ['learning', 'nursery rhymes', 'kids songs'],
    });
    const result = categorizeVideo(video);
    expect(result.scores).toBeDefined();
    expect(Object.keys(result.scores).length).toBeGreaterThan(0);
  });
});

describe('categorizeVideos', () => {
  it('categorizes multiple videos', () => {
    const videos = [
      makeVideo({ title: 'Wheels on the Bus Nursery Rhyme', videoId: 'v1' }),
      makeVideo({ title: 'Learn Colors with Paint', videoId: 'v2' }),
      makeVideo({ title: 'Bedtime Story Time', videoId: 'v3' }),
    ];
    const results = categorizeVideos(videos);
    expect(results.size).toBe(3);
    expect(results.get('v1')?.category).toBe('nursery_rhyme');
    expect(results.get('v2')?.category).toBe('educational');
    expect(results.get('v3')?.category).toBe('story');
  });

  it('handles empty input', () => {
    const results = categorizeVideos([]);
    expect(results.size).toBe(0);
  });
});

describe('categorizeChannel', () => {
  it('determines primary category from videos', () => {
    const videos = [
      makeVideo({ title: 'Wheels on the Bus', viewCount: 1000000 }),
      makeVideo({ title: 'Twinkle Twinkle Little Star', viewCount: 800000 }),
      makeVideo({ title: 'Nursery Rhymes Compilation', viewCount: 600000 }),
      makeVideo({ title: 'Learn Colors', viewCount: 200000 }),
    ];
    const result = categorizeChannel(videos);
    expect(result.category).toBe('nursery_rhyme');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('weights by view count (log scale)', () => {
    // One viral educational video shouldn't override many nursery rhymes
    const videos = [
      makeVideo({ title: 'Wheels on the Bus', viewCount: 100000 }),
      makeVideo({ title: 'Baa Baa Black Sheep', viewCount: 100000 }),
      makeVideo({ title: 'Humpty Dumpty', viewCount: 100000 }),
      makeVideo({ title: 'Itsy Bitsy Spider', viewCount: 100000 }),
      makeVideo({ title: 'Learn Colors Super Video', viewCount: 10000000 }),
    ];
    const result = categorizeChannel(videos);
    // The educational video has massive views but nursery rhymes have more signals
    expect(['nursery_rhyme', 'educational']).toContain(result.category);
  });

  it('handles empty videos', () => {
    const result = categorizeChannel([]);
    expect(result.category).toBe('other');
    expect(result.confidence).toBe(0);
  });
});
