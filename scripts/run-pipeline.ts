#!/usr/bin/env tsx
/**
 * End-to-end pipeline: real YouTube data → analysis → script generation → quality check → DB save
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { createLogger, YouTubeClient, getDb } from '../packages/shared/src/index.js';
import type { ScriptRequest } from '../packages/shared/src/types.js';
import { generatedVideos } from '../packages/shared/src/db/index.js';
import { categorizeVideo, categorizeChannel } from '../packages/analyzer/src/categorizer.js';
import { detectPatterns } from '../packages/analyzer/src/patterns.js';
import { computeEngagementStats, buildChannelAnalysis, rankChannels } from '../packages/analyzer/src/engagement.js';
import { ScriptGenerator } from '../packages/generator/src/script-generator.js';

const logger = createLogger('pipeline-runner', 'info');

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY!;
  const anthropicKey = process.env.ANTHROPIC_API_KEY!;
  const dbUrl = process.env.DATABASE_URL!;

  if (!apiKey || !anthropicKey || !dbUrl) {
    console.error('Missing YOUTUBE_API_KEY, ANTHROPIC_API_KEY, or DATABASE_URL');
    process.exit(1);
  }

  const youtube = new YouTubeClient({ apiKey, maxQuotaPerRun: 500 });
  const db = getDb(dbUrl);

  // ─── Step 1: Fetch real Cocomelon data ───
  logger.info('═══ Step 1: Fetching Cocomelon from YouTube API ═══');
  const COCOMELON_ID = 'UCbCmjCuTUZos6Inko4u57UQ';

  const [channelInfo] = await youtube.getChannelsBatch([COCOMELON_ID]);
  logger.info(`Channel: ${channelInfo.name} (${channelInfo.subscriberCount.toLocaleString()} subs, ${channelInfo.viewCount.toLocaleString()} views)`);

  const videos = await youtube.getChannelVideos(COCOMELON_ID, 10);
  logger.info(`Fetched ${videos.length} videos (quota used: ${youtube.totalQuotaUsed})`);

  for (const v of videos.slice(0, 5)) {
    logger.info(`  "${v.title}" — ${v.viewCount.toLocaleString()} views, ${Math.round(v.duration / 60)}min`);
  }

  // ─── Step 2: Analyze ───
  logger.info('\n═══ Step 2: Running analysis ═══');
  const categories = new Map<string, ReturnType<typeof categorizeVideo>>();
  for (const v of videos) categories.set(v.videoId, categorizeVideo(v));

  const channelCat = categorizeChannel(videos);
  logger.info(`Channel category: ${channelCat.category} (confidence: ${channelCat.confidence.toFixed(2)})`);

  const patterns = detectPatterns({ videos, categories });
  logger.info(`Detected ${patterns.length} patterns`);

  const highConf = patterns.filter(p => p.confidence >= 0.7 && !p.category);
  for (const p of highConf.slice(0, 5)) {
    logger.info(`  [${p.patternType}] ${p.finding.slice(0, 120)}`);
  }

  const stats = computeEngagementStats(videos);
  logger.info(`Avg views: ${Math.round(stats.avgViews).toLocaleString()}, engagement: ${(stats.avgEngagementRate * 100).toFixed(2)}%`);

  const analysis = buildChannelAnalysis(COCOMELON_ID, channelInfo.name, videos, channelCat);
  const [ranked] = rankChannels([analysis]);
  logger.info(`Rank score: ${ranked.score.toFixed(3)}`);

  // ─── Step 3: Generate script with Claude ───
  logger.info('\n═══ Step 3: Generating educational script via Claude ═══');
  const generator = new ScriptGenerator({ anthropicApiKey: anthropicKey, maxRetries: 1 }, logger);

  const request: ScriptRequest = {
    category: 'educational',
    educationalCategory: 'early_math',
    educationalObjective: 'Learn to count from 1 to 5 using fun objects',
    engagementHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'direct_address'],
    targetDuration: 150,
    ageBracket: '2-4',
    characterIds: [0], // Cosmo
    topic: 'counting to 5',
    seriesName: 'Counting Adventures',
    episodeNumber: 1,
  };

  const script = await generator.generate(request);
  logger.info(`Title: "${script.title}"`);
  logger.info(`Duration: ${script.estimatedDuration}s`);
  logger.info(`Tags: ${script.tags.slice(0, 5).join(', ')}`);
  logger.info(`Takeaways: ${script.learningTakeaways.join('; ')}`);

  // ─── Step 4: Quality check ───
  logger.info('\n═══ Step 4: Quality scoring ═══');
  const quality = script.qualityScore;
  logger.info(`Educational value: ${quality.educationalValue}/10`);
  logger.info(`Engagement potential: ${quality.engagementPotential}/10`);
  logger.info(`Passed: ${quality.passed ? '✓ YES' : '✗ NO'}`);
  if (quality.feedback.length > 0) {
    for (const f of quality.feedback) logger.info(`  Feedback: ${f}`);
  }

  // ─── Step 5: Save to DB ───
  logger.info('\n═══ Step 5: Saving to database ═══');
  const [saved] = await db.insert(generatedVideos).values({
    title: script.title,
    description: script.description,
    script: script.script,
    category: 'educational',
    targetDuration: script.estimatedDuration,
    targetAgeMin: 2,
    targetAgeMax: 4,
    characters: request.characterIds,
    tags: script.tags,
    seriesId: 'counting-adventures-s1',
    episodeNumber: 1,
    status: quality.passed ? 'script_ready' : 'draft',
    generationMetadata: {
      qualityScore: quality,
      educationalObjective: script.educationalObjective,
      learningTakeaways: script.learningTakeaways,
      engagementHooks: script.engagementHooks,
      analysisSource: 'cocomelon',
      videosAnalyzed: videos.length,
      patternsUsed: patterns.length,
    },
  }).returning();

  logger.info(`Saved to generated_videos id=${saved.id}, status=${saved.status}`);

  // ─── Summary ───
  logger.info('\n═══════════════════════════════════════');
  logger.info('PIPELINE COMPLETE');
  logger.info('═══════════════════════════════════════');
  logger.info(`YouTube: ${channelInfo.name}, ${videos.length} videos analyzed`);
  logger.info(`Patterns: ${patterns.length} detected`);
  logger.info(`Script: "${script.title}"`);
  logger.info(`Quality: edu=${quality.educationalValue}/10, eng=${quality.engagementPotential}/10, passed=${quality.passed}`);
  logger.info(`DB: saved as id=${saved.id} (${saved.status})`);
  logger.info(`API quota used: ${youtube.totalQuotaUsed}`);

  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'Pipeline failed');
  process.exit(1);
});
