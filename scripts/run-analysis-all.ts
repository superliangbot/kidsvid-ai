#!/usr/bin/env tsx
/**
 * Multi-channel deep analysis against all 10 target channels.
 * Saves to DB + generates competitive analysis report.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { createLogger, YouTubeClient, getDb } from '../packages/shared/src/index.js';
import { ChannelScraper } from '../packages/analyzer/src/scraper.js';
import { detectPatterns } from '../packages/analyzer/src/patterns.js';
import { computeEngagementStats, buildChannelAnalysis, rankChannels, findViralOutliers } from '../packages/analyzer/src/engagement.js';
import { categorizeChannel } from '../packages/analyzer/src/categorizer.js';
import { StrategyEngine } from '../packages/analyzer/src/strategy-engine.js';
import { analysisRuns, analysisPatterns, eq } from '../packages/shared/src/db/index.js';
import * as fs from 'fs';

const logger = createLogger('deep-analysis', 'info');

const TARGET_CHANNELS = [
  { name: 'Cocomelon', channelId: 'UCbCmjCuTUZos6Inko4u57UQ' },
  { name: 'Kids Diana Show', channelId: 'UCk8GzjMOrta8yxDcKfylJYw' },
  { name: 'Like Nastya', channelId: 'UCJplp5SjeGSdVdwsfb9Q7lQ' },
  { name: 'Vlad and Niki', channelId: 'UCvlE5gTbOvjiolFlEm-c_Ow' },
  { name: 'Pinkfong', channelId: 'UCcdwLMPsaU2ezNSJU1nFoBQ' },
  { name: 'Numberblocks', channelId: 'UCPlwvN0w4qFSP1FllALB92w' },
  { name: 'Blippi', channelId: 'UC5PYHgAzJ1wLEidB58SK6Xw' },
  { name: 'Hey Bear Sensory', channelId: 'UCtf9cFBJkHVAf2qMqF01xYg' },
  { name: 'Super Simple Songs', channelId: 'UCLsooMJoIpl_7ux2jvdPB-Q' },
  { name: 'Bluey', channelId: 'UCVzLLZkDuFGAE2BGdBuBNBg' },
];

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY!;
  const dbUrl = process.env.DATABASE_URL!;
  if (!apiKey || !dbUrl) { console.error('Missing keys'); process.exit(1); }

  const youtube = new YouTubeClient({ apiKey, maxQuotaPerRun: 9000 });
  const db = getDb(dbUrl);
  const strategy = new StrategyEngine(logger);

  logger.info('═══════════════════════════════════════════════════');
  logger.info('MULTI-CHANNEL DEEP ANALYSIS — 10 Kids YouTube Channels');
  logger.info(`Channels: ${TARGET_CHANNELS.map(c => c.name).join(', ')}`);
  logger.info('═══════════════════════════════════════════════════\n');

  // Create analysis run record
  const [run] = await db.insert(analysisRuns).values({ startedAt: new Date(), status: 'running' }).returning();

  // Step 1: Scrape all channels
  logger.info('📡 Step 1: Scraping all channels...');
  const scraper = new ChannelScraper(youtube, db, logger);
  const result = await scraper.scrape({
    channelIds: TARGET_CHANNELS.map(c => c.channelId),
    videosPerChannel: 30,
  });
  logger.info(`✓ ${result.channels.length} channels, ${result.videos.length} videos (quota: ${result.quotaUsed})`);

  // Step 2: Detect patterns
  logger.info('\n🔍 Step 2: Detecting patterns...');
  const patterns = detectPatterns({ videos: result.videos, categories: result.categories });
  logger.info(`✓ ${patterns.length} patterns detected`);

  // Store patterns in DB
  for (const p of patterns) {
    await db.insert(analysisPatterns).values({
      patternType: p.patternType,
      category: p.category,
      finding: p.finding,
      confidence: p.confidence,
      sampleSize: p.sampleSize,
      metadata: p.metadata,
    });
  }

  // Step 3: Engagement analysis
  logger.info('\n📊 Step 3: Engagement analysis...');
  const stats = computeEngagementStats(result.videos);

  const videosByChannel = new Map<string, typeof result.videos>();
  for (const v of result.videos) {
    const list = videosByChannel.get(v.channelId) || [];
    list.push(v);
    videosByChannel.set(v.channelId, list);
  }

  const channelAnalyses = result.channels.map(ch => {
    const vids = videosByChannel.get(ch.channelId) || [];
    return buildChannelAnalysis(ch.channelId, ch.name, vids, categorizeChannel(vids));
  });

  const ranked = rankChannels(channelAnalyses);
  const outliers = findViralOutliers(result.videos, result.categories);

  // Print rankings
  logger.info('\n🏆 Channel Rankings:');
  for (const ch of ranked) {
    logger.info(`  #${ch.rank} ${ch.name} — ${ch.primaryCategory}, avg ${fmt(ch.avgViews)} views, ${(ch.engagementRate * 100).toFixed(2)}% eng, ${ch.uploadFrequency.toFixed(1)}/wk`);
  }

  // Step 4: Competitive analysis
  logger.info('\n⚔️  Step 4: Strategy & Competitive Analysis...');

  // Content gaps
  const gaps = strategy.findContentGaps(channelAnalyses, patterns);
  logger.info('\n📋 Content Gaps (opportunities):');
  for (const g of gaps.slice(0, 5)) {
    logger.info(`  [${g.category}] ${g.recommendation}`);
  }

  // Upload schedule
  const schedule = strategy.optimizeUploadSchedule(patterns);
  logger.info('\n📅 Optimal Upload Schedule:');
  for (const s of schedule.slice(0, 3)) {
    logger.info(`  ${s.day} ${s.hourUtc}:00 UTC — ${s.expectedEngagementBoost}x boost`);
  }

  // Title recommendations
  const titles = strategy.generateTitleRecommendations('counting', 'educational', patterns);
  logger.info('\n✏️  Title Templates:');
  for (const t of titles.slice(0, 3)) {
    logger.info(`  "${t.example}" — +${Math.round((t.expectedCtrBoost - 1) * 100)}% CTR`);
  }

  // Viral outliers
  logger.info(`\n🔥 Viral Outliers (${outliers.length} found):`);
  for (const o of outliers.slice(0, 5)) {
    logger.info(`  ${o.viralMultiplier}x — "${o.video.title}" (${fmt(o.video.viewCount)} views)`);
  }

  // Key patterns
  logger.info('\n🧩 Key Patterns:');
  for (const p of patterns.filter(p => p.confidence >= 0.7 && !p.category).slice(0, 8)) {
    logger.info(`  [${p.patternType}] ${p.finding.slice(0, 130)}`);
  }

  // Update analysis run
  await db.update(analysisRuns).set({
    completedAt: new Date(),
    channelsAnalyzed: result.channels.length,
    videosAnalyzed: result.videos.length,
    patternsFound: patterns.length,
    apiQuotaUsed: result.quotaUsed,
    status: 'completed',
  }).where(eq(analysisRuns.id, run.id));

  // Write to JSON
  const output = {
    timestamp: new Date().toISOString(),
    channels: ranked,
    engagementStats: stats,
    viralOutliers: outliers.slice(0, 20).map(o => ({ title: o.video.title, views: o.video.viewCount, multiplier: o.viralMultiplier, category: o.category })),
    contentGaps: gaps,
    patterns: patterns.filter(p => p.confidence >= 0.7),
    uploadSchedule: schedule.slice(0, 5),
    titleRecommendations: titles,
    quotaUsed: result.quotaUsed,
  };
  fs.writeFileSync(resolve(process.cwd(), 'analysis-results.json'), JSON.stringify(output, null, 2));

  logger.info('\n═══════════════════════════════════════════════════');
  logger.info('ANALYSIS COMPLETE');
  logger.info(`${result.channels.length} channels, ${result.videos.length} videos, ${patterns.length} patterns`);
  logger.info(`API quota: ${result.quotaUsed}/9000`);
  logger.info('Results written to analysis-results.json');
  logger.info('═══════════════════════════════════════════════════');

  process.exit(0);
}

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

main().catch((err) => { logger.error({ err }, 'Analysis failed'); process.exit(1); });
