import type { Logger, ContentCategory } from '@kidsvid/shared';
import * as fs from 'fs';
import * as path from 'path';

/** SEO optimizer for YouTube kids content.
 * Uses analysis patterns from analysis-results.json to optimize titles,
 * descriptions, and tags for maximum discoverability and engagement. */

export interface SeoInput {
  title: string;
  description: string;
  tags: string[];
  category: string;
}

export interface SeoResult {
  title: string;
  description: string;
  tags: string[];
  changes: string[];
}

export interface AnalysisPatterns {
  titleKeywords: string[];
  highPerformingTags: { tag: string; count: number; avgViews: number }[];
  popularTags: { tag: string; count: number; avgViews: number }[];
  optimalTitleLength: number;
  avgEngagementRate: number;
}

export class SeoOptimizer {
  private patterns: AnalysisPatterns;

  constructor(
    private logger: Logger,
    analysisResultsPath?: string,
  ) {
    this.patterns = this.loadPatterns(analysisResultsPath);
  }

  optimize(input: SeoInput): SeoResult {
    const changes: string[] = [];
    let { title, description, tags } = input;

    // ─── Title Optimizations ───

    // Add engagement markers if missing (numbers or punctuation)
    if (!/[!?]/.test(title) && !/\d/.test(title)) {
      title = title + '!';
      changes.push('Added exclamation to title');
    }

    // Ensure title isn't too long (analysis shows short titles <=40 chars get more views)
    if (title.length > 60) {
      title = title.slice(0, 57) + '...';
      changes.push('Truncated title to 60 chars');
    }

    // Suggest high-performing keywords from analysis
    const titleLower = title.toLowerCase();
    const topKeywords = this.patterns.titleKeywords;
    const missingKeywords = topKeywords.filter(
      (kw) => !titleLower.includes(kw.toLowerCase()),
    );
    if (missingKeywords.length > 0) {
      changes.push(
        `Consider adding keywords: ${missingKeywords.slice(0, 3).join(', ')}`,
      );
    }

    // ─── Description Optimizations ───

    const categoryTag = input.category.replace(/_/g, '');
    const descLines = [
      description,
      '',
      '---',
      `#kids #educational #learning #${categoryTag} #kidsvideos #preschool`,
      '',
      'Subscribe for new videos every week!',
      '',
      `Fun ${input.category.replace(/_/g, ' ')} content for children ages 2-8.`,
      'Like, share, and subscribe for more!',
    ];
    description = descLines.join('\n');
    changes.push('Added hashtags, subscribe CTA, and channel description');

    // ─── Tag Optimizations ───

    // Base tags every kids video should have
    const baseTags = [
      'kids',
      'children',
      'educational',
      'learning',
      'kids videos',
      'preschool',
      'toddler',
      'kids learning',
      'for kids',
      'kids songs',
      'nursery rhymes',
    ];

    // Add high-performing tags from analysis
    const highPerformingTagNames = this.patterns.highPerformingTags
      .slice(0, 10)
      .map((t) => t.tag);

    // Add category-specific tags
    const categoryTags = this.getCategoryTags(input.category);

    // Merge all tags, deduplicate
    const allTags = [
      ...tags,
      ...baseTags,
      ...highPerformingTagNames,
      ...categoryTags,
    ];
    const uniqueTags = [...new Set(allTags.map((t) => t.toLowerCase()))];

    // YouTube limit: total tag characters must be under 500
    const finalTags: string[] = [];
    let totalChars = 0;
    for (const tag of uniqueTags) {
      if (totalChars + tag.length + 1 > 500) break;
      finalTags.push(tag);
      totalChars += tag.length + 1;
    }

    const addedCount = finalTags.length - tags.length;
    if (addedCount > 0) {
      changes.push(`Added ${addedCount} optimized tags (total: ${finalTags.length})`);
    }
    tags = finalTags;

    this.logger.info({ changes }, 'SEO optimization applied');

    return { title, description, tags, changes };
  }

  /** Get optimal posting insights from analysis data */
  getOptimalPostingInsights(): {
    bestDays: string[];
    bestHoursUtc: number[];
    avgEngagementRate: number;
  } {
    return {
      bestDays: ['Tuesday', 'Wednesday', 'Thursday'],
      bestHoursUtc: [14, 15, 16],
      avgEngagementRate: this.patterns.avgEngagementRate,
    };
  }

  private getCategoryTags(category: string): string[] {
    const categoryTagMap: Record<string, string[]> = {
      nursery_rhyme: ['nursery rhymes', 'baby songs', 'sing along', 'rhymes for kids'],
      song: ['kids songs', 'songs for kids', 'sing along', 'music for kids', 'kid songs'],
      educational: ['learn', 'kids education', 'early learning', 'preschool learning'],
      story: ['kids stories', 'bedtime stories', 'stories for kids', 'fun stories'],
      animation: ['kids animation', 'cartoon', 'cartoons for kids', 'animated'],
      roleplay: ['pretend play', 'kids playing', 'family', 'fun'],
      challenge: ['kids challenge', 'fun challenge', 'family fun'],
      unboxing: ['toys', 'kids toys', 'toy review', 'unboxing'],
      other: ['kids', 'family', 'fun'],
    };
    return categoryTagMap[category] ?? categoryTagMap['other'];
  }

  private loadPatterns(resultsPath?: string): AnalysisPatterns {
    const defaults: AnalysisPatterns = {
      titleKeywords: ['kids', 'fun', 'learn', 'songs', 'story'],
      highPerformingTags: [],
      popularTags: [],
      optimalTitleLength: 40,
      avgEngagementRate: 0.004,
    };

    const filePath = resultsPath ?? path.resolve(process.cwd(), 'analysis-results.json');

    try {
      if (!fs.existsSync(filePath)) return defaults;

      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as {
        patterns?: Array<{
          patternType: string;
          metadata?: Record<string, unknown>;
        }>;
      };

      if (!data.patterns) return defaults;

      // Extract title keywords
      const keywordPattern = data.patterns.find(
        (p) => p.patternType === 'title_keywords',
      );
      if (keywordPattern?.metadata?.topWords) {
        defaults.titleKeywords = (
          keywordPattern.metadata.topWords as Array<{ word: string }>
        )
          .slice(0, 10)
          .map((w) => w.word);
      }

      // Extract high-performing tags
      const highPerfPattern = data.patterns.find(
        (p) => p.patternType === 'tags_high_performing',
      );
      if (highPerfPattern?.metadata?.highPerformingTags) {
        defaults.highPerformingTags = highPerfPattern.metadata.highPerformingTags as {
          tag: string;
          count: number;
          avgViews: number;
        }[];
      }

      // Extract popular tags
      const popularPattern = data.patterns.find(
        (p) => p.patternType === 'tags_popular',
      );
      if (popularPattern?.metadata?.topTags) {
        defaults.popularTags = popularPattern.metadata.topTags as {
          tag: string;
          count: number;
          avgViews: number;
        }[];
      }

      // Extract engagement rate
      const engagementPattern = data.patterns.find(
        (p) => p.patternType === 'engagement_rate',
      );
      if (engagementPattern?.metadata?.avgEngagementRate) {
        defaults.avgEngagementRate = engagementPattern.metadata
          .avgEngagementRate as number;
      }

      // Extract optimal title length
      const titlePattern = data.patterns.find(
        (p) => p.patternType === 'title_length',
      );
      if (titlePattern?.metadata?.avgLength) {
        defaults.optimalTitleLength = Math.min(
          titlePattern.metadata.avgLength as number,
          60,
        );
      }

      this.logger.info('Loaded analysis patterns for SEO optimization');
      return defaults;
    } catch {
      this.logger.warn('Could not load analysis-results.json, using defaults');
      return defaults;
    }
  }
}
