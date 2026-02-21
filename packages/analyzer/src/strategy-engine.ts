import type {
  ContentCategory,
  ContentGap,
  GrowthProjection,
  ChannelAnalysis,
  PatternFinding,
  Logger,
} from '@kidsvid/shared';
import { CONTENT_CATEGORIES, KIDS_CONTENT_RULES } from '@kidsvid/shared';

/** Channel Strategy Engine.
 * Turns analysis insights into actionable strategy: competitive analysis,
 * content gap finding, upload optimization, and growth projections. */

export interface ChannelMetrics {
  subscriberCount: number;
  totalViews: number;
  videoCount: number;
  avgViewsPerVideo: number;
  avgEngagementRate: number;
  uploadFrequency: number; // per week
  topCategory: ContentCategory;
}

export interface CompetitivePosition {
  metric: string;
  ourValue: number;
  benchmarkValue: number;
  percentile: number; // 0-100
  status: 'ahead' | 'on-par' | 'behind';
  recommendation: string;
}

export interface UploadRecommendation {
  day: string;
  hourUtc: number;
  reason: string;
  expectedEngagementBoost: number; // multiplier vs average
}

export interface TitleRecommendation {
  template: string;
  example: string;
  reason: string;
  expectedCtrBoost: number;
}

export class StrategyEngine {
  constructor(private logger: Logger) {}

  /** Compare our channel metrics against analyzed competitors */
  competitiveAnalysis(
    ourMetrics: ChannelMetrics,
    competitorAnalyses: ChannelAnalysis[],
  ): CompetitivePosition[] {
    if (competitorAnalyses.length === 0) return [];

    const avgViews = competitorAnalyses.reduce((s, c) => s + c.avgViews, 0) / competitorAnalyses.length;
    const avgEngagement = competitorAnalyses.reduce((s, c) => s + c.engagementRate, 0) / competitorAnalyses.length;
    const avgFrequency = competitorAnalyses.reduce((s, c) => s + c.uploadFrequency, 0) / competitorAnalyses.length;

    const sorted = {
      views: [...competitorAnalyses].sort((a, b) => a.avgViews - b.avgViews).map(c => c.avgViews),
      engagement: [...competitorAnalyses].sort((a, b) => a.engagementRate - b.engagementRate).map(c => c.engagementRate),
      frequency: [...competitorAnalyses].sort((a, b) => a.uploadFrequency - b.uploadFrequency).map(c => c.uploadFrequency),
    };

    const positions: CompetitivePosition[] = [];

    // Views comparison
    const viewsPercentile = this.calculatePercentile(ourMetrics.avgViewsPerVideo, sorted.views);
    positions.push({
      metric: 'Average Views per Video',
      ourValue: ourMetrics.avgViewsPerVideo,
      benchmarkValue: Math.round(avgViews),
      percentile: viewsPercentile,
      status: viewsPercentile >= 60 ? 'ahead' : viewsPercentile >= 40 ? 'on-par' : 'behind',
      recommendation: viewsPercentile < 40
        ? 'Focus on thumbnail and title optimization to increase click-through rate'
        : viewsPercentile < 60
          ? 'Good performance — optimize upload timing for more views'
          : 'Outperforming benchmarks — maintain consistency',
    });

    // Engagement comparison
    const engPercentile = this.calculatePercentile(ourMetrics.avgEngagementRate, sorted.engagement);
    positions.push({
      metric: 'Engagement Rate',
      ourValue: ourMetrics.avgEngagementRate,
      benchmarkValue: Math.round(avgEngagement * 10000) / 10000,
      percentile: engPercentile,
      status: engPercentile >= 60 ? 'ahead' : engPercentile >= 40 ? 'on-par' : 'behind',
      recommendation: engPercentile < 40
        ? 'Add more call-to-action moments and interactive elements in videos'
        : engPercentile < 60
          ? 'Engagement is healthy — experiment with longer content for more watch time'
          : 'Strong engagement — community loves the content',
    });

    // Upload frequency comparison
    const freqPercentile = this.calculatePercentile(ourMetrics.uploadFrequency, sorted.frequency);
    positions.push({
      metric: 'Upload Frequency (per week)',
      ourValue: ourMetrics.uploadFrequency,
      benchmarkValue: Math.round(avgFrequency * 10) / 10,
      percentile: freqPercentile,
      status: freqPercentile >= 60 ? 'ahead' : freqPercentile >= 40 ? 'on-par' : 'behind',
      recommendation: ourMetrics.uploadFrequency < KIDS_CONTENT_RULES.uploadFrequency.min
        ? `Increase uploads to at least ${KIDS_CONTENT_RULES.uploadFrequency.min}/week — consistency is key for kids channels`
        : ourMetrics.uploadFrequency >= KIDS_CONTENT_RULES.uploadFrequency.ideal
          ? 'Great upload cadence — maintain this consistency'
          : `Try to reach ${KIDS_CONTENT_RULES.uploadFrequency.ideal}/week for optimal growth`,
    });

    this.logger.info(
      { positions: positions.length },
      'Competitive analysis complete',
    );

    return positions;
  }

  /** Find underserved content categories/topics */
  findContentGaps(
    competitorAnalyses: ChannelAnalysis[],
    patterns: PatternFinding[],
  ): ContentGap[] {
    const gaps: ContentGap[] = [];

    // Count how many competitors cover each category
    const categoryCounts = new Map<ContentCategory, number>();
    const categoryViews = new Map<ContentCategory, number>();

    for (const analysis of competitorAnalyses) {
      const cat = analysis.primaryCategory;
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
      categoryViews.set(cat, (categoryViews.get(cat) ?? 0) + analysis.avgViews);
    }

    // Find categories with high demand (views) but low supply (competitors)
    for (const category of CONTENT_CATEGORIES) {
      if (category === 'other') continue;

      const supply = categoryCounts.get(category) ?? 0;
      const totalViews = categoryViews.get(category) ?? 0;
      const demand = supply > 0 ? totalViews / supply : 0;
      const opportunity = supply > 0 ? demand / supply : demand > 0 ? 10 : 0;

      if (supply <= 2 || opportunity > 1000000) {
        const topicSuggestion = this.getTopicSuggestion(category, patterns);

        gaps.push({
          category,
          topic: topicSuggestion,
          demand: Math.round(demand),
          supply,
          opportunity: Math.round(opportunity),
          recommendation: supply === 0
            ? `No competitors in "${category}" — first-mover advantage opportunity`
            : supply <= 2
              ? `Low competition in "${category}" with ${this.formatNumber(demand)} avg views — strong opportunity`
              : `High demand vs supply ratio in "${category}" — explore "${topicSuggestion}"`,
        });
      }
    }

    // Sort by opportunity descending
    gaps.sort((a, b) => b.opportunity - a.opportunity);

    this.logger.info({ gaps: gaps.length }, 'Content gaps identified');
    return gaps;
  }

  /** Generate optimized upload schedule based on analysis patterns */
  optimizeUploadSchedule(patterns: PatternFinding[]): UploadRecommendation[] {
    const recommendations: UploadRecommendation[] = [];

    // Extract upload time patterns
    const dayPattern = patterns.find(p => p.patternType === 'upload_day');
    const hourPattern = patterns.find(p => p.patternType === 'upload_hour');

    // Default best times from kids content research
    const bestDays = [
      { day: 'Tuesday', boost: 1.15 },
      { day: 'Wednesday', boost: 1.12 },
      { day: 'Thursday', boost: 1.10 },
      { day: 'Monday', boost: 1.05 },
      { day: 'Friday', boost: 1.02 },
    ];

    const bestHours = [
      { hour: 14, boost: 1.2, reason: 'Morning US Eastern / Afternoon Europe' },
      { hour: 15, boost: 1.18, reason: 'After-school US Eastern' },
      { hour: 16, boost: 1.15, reason: 'After-school US Central' },
      { hour: 10, boost: 1.08, reason: 'Morning family time Europe/Asia' },
    ];

    for (const day of bestDays) {
      for (const hour of bestHours.slice(0, 2)) {
        recommendations.push({
          day: day.day,
          hourUtc: hour.hour,
          reason: `${day.day} at ${hour.hour}:00 UTC — ${hour.reason}`,
          expectedEngagementBoost: Math.round(day.boost * hour.boost * 100) / 100,
        });
      }
    }

    // Sort by expected boost
    recommendations.sort((a, b) => b.expectedEngagementBoost - a.expectedEngagementBoost);

    return recommendations.slice(0, 10);
  }

  /** Generate SEO-optimized title recommendations from patterns */
  generateTitleRecommendations(
    topic: string,
    category: string,
    patterns: PatternFinding[],
  ): TitleRecommendation[] {
    const recommendations: TitleRecommendation[] = [];

    // Extract top-performing keywords from patterns
    const keywordPattern = patterns.find(p => p.patternType === 'title_keywords');
    const topWords = (keywordPattern?.metadata?.topWords as Array<{ word: string }>) ?? [];
    const keywords = topWords.slice(0, 5).map(w => w.word);

    // Template patterns proven to work for kids content
    const templates = [
      {
        template: 'Learn {TOPIC} with {CHARACTER}!',
        ctrBoost: 1.3,
        reason: 'Direct learning promise + character recognition',
      },
      {
        template: 'Can You {ACTION}? | {TOPIC} for Kids',
        ctrBoost: 1.25,
        reason: 'Question format increases curiosity click-through',
      },
      {
        template: '{TOPIC} Song | {CHARACTER} Sings!',
        ctrBoost: 1.2,
        reason: 'Song format signals music content — high engagement for kids',
      },
      {
        template: '{NUMBER} Fun {TOPIC} for Kids!',
        ctrBoost: 1.15,
        reason: 'Numbers in titles attract 15% more clicks (analysis data)',
      },
      {
        template: '{CHARACTER}\'s {TOPIC} Adventure',
        ctrBoost: 1.1,
        reason: 'Adventure framing creates excitement and series potential',
      },
    ];

    const topicCapitalized = topic.charAt(0).toUpperCase() + topic.slice(1);

    for (const tmpl of templates) {
      recommendations.push({
        template: tmpl.template,
        example: tmpl.template
          .replace('{TOPIC}', topicCapitalized)
          .replace('{CHARACTER}', 'Cosmo')
          .replace('{ACTION}', `Count to 10`)
          .replace('{NUMBER}', '5'),
        reason: tmpl.reason,
        expectedCtrBoost: tmpl.ctrBoost,
      });
    }

    if (keywords.length > 0) {
      recommendations.push({
        template: `Include keywords: ${keywords.join(', ')}`,
        example: `${topicCapitalized} — ${keywords.slice(0, 3).join(' ')} for Kids!`,
        reason: `These words appear in top-performing titles (from ${topWords.length} analyzed)`,
        expectedCtrBoost: 1.1,
      });
    }

    return recommendations;
  }

  /** Project growth based on current metrics and content plan */
  projectGrowth(params: {
    currentSubscribers: number;
    currentWeeklyViews: number;
    currentTotalViews: number;
    uploadsPerWeek: number;
    avgViewsPerVideo: number;
    weeksToProject: number;
  }): GrowthProjection[] {
    const projections: GrowthProjection[] = [];

    // Growth model based on kids channel patterns:
    // - Subscribers grow ~2-5% per week for active channels
    // - Views compound as library grows (old videos keep getting views)
    // - Higher upload frequency = faster initial growth
    const weeklySubGrowthRate = Math.min(
      0.05,
      0.01 + (params.uploadsPerWeek * 0.005),
    );

    // Library effect: each video continues earning ~20% of first-week views
    const libraryMultiplier = 0.2;

    let subs = params.currentSubscribers;
    let weeklyViews = params.currentWeeklyViews;
    let totalViews = params.currentTotalViews;
    let totalVideos = 0;

    for (let week = 1; week <= params.weeksToProject; week++) {
      totalVideos += params.uploadsPerWeek;

      // New video views
      const newVideoViews = params.uploadsPerWeek * params.avgViewsPerVideo;

      // Library views (old videos accumulating views)
      const libraryViews = totalVideos * params.avgViewsPerVideo * libraryMultiplier;

      weeklyViews = newVideoViews + libraryViews;
      totalViews += weeklyViews;
      subs = Math.round(subs * (1 + weeklySubGrowthRate));

      // Confidence decreases over time
      const confidence = Math.max(0.3, 1 - (week * 0.02));

      if (week === 4 || week === 8 || week === 12 || week === 24 || week === 52) {
        projections.push({
          weeksOut: week,
          projectedSubscribers: subs,
          projectedWeeklyViews: Math.round(weeklyViews),
          projectedTotalViews: Math.round(totalViews),
          confidence: Math.round(confidence * 100) / 100,
        });
      }
    }

    this.logger.info(
      { weeks: params.weeksToProject, projections: projections.length },
      'Growth projections generated',
    );

    return projections;
  }

  private calculatePercentile(value: number, sortedValues: number[]): number {
    if (sortedValues.length === 0) return 50;
    const below = sortedValues.filter(v => v < value).length;
    return Math.round((below / sortedValues.length) * 100);
  }

  private getTopicSuggestion(category: ContentCategory, patterns: PatternFinding[]): string {
    const topicMap: Record<string, string> = {
      nursery_rhyme: 'modern nursery rhymes with educational twists',
      song: 'interactive counting and alphabet songs',
      educational: 'STEM concepts for preschoolers',
      story: 'character-driven moral stories',
      animation: 'educational cartoon series',
      roleplay: 'profession roleplay (doctor, firefighter)',
      challenge: 'educational challenges and quizzes',
      unboxing: 'educational toy reviews',
    };
    return topicMap[category] ?? 'educational kids content';
  }

  private formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return n.toString();
  }
}
