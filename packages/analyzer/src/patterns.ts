import type { ContentCategory, PatternFinding, YouTubeVideoInfo } from '@kidsvid/shared';
import type { CategorizeResult } from './categorizer.js';

/** Detect patterns across kids YouTube videos */

export interface PatternDetectorInput {
  videos: YouTubeVideoInfo[];
  categories: Map<string, CategorizeResult>;
}

export function detectPatterns(input: PatternDetectorInput): PatternFinding[] {
  const { videos, categories } = input;
  if (videos.length === 0) return [];

  const patterns: PatternFinding[] = [];

  patterns.push(...detectTitlePatterns(videos, categories));
  patterns.push(...detectDurationPatterns(videos, categories));
  patterns.push(...detectUploadTimePatterns(videos));
  patterns.push(...detectTagPatterns(videos, categories));
  patterns.push(...detectThumbnailPatterns(videos));
  patterns.push(...detectEngagementCorrelations(videos, categories));

  return patterns;
}

function detectTitlePatterns(
  videos: YouTubeVideoInfo[],
  categories: Map<string, CategorizeResult>,
): PatternFinding[] {
  const findings: PatternFinding[] = [];

  // Title length analysis
  const lengths = videos.map((v) => v.title.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // Correlate title length with views
  const shortTitles = videos.filter((v) => v.title.length <= 40);
  const longTitles = videos.filter((v) => v.title.length > 40);
  const shortAvgViews = shortTitles.length > 0
    ? shortTitles.reduce((s, v) => s + v.viewCount, 0) / shortTitles.length
    : 0;
  const longAvgViews = longTitles.length > 0
    ? longTitles.reduce((s, v) => s + v.viewCount, 0) / longTitles.length
    : 0;

  findings.push({
    patternType: 'title_length',
    category: null,
    finding: `Average title length: ${Math.round(avgLength)} chars. Short titles (<=40) avg ${formatNumber(shortAvgViews)} views vs long titles (>40) avg ${formatNumber(longAvgViews)} views.`,
    confidence: 0.8,
    sampleSize: videos.length,
    metadata: { avgLength: Math.round(avgLength), shortAvgViews, longAvgViews },
  });

  // Emoji in titles
  const withEmoji = videos.filter((v) => hasEmoji(v.title));
  const withoutEmoji = videos.filter((v) => !hasEmoji(v.title));
  const emojiAvgViews = withEmoji.length > 0
    ? withEmoji.reduce((s, v) => s + v.viewCount, 0) / withEmoji.length
    : 0;
  const noEmojiAvgViews = withoutEmoji.length > 0
    ? withoutEmoji.reduce((s, v) => s + v.viewCount, 0) / withoutEmoji.length
    : 0;

  if (withEmoji.length >= 5) {
    findings.push({
      patternType: 'title_emoji',
      category: null,
      finding: `${withEmoji.length}/${videos.length} videos use emoji in title. Emoji avg ${formatNumber(emojiAvgViews)} views vs no-emoji avg ${formatNumber(noEmojiAvgViews)} views.`,
      confidence: withEmoji.length / videos.length > 0.1 ? 0.7 : 0.5,
      sampleSize: videos.length,
      metadata: {
        emojiCount: withEmoji.length,
        emojiPct: Math.round((withEmoji.length / videos.length) * 100),
        emojiAvgViews,
        noEmojiAvgViews,
      },
    });
  }

  // Numbers in titles
  const withNumbers = videos.filter((v) => /\d/.test(v.title));
  if (withNumbers.length >= 5) {
    const numAvgViews = withNumbers.reduce((s, v) => s + v.viewCount, 0) / withNumbers.length;
    findings.push({
      patternType: 'title_numbers',
      category: null,
      finding: `${withNumbers.length}/${videos.length} videos have numbers in title. Avg views: ${formatNumber(numAvgViews)}.`,
      confidence: 0.6,
      sampleSize: withNumbers.length,
      metadata: { count: withNumbers.length, avgViews: numAvgViews },
    });
  }

  // Common title words (top performing)
  const topVideosByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, Math.ceil(videos.length * 0.2));
  const wordFreq = new Map<string, number>();
  for (const v of topVideosByViews) {
    const words = v.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const unique = new Set(words);
    for (const w of unique) {
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
  }
  const topWords = [...wordFreq.entries()]
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  if (topWords.length > 0) {
    findings.push({
      patternType: 'title_keywords',
      category: null,
      finding: `Top performing title words: ${topWords.slice(0, 10).map((w) => `"${w.word}" (${w.count}x)`).join(', ')}.`,
      confidence: 0.7,
      sampleSize: topVideosByViews.length,
      metadata: { topWords },
    });
  }

  // Per-category title patterns
  const byCategory = groupByCategory(videos, categories);
  for (const [cat, catVideos] of byCategory) {
    if (catVideos.length < 5) continue;
    const catAvgLen = catVideos.reduce((s, v) => s + v.title.length, 0) / catVideos.length;
    findings.push({
      patternType: 'title_length',
      category: cat,
      finding: `[${cat}] Average title length: ${Math.round(catAvgLen)} chars across ${catVideos.length} videos.`,
      confidence: 0.7,
      sampleSize: catVideos.length,
      metadata: { avgLength: Math.round(catAvgLen) },
    });
  }

  return findings;
}

function detectDurationPatterns(
  videos: YouTubeVideoInfo[],
  categories: Map<string, CategorizeResult>,
): PatternFinding[] {
  const findings: PatternFinding[] = [];

  // Overall duration distribution
  const durations = videos.filter((v) => v.duration > 0).map((v) => v.duration);
  if (durations.length === 0) return findings;

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const medianDuration = median(durations);

  // Duration buckets and views
  const buckets = [
    { label: 'short (<2min)', min: 0, max: 120 },
    { label: 'medium (2-5min)', min: 120, max: 300 },
    { label: 'long (5-10min)', min: 300, max: 600 },
    { label: 'very_long (>10min)', min: 600, max: Infinity },
  ];

  const bucketStats = buckets.map((b) => {
    const bVideos = videos.filter((v) => v.duration >= b.min && v.duration < b.max);
    return {
      label: b.label,
      count: bVideos.length,
      avgViews: bVideos.length > 0
        ? bVideos.reduce((s, v) => s + v.viewCount, 0) / bVideos.length
        : 0,
    };
  });

  findings.push({
    patternType: 'duration',
    category: null,
    finding: `Average duration: ${formatDuration(avgDuration)}, Median: ${formatDuration(medianDuration)}. Distribution: ${bucketStats.map((b) => `${b.label}: ${b.count} videos, avg ${formatNumber(b.avgViews)} views`).join('; ')}.`,
    confidence: 0.85,
    sampleSize: durations.length,
    metadata: { avgDuration, medianDuration, buckets: bucketStats },
  });

  // Best performing duration range
  const bestBucket = bucketStats.reduce((best, b) =>
    b.avgViews > best.avgViews && b.count >= 5 ? b : best,
    bucketStats[0],
  );

  if (bestBucket.count >= 5) {
    findings.push({
      patternType: 'duration_optimal',
      category: null,
      finding: `Best performing duration range: ${bestBucket.label} with avg ${formatNumber(bestBucket.avgViews)} views (${bestBucket.count} videos).`,
      confidence: 0.8,
      sampleSize: bestBucket.count,
      metadata: { bestBucket },
    });
  }

  // Per-category duration
  const byCategory = groupByCategory(videos, categories);
  for (const [cat, catVideos] of byCategory) {
    const catDurations = catVideos.filter((v) => v.duration > 0).map((v) => v.duration);
    if (catDurations.length < 5) continue;
    const catAvg = catDurations.reduce((a, b) => a + b, 0) / catDurations.length;
    findings.push({
      patternType: 'duration',
      category: cat,
      finding: `[${cat}] Average duration: ${formatDuration(catAvg)} across ${catDurations.length} videos.`,
      confidence: 0.75,
      sampleSize: catDurations.length,
      metadata: { avgDuration: catAvg },
    });
  }

  return findings;
}

function detectUploadTimePatterns(videos: YouTubeVideoInfo[]): PatternFinding[] {
  const findings: PatternFinding[] = [];
  const withDates = videos.filter((v) => v.publishedAt);

  if (withDates.length < 10) return findings;

  // Day of week analysis
  const dayStats = new Map<number, { count: number; totalViews: number }>();
  for (let d = 0; d < 7; d++) {
    dayStats.set(d, { count: 0, totalViews: 0 });
  }

  for (const v of withDates) {
    const date = new Date(v.publishedAt);
    const day = date.getUTCDay();
    const stats = dayStats.get(day)!;
    stats.count++;
    stats.totalViews += v.viewCount;
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayEntries = [...dayStats.entries()]
    .map(([day, stats]) => ({
      day: dayNames[day],
      count: stats.count,
      avgViews: stats.count > 0 ? stats.totalViews / stats.count : 0,
    }))
    .sort((a, b) => b.avgViews - a.avgViews);

  findings.push({
    patternType: 'upload_day',
    category: null,
    finding: `Best upload days by avg views: ${dayEntries.slice(0, 3).map((d) => `${d.day} (${formatNumber(d.avgViews)} avg, ${d.count} uploads)`).join(', ')}.`,
    confidence: 0.65,
    sampleSize: withDates.length,
    metadata: { dayStats: dayEntries },
  });

  // Hour of day analysis
  const hourStats = new Map<number, { count: number; totalViews: number }>();
  for (const v of withDates) {
    const hour = new Date(v.publishedAt).getUTCHours();
    const stats = hourStats.get(hour) || { count: 0, totalViews: 0 };
    stats.count++;
    stats.totalViews += v.viewCount;
    hourStats.set(hour, stats);
  }

  const topHours = [...hourStats.entries()]
    .map(([hour, stats]) => ({
      hour,
      count: stats.count,
      avgViews: stats.count > 0 ? stats.totalViews / stats.count : 0,
    }))
    .filter((h) => h.count >= 3)
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 5);

  if (topHours.length > 0) {
    findings.push({
      patternType: 'upload_hour',
      category: null,
      finding: `Best upload hours (UTC): ${topHours.map((h) => `${h.hour}:00 (${formatNumber(h.avgViews)} avg, ${h.count} uploads)`).join(', ')}.`,
      confidence: 0.6,
      sampleSize: withDates.length,
      metadata: { topHours },
    });
  }

  // Upload frequency (videos per week, estimated from recent uploads)
  const sorted = [...withDates].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  if (sorted.length >= 10) {
    const recent = sorted.slice(0, 20);
    const firstDate = new Date(recent[recent.length - 1].publishedAt).getTime();
    const lastDate = new Date(recent[0].publishedAt).getTime();
    const weeks = (lastDate - firstDate) / (7 * 24 * 3600_000);
    if (weeks > 0) {
      const freq = recent.length / weeks;
      findings.push({
        patternType: 'upload_frequency',
        category: null,
        finding: `Estimated upload frequency: ${freq.toFixed(1)} videos/week (from ${recent.length} most recent videos).`,
        confidence: 0.7,
        sampleSize: recent.length,
        metadata: { videosPerWeek: Math.round(freq * 10) / 10 },
      });
    }
  }

  return findings;
}

function detectTagPatterns(
  videos: YouTubeVideoInfo[],
  categories: Map<string, CategorizeResult>,
): PatternFinding[] {
  const findings: PatternFinding[] = [];
  const videosWithTags = videos.filter((v) => v.tags.length > 0);

  if (videosWithTags.length < 5) return findings;

  // Tag frequency across all videos
  const tagFreq = new Map<string, { count: number; totalViews: number }>();
  for (const v of videosWithTags) {
    for (const tag of v.tags) {
      const lower = tag.toLowerCase();
      const entry = tagFreq.get(lower) || { count: 0, totalViews: 0 };
      entry.count++;
      entry.totalViews += v.viewCount;
      tagFreq.set(lower, entry);
    }
  }

  const topTags = [...tagFreq.entries()]
    .filter(([, stats]) => stats.count >= 3)
    .map(([tag, stats]) => ({
      tag,
      count: stats.count,
      avgViews: stats.totalViews / stats.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  if (topTags.length > 0) {
    findings.push({
      patternType: 'tags_popular',
      category: null,
      finding: `Most used tags: ${topTags.slice(0, 15).map((t) => `"${t.tag}" (${t.count}x, avg ${formatNumber(t.avgViews)} views)`).join(', ')}.`,
      confidence: 0.75,
      sampleSize: videosWithTags.length,
      metadata: { topTags },
    });
  }

  // Tags with highest avg views
  const highPerformingTags = [...tagFreq.entries()]
    .filter(([, stats]) => stats.count >= 5)
    .map(([tag, stats]) => ({
      tag,
      count: stats.count,
      avgViews: stats.totalViews / stats.count,
    }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 15);

  if (highPerformingTags.length > 0) {
    findings.push({
      patternType: 'tags_high_performing',
      category: null,
      finding: `Highest performing tags (by avg views): ${highPerformingTags.slice(0, 10).map((t) => `"${t.tag}" (${formatNumber(t.avgViews)} avg, ${t.count}x)`).join(', ')}.`,
      confidence: 0.7,
      sampleSize: highPerformingTags.reduce((s, t) => s + t.count, 0),
      metadata: { highPerformingTags },
    });
  }

  // Avg tags per video
  const avgTagCount = videosWithTags.reduce((s, v) => s + v.tags.length, 0) / videosWithTags.length;
  findings.push({
    patternType: 'tags_count',
    category: null,
    finding: `Average ${Math.round(avgTagCount)} tags per video. ${videosWithTags.length}/${videos.length} videos have tags.`,
    confidence: 0.8,
    sampleSize: videosWithTags.length,
    metadata: { avgTagCount: Math.round(avgTagCount), videosWithTags: videosWithTags.length },
  });

  // Per-category tags
  const byCategory = groupByCategory(videosWithTags, categories);
  for (const [cat, catVideos] of byCategory) {
    if (catVideos.length < 5) continue;
    const catTagFreq = new Map<string, number>();
    for (const v of catVideos) {
      for (const tag of v.tags) {
        const lower = tag.toLowerCase();
        catTagFreq.set(lower, (catTagFreq.get(lower) || 0) + 1);
      }
    }
    const catTopTags = [...catTagFreq.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    findings.push({
      patternType: 'tags_popular',
      category: cat,
      finding: `[${cat}] Top tags: ${catTopTags.map((t) => `"${t.tag}" (${t.count}x)`).join(', ')}.`,
      confidence: 0.7,
      sampleSize: catVideos.length,
      metadata: { topTags: catTopTags },
    });
  }

  return findings;
}

function detectThumbnailPatterns(videos: YouTubeVideoInfo[]): PatternFinding[] {
  // We can't analyze actual thumbnail images without vision, but we can correlate
  // metadata patterns
  const findings: PatternFinding[] = [];

  // Title has ALL CAPS words — often correlates with eye-catching thumbnails
  const withCaps = videos.filter((v) => /[A-Z]{3,}/.test(v.title));
  if (withCaps.length >= 5) {
    const capsAvgViews = withCaps.reduce((s, v) => s + v.viewCount, 0) / withCaps.length;
    const noCapsAvgViews =
      videos.filter((v) => !/[A-Z]{3,}/.test(v.title)).reduce((s, v) => s + v.viewCount, 0) /
      Math.max(videos.length - withCaps.length, 1);

    findings.push({
      patternType: 'thumbnail_caps',
      category: null,
      finding: `${withCaps.length} videos use ALL CAPS in title (thumbnail text proxy). Caps avg ${formatNumber(capsAvgViews)} views vs no-caps avg ${formatNumber(noCapsAvgViews)} views.`,
      confidence: 0.5,
      sampleSize: videos.length,
      metadata: { capsCount: withCaps.length, capsAvgViews, noCapsAvgViews },
    });
  }

  return findings;
}

function detectEngagementCorrelations(
  videos: YouTubeVideoInfo[],
  categories: Map<string, CategorizeResult>,
): PatternFinding[] {
  const findings: PatternFinding[] = [];

  // Overall engagement stats
  const withViews = videos.filter((v) => v.viewCount > 0);
  if (withViews.length === 0) return findings;

  const engagementRates = withViews.map((v) => ({
    rate: (v.likeCount + v.commentCount) / v.viewCount,
    views: v.viewCount,
    videoId: v.videoId,
  }));

  const avgEngagement =
    engagementRates.reduce((s, e) => s + e.rate, 0) / engagementRates.length;

  findings.push({
    patternType: 'engagement_rate',
    category: null,
    finding: `Average engagement rate (likes+comments/views): ${(avgEngagement * 100).toFixed(2)}% across ${withViews.length} videos.`,
    confidence: 0.85,
    sampleSize: withViews.length,
    metadata: { avgEngagementRate: avgEngagement },
  });

  // Per-category engagement
  const byCategory = groupByCategory(withViews, categories);
  for (const [cat, catVideos] of byCategory) {
    if (catVideos.length < 5) continue;
    const catRate =
      catVideos.reduce(
        (s, v) => s + (v.likeCount + v.commentCount) / Math.max(v.viewCount, 1),
        0,
      ) / catVideos.length;
    const catAvgViews = catVideos.reduce((s, v) => s + v.viewCount, 0) / catVideos.length;

    findings.push({
      patternType: 'engagement_rate',
      category: cat,
      finding: `[${cat}] Engagement rate: ${(catRate * 100).toFixed(2)}%, avg views: ${formatNumber(catAvgViews)} (${catVideos.length} videos).`,
      confidence: 0.75,
      sampleSize: catVideos.length,
      metadata: { engagementRate: catRate, avgViews: catAvgViews },
    });
  }

  return findings;
}

// ─── Helpers ───

function groupByCategory(
  videos: YouTubeVideoInfo[],
  categories: Map<string, CategorizeResult>,
): Map<ContentCategory, YouTubeVideoInfo[]> {
  const groups = new Map<ContentCategory, YouTubeVideoInfo[]>();
  for (const v of videos) {
    const cat = categories.get(v.videoId)?.category || 'other';
    const list = groups.get(cat) || [];
    list.push(v);
    groups.set(cat, list);
  }
  return groups;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s}s`;
}

function hasEmoji(str: string): boolean {
  // Simple emoji detection
  return /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(
    str,
  );
}
