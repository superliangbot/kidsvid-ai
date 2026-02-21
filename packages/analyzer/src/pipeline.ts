import {
  type YouTubeClient,
  type AnalysisResult,
  type Logger,
} from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { analysisRuns, analysisPatterns, eq } from '@kidsvid/shared/db';
import { ChannelScraper, type ScraperOptions } from './scraper.js';
import { detectPatterns } from './patterns.js';
import {
  computeEngagementStats,
  buildChannelAnalysis,
  rankChannels,
  findViralOutliers,
} from './engagement.js';
import { categorizeChannel } from './categorizer.js';

export interface AnalysisPipelineOptions extends ScraperOptions {
  /** Run the full pipeline: scrape → categorize → detect patterns → store */
  storePatterns?: boolean;
}

export class AnalysisPipeline {
  constructor(
    private youtube: YouTubeClient,
    private db: Database,
    private logger: Logger,
  ) {}

  async run(options: AnalysisPipelineOptions = {}): Promise<AnalysisResult> {
    const { storePatterns = true, ...scraperOptions } = options;

    // Create analysis run record
    const [run] = await this.db.insert(analysisRuns).values({
      startedAt: new Date(),
      status: 'running',
    }).returning();

    try {
      // Step 1: Scrape channels and videos
      this.logger.info('Step 1: Scraping channels...');
      const scraper = new ChannelScraper(this.youtube, this.db, this.logger);
      const scrapeResult = await scraper.scrape(scraperOptions);

      this.logger.info(
        {
          channels: scrapeResult.channels.length,
          videos: scrapeResult.videos.length,
        },
        'Scrape complete',
      );

      // Step 2: Detect patterns
      this.logger.info('Step 2: Detecting patterns...');
      const patterns = detectPatterns({
        videos: scrapeResult.videos,
        categories: scrapeResult.categories,
      });

      this.logger.info({ patterns: patterns.length }, 'Patterns detected');

      // Step 3: Engagement analysis
      this.logger.info('Step 3: Analyzing engagement...');
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

      this.logger.info(
        {
          avgViews: Math.round(engagementStats.avgViews),
          avgEngagement: (engagementStats.avgEngagementRate * 100).toFixed(2) + '%',
          topChannel: ranked[0]?.name,
          viralOutliers: outliers.length,
        },
        'Engagement analysis complete',
      );

      // Step 4: Store patterns
      if (storePatterns && patterns.length > 0) {
        this.logger.info('Step 4: Storing patterns...');
        for (const pattern of patterns) {
          await this.db.insert(analysisPatterns).values({
            patternType: pattern.patternType,
            category: pattern.category,
            finding: pattern.finding,
            confidence: pattern.confidence,
            sampleSize: pattern.sampleSize,
            metadata: pattern.metadata,
          });
        }
      }

      // Update run record
      await this.db
        .update(analysisRuns)
        .set({
          completedAt: new Date(),
          channelsAnalyzed: scrapeResult.channels.length,
          videosAnalyzed: scrapeResult.videos.length,
          patternsFound: patterns.length,
          apiQuotaUsed: scrapeResult.quotaUsed,
          status: 'completed',
        })
        .where(eq(analysisRuns.id, run.id));

      // Log summary
      this.logger.info('═══ Analysis Summary ═══');
      this.logger.info(`Channels analyzed: ${scrapeResult.channels.length}`);
      this.logger.info(`Videos analyzed: ${scrapeResult.videos.length}`);
      this.logger.info(`Patterns found: ${patterns.length}`);
      this.logger.info(`API quota used: ${scrapeResult.quotaUsed}`);
      this.logger.info(`Top channels:`);
      for (const ch of ranked.slice(0, 5)) {
        this.logger.info(
          `  #${ch.rank} ${ch.name} — ${ch.primaryCategory}, avg views: ${ch.avgViews}, engagement: ${(ch.engagementRate * 100).toFixed(2)}%`,
        );
      }

      return {
        channelsAnalyzed: scrapeResult.channels.length,
        videosAnalyzed: scrapeResult.videos.length,
        patterns,
        apiQuotaUsed: scrapeResult.quotaUsed,
      };
    } catch (err) {
      // Update run as failed
      this.logger.error({ err }, 'Analysis pipeline failed');
      throw err;
    }
  }
}
