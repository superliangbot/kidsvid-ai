#!/usr/bin/env tsx
/**
 * Run analysis against 10 specific kids YouTube channels.
 * Uses the YouTube Data API to fetch real data, then runs the full
 * analysis pipeline: scrape → categorize → detect patterns → engagement analysis.
 */

import { createLogger, YouTubeClient, getDb } from '@kidsvid/shared';
import { config } from 'dotenv';
import { resolve } from 'path';
import { ChannelScraper } from './scraper.js';
import { detectPatterns } from './patterns.js';
import {
  computeEngagementStats,
  buildChannelAnalysis,
  rankChannels,
  findViralOutliers,
} from './engagement.js';
import { categorizeChannel } from './categorizer.js';

config({ path: resolve(process.cwd(), '.env') });

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
  const apiKey = process.env.YOUTUBE_API_KEY;
  const dbUrl = process.env.DATABASE_URL;

  if (!apiKey) {
    console.error('YOUTUBE_API_KEY required');
    process.exit(1);
  }
  if (!dbUrl) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const logger = createLogger('analysis-runner', 'info');
  const youtube = new YouTubeClient({ apiKey, maxQuotaPerRun: 9000 });
  const db = getDb(dbUrl);

  const channelIds = TARGET_CHANNELS.map((c) => c.channelId);
  const videosPerChannel = 30; // 30 videos per channel to stay within quota

  logger.info('═══════════════════════════════════════════════════');
  logger.info('KidsVid-AI: YouTube Kids Channel Analysis');
  logger.info(`Channels: ${TARGET_CHANNELS.map((c) => c.name).join(', ')}`);
  logger.info(`Videos per channel: ${videosPerChannel}`);
  logger.info('═══════════════════════════════════════════════════');

  // Step 1: Scrape channels and videos
  logger.info('\n📡 Step 1: Scraping channels from YouTube API...');
  const scraper = new ChannelScraper(youtube, db, logger);
  const scrapeResult = await scraper.scrape({
    channelIds,
    videosPerChannel,
  });

  logger.info(`✓ Scraped ${scrapeResult.channels.length} channels, ${scrapeResult.videos.length} videos`);
  logger.info(`  Quota used: ${scrapeResult.quotaUsed}/9000`);

  // Step 2: Detect patterns
  logger.info('\n🔍 Step 2: Detecting patterns...');
  const patterns = detectPatterns({
    videos: scrapeResult.videos,
    categories: scrapeResult.categories,
  });
  logger.info(`✓ Found ${patterns.length} patterns`);

  // Step 3: Engagement analysis
  logger.info('\n📊 Step 3: Analyzing engagement...');
  const engagementStats = computeEngagementStats(scrapeResult.videos);

  // Build per-channel analyses
  const channelAnalyses = [];
  const videosByChannel = new Map<string, typeof scrapeResult.videos>();
  for (const video of scrapeResult.videos) {
    const list = videosByChannel.get(video.channelId) || [];
    list.push(video);
    videosByChannel.set(video.channelId, list);
  }

  for (const channel of scrapeResult.channels) {
    const channelVids = videosByChannel.get(channel.channelId) || [];
    const channelCat = categorizeChannel(channelVids);
    channelAnalyses.push(
      buildChannelAnalysis(channel.channelId, channel.name, channelVids, channelCat),
    );
  }

  const ranked = rankChannels(channelAnalyses);
  const outliers = findViralOutliers(scrapeResult.videos, scrapeResult.categories);

  // Print results
  logger.info('\n═══════════════════════════════════════════════════');
  logger.info('ANALYSIS RESULTS');
  logger.info('═══════════════════════════════════════════════════');

  logger.info('\n📈 Global Engagement Stats:');
  logger.info(`  Total videos analyzed: ${engagementStats.totalVideos}`);
  logger.info(`  Total views: ${formatBigNumber(engagementStats.totalViews)}`);
  logger.info(`  Average views: ${formatBigNumber(engagementStats.avgViews)}`);
  logger.info(`  Median views: ${formatBigNumber(engagementStats.medianViews)}`);
  logger.info(`  Average engagement rate: ${(engagementStats.avgEngagementRate * 100).toFixed(2)}%`);
  logger.info(`  Top 10% avg views: ${formatBigNumber(engagementStats.top10PctAvgViews)}`);
  logger.info(`  Bottom 10% avg views: ${formatBigNumber(engagementStats.bottom10PctAvgViews)}`);

  logger.info('\n🏆 Channel Rankings:');
  for (const ch of ranked) {
    logger.info(
      `  #${ch.rank} ${ch.name} — ${ch.primaryCategory}, avg views: ${formatBigNumber(ch.avgViews)}, engagement: ${(ch.engagementRate * 100).toFixed(2)}%, freq: ${ch.uploadFrequency} vids/wk, score: ${ch.score.toFixed(3)}`,
    );
  }

  logger.info(`\n🔥 Viral Outliers (>3x average views): ${outliers.length} found`);
  for (const o of outliers.slice(0, 10)) {
    logger.info(
      `  ${o.viralMultiplier}x — "${o.video.title}" (${formatBigNumber(o.video.viewCount)} views, ${o.category})`,
    );
  }

  logger.info('\n🧩 Key Patterns (high confidence):');
  const highConf = patterns
    .filter((p) => p.confidence >= 0.7 && !p.category)
    .slice(0, 15);
  for (const p of highConf) {
    logger.info(`  [${p.patternType}] ${p.finding}`);
  }

  logger.info('\n📂 Category-specific patterns:');
  const catPatterns = patterns.filter((p) => p.category && p.confidence >= 0.7);
  for (const p of catPatterns.slice(0, 10)) {
    logger.info(`  [${p.patternType}] ${p.finding}`);
  }

  logger.info('\n═══════════════════════════════════════════════════');
  logger.info(`COMPLETE — ${scrapeResult.channels.length} channels, ${scrapeResult.videos.length} videos, ${patterns.length} patterns`);
  logger.info(`API quota used: ${scrapeResult.quotaUsed}/9000`);
  logger.info('═══════════════════════════════════════════════════');

  // Write results to JSON file for reference
  const results = {
    timestamp: new Date().toISOString(),
    channels: ranked,
    engagementStats,
    viralOutliers: outliers.slice(0, 20).map((o) => ({
      title: o.video.title,
      views: o.video.viewCount,
      multiplier: o.viralMultiplier,
      category: o.category,
    })),
    patterns: highConf,
    quotaUsed: scrapeResult.quotaUsed,
  };

  const fs = await import('fs');
  fs.writeFileSync(
    resolve(process.cwd(), 'analysis-results.json'),
    JSON.stringify(results, null, 2),
  );
  logger.info('\nResults written to analysis-results.json');

  process.exit(0);
}

function formatBigNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

main().catch((err) => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
