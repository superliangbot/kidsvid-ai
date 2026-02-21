import {
  type YouTubeClient,
  type YouTubeChannelInfo,
  type YouTubeVideoInfo,
  QuotaExhaustedError,
  TOP_KIDS_CHANNELS,
  type Logger,
} from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { channels, videos, eq } from '@kidsvid/shared/db';
import { categorizeVideo, categorizeChannel, type CategorizeResult } from './categorizer.js';

export interface ScraperOptions {
  videosPerChannel?: number;
  channelIds?: string[];
  skipExisting?: boolean;
}

export interface ScraperResult {
  channels: YouTubeChannelInfo[];
  videos: YouTubeVideoInfo[];
  categories: Map<string, CategorizeResult>;
  quotaUsed: number;
}

export class ChannelScraper {
  constructor(
    private youtube: YouTubeClient,
    private db: Database,
    private logger: Logger,
  ) {}

  async scrape(options: ScraperOptions = {}): Promise<ScraperResult> {
    const {
      videosPerChannel = 50,
      channelIds = TOP_KIDS_CHANNELS.map((c) => c.channelId),
      skipExisting = false,
    } = options;

    // Deduplicate channel IDs
    const uniqueIds = [...new Set(channelIds)];

    this.logger.info(
      { channelCount: uniqueIds.length, videosPerChannel },
      'Starting channel scrape',
    );

    const allChannels: YouTubeChannelInfo[] = [];
    const allVideos: YouTubeVideoInfo[] = [];
    const allCategories = new Map<string, CategorizeResult>();

    // Fetch channel info in batch
    let channelInfos: YouTubeChannelInfo[];
    try {
      channelInfos = await this.youtube.getChannelsBatch(uniqueIds);
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        this.logger.warn('Quota exhausted during channel fetch');
        return { channels: allChannels, videos: allVideos, categories: allCategories, quotaUsed: this.youtube.totalQuotaUsed };
      }
      throw err;
    }

    this.logger.info({ fetched: channelInfos.length }, 'Fetched channel info');

    // Process each channel
    for (const channelInfo of channelInfos) {
      try {
        // Check if we should skip
        if (skipExisting) {
          const existing = await this.db.query.channels.findFirst({
            where: eq(channels.youtubeChannelId, channelInfo.channelId),
          });
          if (existing?.lastAnalyzedAt) {
            const hoursSince =
              (Date.now() - existing.lastAnalyzedAt.getTime()) / 3600_000;
            if (hoursSince < 24) {
              this.logger.info(
                { channel: channelInfo.name },
                'Skipping recently analyzed channel',
              );
              continue;
            }
          }
        }

        this.logger.info(
          { channel: channelInfo.name, quota: this.youtube.quotaRemaining },
          'Fetching videos',
        );

        // Fetch videos
        let channelVideos: YouTubeVideoInfo[];
        try {
          channelVideos = await this.youtube.getChannelVideos(
            channelInfo.channelId,
            videosPerChannel,
          );
        } catch (err) {
          if (err instanceof QuotaExhaustedError) {
            this.logger.warn({ channel: channelInfo.name }, 'Quota exhausted during video fetch');
            break;
          }
          this.logger.error({ channel: channelInfo.name, err }, 'Failed to fetch videos');
          continue;
        }

        // Categorize videos
        for (const video of channelVideos) {
          const catResult = categorizeVideo(video);
          allCategories.set(video.videoId, catResult);
        }

        // Categorize channel
        const channelCat = categorizeChannel(channelVideos);

        // Store channel in DB
        await this.upsertChannel(channelInfo, channelCat, channelVideos);

        // Store videos in DB
        const channelDbId = await this.getChannelDbId(channelInfo.channelId);
        for (const video of channelVideos) {
          await this.upsertVideo(video, channelDbId, allCategories.get(video.videoId)!);
        }

        allChannels.push(channelInfo);
        allVideos.push(...channelVideos);

        this.logger.info(
          {
            channel: channelInfo.name,
            videos: channelVideos.length,
            category: channelCat.category,
          },
          'Channel processed',
        );
      } catch (err) {
        this.logger.error({ channel: channelInfo.name, err }, 'Error processing channel');
      }
    }

    this.logger.info(
      {
        channels: allChannels.length,
        videos: allVideos.length,
        quotaUsed: this.youtube.totalQuotaUsed,
      },
      'Scrape complete',
    );

    return {
      channels: allChannels,
      videos: allVideos,
      categories: allCategories,
      quotaUsed: this.youtube.totalQuotaUsed,
    };
  }

  private async upsertChannel(
    info: YouTubeChannelInfo,
    category: CategorizeResult,
    channelVideos: YouTubeVideoInfo[],
  ): Promise<void> {
    const avgViews =
      channelVideos.length > 0
        ? channelVideos.reduce((s, v) => s + v.viewCount, 0) / channelVideos.length
        : 0;
    const avgLikes =
      channelVideos.length > 0
        ? channelVideos.reduce((s, v) => s + v.likeCount, 0) / channelVideos.length
        : 0;

    // Calculate engagement rate
    const engagementRates = channelVideos
      .filter((v) => v.viewCount > 0)
      .map((v) => (v.likeCount + v.commentCount) / v.viewCount);
    const engagementRate =
      engagementRates.length > 0
        ? engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length
        : 0;

    // Upload frequency
    let uploadFrequency = 0;
    const sorted = [...channelVideos]
      .filter((v) => v.publishedAt)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    if (sorted.length >= 2) {
      const newest = new Date(sorted[0].publishedAt).getTime();
      const oldest = new Date(sorted[sorted.length - 1].publishedAt).getTime();
      const weeks = (newest - oldest) / (7 * 24 * 3600_000);
      if (weeks > 0) uploadFrequency = sorted.length / weeks;
    }

    const values = {
      youtubeChannelId: info.channelId,
      name: info.name,
      description: info.description,
      subscriberCount: info.subscriberCount,
      videoCount: info.videoCount,
      viewCount: info.viewCount,
      country: info.country,
      thumbnailUrl: info.thumbnailUrl,
      customUrl: info.customUrl,
      primaryCategory: category.category,
      avgViews: Math.round(avgViews),
      avgLikes: Math.round(avgLikes),
      engagementRate,
      uploadFrequency: Math.round(uploadFrequency * 10) / 10,
      lastAnalyzedAt: new Date(),
      updatedAt: new Date(),
    };

    const existing = await this.db.query.channels.findFirst({
      where: eq(channels.youtubeChannelId, info.channelId),
    });

    if (existing) {
      await this.db.update(channels).set(values).where(eq(channels.id, existing.id));
    } else {
      await this.db.insert(channels).values({ ...values, createdAt: new Date() });
    }
  }

  private async upsertVideo(
    video: YouTubeVideoInfo,
    channelDbId: number | null,
    category: CategorizeResult,
  ): Promise<void> {
    const viewCount = video.viewCount;
    const values = {
      youtubeVideoId: video.videoId,
      channelId: channelDbId,
      title: video.title,
      description: video.description?.slice(0, 5000) || '',
      publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
      duration: video.duration,
      viewCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      category: category.category,
      tags: video.tags,
      thumbnailUrl: video.thumbnailUrl,
      defaultLanguage: video.defaultLanguage,
      engagementRate:
        viewCount > 0 ? (video.likeCount + video.commentCount) / viewCount : 0,
      viewsPerDay: video.publishedAt
        ? viewCount / Math.max((Date.now() - new Date(video.publishedAt).getTime()) / 86400_000, 1)
        : null,
      titleLength: video.title.length,
      hasNumbers: /\d/.test(video.title),
      hasEmoji:
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(
          video.title,
        ),
      isShort: video.duration > 0 && video.duration < 60,
    };

    const existing = await this.db.query.videos.findFirst({
      where: eq(videos.youtubeVideoId, video.videoId),
    });

    if (existing) {
      await this.db.update(videos).set(values).where(eq(videos.id, existing.id));
    } else {
      await this.db.insert(videos).values({ ...values, createdAt: new Date() });
    }
  }

  private async getChannelDbId(youtubeChannelId: string): Promise<number | null> {
    const row = await this.db.query.channels.findFirst({
      where: eq(channels.youtubeChannelId, youtubeChannelId),
      columns: { id: true },
    });
    return row?.id ?? null;
  }
}
