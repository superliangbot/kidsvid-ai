import type { ContentCategory, YouTubeVideoInfo } from '@kidsvid/shared';

/** Keyword-based content categorizer for kids YouTube videos */

const CATEGORY_KEYWORDS: Record<ContentCategory, string[]> = {
  nursery_rhyme: [
    'nursery rhyme',
    'nursery rhymes',
    'twinkle twinkle',
    'humpty dumpty',
    'jack and jill',
    'mary had a little lamb',
    'baa baa black sheep',
    'itsy bitsy spider',
    'old macdonald',
    'wheels on the bus',
    'row row row',
    'ring around the rosie',
    'hickory dickory',
    'london bridge',
    'rain rain go away',
  ],
  song: [
    'song',
    'songs',
    'sing along',
    'sing-along',
    'music',
    'dance',
    'lullaby',
    'lullabies',
    'baby shark',
    'finger family',
    'phonics song',
    'abc song',
    'alphabet song',
    'kids song',
    'children song',
  ],
  educational: [
    'learn',
    'learning',
    'educational',
    'colors',
    'numbers',
    'shapes',
    'counting',
    'alphabet',
    'abc',
    'phonics',
    'animals',
    'fruits',
    'vegetables',
    'science',
    'math',
    'reading',
    'letters',
    'words',
    'vocabulary',
    'teach',
  ],
  story: [
    'story',
    'stories',
    'storytime',
    'fairy tale',
    'fairytale',
    'bedtime',
    'adventure',
    'once upon a time',
    'tale',
    'moral',
    'fable',
  ],
  animation: [
    'cartoon',
    'animated',
    'animation',
    'episode',
    'full episode',
    'compilation',
  ],
  roleplay: [
    'pretend play',
    'roleplay',
    'role play',
    'dress up',
    'costume',
    'pretend',
    'playing',
    'toys',
    'play with',
  ],
  challenge: [
    'challenge',
    'try not to',
    'vs',
    'competition',
    'race',
    'game',
    'quiz',
    'guess',
  ],
  unboxing: [
    'unboxing',
    'surprise',
    'surprise egg',
    'opening',
    'toy review',
    'new toy',
    'play-doh',
    'playdoh',
    'slime',
  ],
  other: [],
};

const CATEGORY_TAG_WEIGHTS: Record<ContentCategory, string[]> = {
  nursery_rhyme: ['nursery rhymes', 'rhymes for kids', 'nursery rhyme'],
  song: ['kids songs', 'children songs', 'sing along', 'baby songs'],
  educational: ['learning', 'educational', 'learn colors', 'learn numbers', 'learn shapes'],
  story: ['kids stories', 'bedtime stories', 'fairy tales', 'story time'],
  animation: ['cartoon', 'animation', 'animated series', 'kids cartoon'],
  roleplay: ['pretend play', 'role play', 'kids play'],
  challenge: ['challenge', 'kids challenge', 'fun challenge'],
  unboxing: ['unboxing', 'surprise eggs', 'toy unboxing'],
  other: [],
};

export interface CategorizeResult {
  category: ContentCategory;
  confidence: number;
  scores: Record<ContentCategory, number>;
}

export function categorizeVideo(video: YouTubeVideoInfo): CategorizeResult {
  const text = `${video.title} ${video.description}`.toLowerCase();
  const tags = video.tags.map((t) => t.toLowerCase());

  const scores: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;

    // Title/description keyword matching (title has 3x weight)
    for (const keyword of keywords) {
      if (video.title.toLowerCase().includes(keyword)) {
        score += 3;
      } else if (text.includes(keyword)) {
        score += 1;
      }
    }

    // Tag matching (2x weight)
    const tagKeywords = CATEGORY_TAG_WEIGHTS[category as ContentCategory] || [];
    for (const tagKw of tagKeywords) {
      if (tags.some((t) => t.includes(tagKw))) {
        score += 2;
      }
    }

    scores[category] = score;
  }

  // Find the best match
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const topScore = entries[0][1];
  const topCategory = entries[0][0] as ContentCategory;

  // Calculate confidence
  const totalScore = entries.reduce((sum, [, s]) => sum + s, 0);
  const confidence = totalScore > 0 ? topScore / totalScore : 0;

  return {
    category: topScore === 0 ? 'other' : topCategory,
    confidence: Math.round(confidence * 100) / 100,
    scores: scores as Record<ContentCategory, number>,
  };
}

export function categorizeVideos(videos: YouTubeVideoInfo[]): Map<string, CategorizeResult> {
  const results = new Map<string, CategorizeResult>();
  for (const video of videos) {
    results.set(video.videoId, categorizeVideo(video));
  }
  return results;
}

/** Determine primary category for a channel based on its videos */
export function categorizeChannel(videos: YouTubeVideoInfo[]): CategorizeResult {
  if (videos.length === 0) {
    return { category: 'other', confidence: 0, scores: {} as Record<ContentCategory, number> };
  }

  // Aggregate scores across all videos, weighted by views
  const aggScores: Record<string, number> = {};
  let totalWeight = 0;

  for (const video of videos) {
    const result = categorizeVideo(video);
    const weight = Math.log10(Math.max(video.viewCount, 1)); // log-weight by views
    totalWeight += weight;

    for (const [cat, score] of Object.entries(result.scores)) {
      aggScores[cat] = (aggScores[cat] || 0) + score * weight;
    }
  }

  // Normalize
  if (totalWeight > 0) {
    for (const key of Object.keys(aggScores)) {
      aggScores[key] /= totalWeight;
    }
  }

  const entries = Object.entries(aggScores).sort(([, a], [, b]) => b - a);
  const topScore = entries[0]?.[1] || 0;
  const topCategory = (entries[0]?.[0] || 'other') as ContentCategory;
  const totalScore = entries.reduce((sum, [, s]) => sum + s, 0);

  return {
    category: topScore === 0 ? 'other' : topCategory,
    confidence: totalScore > 0 ? Math.round((topScore / totalScore) * 100) / 100 : 0,
    scores: aggScores as Record<ContentCategory, number>,
  };
}
