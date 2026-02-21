import { createLogger, type Logger } from '../logger.js';
import type { YouTubeChannelInfo, YouTubeVideoInfo } from '../types.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// API quota costs: https://developers.google.com/youtube/v3/determine_quota_cost
const QUOTA_COSTS = {
  'channels.list': 1,
  'search.list': 100,
  'videos.list': 1,
  'playlistItems.list': 1,
} as const;

export interface YouTubeClientOptions {
  apiKey: string;
  maxQuotaPerRun?: number; // default 9000 (of 10000 daily limit, leaving buffer)
}

export class YouTubeClient {
  private apiKey: string;
  private quotaUsed = 0;
  private maxQuota: number;
  private logger: Logger;
  private cache = new Map<string, { data: unknown; expiry: number }>();
  private cacheTtl = 3600_000; // 1 hour

  constructor(options: YouTubeClientOptions) {
    this.apiKey = options.apiKey;
    this.maxQuota = options.maxQuotaPerRun ?? 9000;
    this.logger = createLogger('youtube-client');
  }

  get quotaRemaining(): number {
    return this.maxQuota - this.quotaUsed;
  }

  get totalQuotaUsed(): number {
    return this.quotaUsed;
  }

  private checkQuota(cost: number): void {
    if (this.quotaUsed + cost > this.maxQuota) {
      throw new QuotaExhaustedError(
        `Would exceed quota: used ${this.quotaUsed}, cost ${cost}, max ${this.maxQuota}`,
      );
    }
  }

  private async fetchApi<T>(
    endpoint: string,
    params: Record<string, string>,
    quotaCost: number,
  ): Promise<T> {
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      this.logger.debug({ endpoint }, 'Cache hit');
      return cached.data as T;
    }

    this.checkQuota(quotaCost);

    const url = new URL(`${YOUTUBE_API_BASE}/${endpoint}`);
    url.searchParams.set('key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    this.logger.debug({ endpoint, quotaCost }, 'API request');

    const response = await fetch(url.toString());

    if (!response.ok) {
      const body = await response.text();
      this.logger.error({ status: response.status, body, endpoint }, 'YouTube API error');
      throw new YouTubeApiError(
        `YouTube API error ${response.status}: ${body}`,
        response.status,
      );
    }

    this.quotaUsed += quotaCost;
    const data = (await response.json()) as T;

    this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheTtl });

    return data;
  }

  async getChannel(channelId: string): Promise<YouTubeChannelInfo> {
    const data = await this.fetchApi<YouTubeChannelListResponse>(
      'channels',
      {
        part: 'snippet,statistics',
        id: channelId,
      },
      QUOTA_COSTS['channels.list'],
    );

    if (!data.items?.length) {
      throw new NotFoundError(`Channel not found: ${channelId}`);
    }

    const item = data.items[0];
    return {
      channelId: item.id,
      name: item.snippet.title,
      description: item.snippet.description,
      subscriberCount: parseInt(item.statistics.subscriberCount || '0', 10),
      videoCount: parseInt(item.statistics.videoCount || '0', 10),
      viewCount: parseInt(item.statistics.viewCount || '0', 10),
      country: item.snippet.country || '',
      thumbnailUrl: item.snippet.thumbnails?.high?.url || '',
      customUrl: item.snippet.customUrl || '',
      publishedAt: item.snippet.publishedAt,
    };
  }

  async getChannelsBatch(channelIds: string[]): Promise<YouTubeChannelInfo[]> {
    // YouTube allows up to 50 IDs per request
    const results: YouTubeChannelInfo[] = [];
    for (let i = 0; i < channelIds.length; i += 50) {
      const batch = channelIds.slice(i, i + 50);
      const data = await this.fetchApi<YouTubeChannelListResponse>(
        'channels',
        {
          part: 'snippet,statistics',
          id: batch.join(','),
        },
        QUOTA_COSTS['channels.list'],
      );

      for (const item of data.items || []) {
        results.push({
          channelId: item.id,
          name: item.snippet.title,
          description: item.snippet.description,
          subscriberCount: parseInt(item.statistics.subscriberCount || '0', 10),
          videoCount: parseInt(item.statistics.videoCount || '0', 10),
          viewCount: parseInt(item.statistics.viewCount || '0', 10),
          country: item.snippet.country || '',
          thumbnailUrl: item.snippet.thumbnails?.high?.url || '',
          customUrl: item.snippet.customUrl || '',
          publishedAt: item.snippet.publishedAt,
        });
      }
    }
    return results;
  }

  async getChannelVideos(
    channelId: string,
    maxResults = 50,
  ): Promise<YouTubeVideoInfo[]> {
    // First, get upload playlist ID
    const channelData = await this.fetchApi<YouTubeChannelListResponse>(
      'channels',
      {
        part: 'contentDetails',
        id: channelId,
      },
      QUOTA_COSTS['channels.list'],
    );

    if (!channelData.items?.length) {
      throw new NotFoundError(`Channel not found: ${channelId}`);
    }

    const uploadsPlaylistId =
      channelData.items[0].contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      throw new NotFoundError(`No uploads playlist for channel: ${channelId}`);
    }

    // Fetch video IDs from uploads playlist
    const videoIds: string[] = [];
    let pageToken: string | undefined;

    while (videoIds.length < maxResults) {
      const params: Record<string, string> = {
        part: 'contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: String(Math.min(50, maxResults - videoIds.length)),
      };
      if (pageToken) params.pageToken = pageToken;

      const playlistData = await this.fetchApi<YouTubePlaylistItemsResponse>(
        'playlistItems',
        params,
        QUOTA_COSTS['playlistItems.list'],
      );

      for (const item of playlistData.items || []) {
        videoIds.push(item.contentDetails.videoId);
      }

      pageToken = playlistData.nextPageToken;
      if (!pageToken) break;
    }

    if (videoIds.length === 0) return [];

    // Fetch video details in batches of 50
    return this.getVideosBatch(videoIds);
  }

  async getVideosBatch(videoIds: string[]): Promise<YouTubeVideoInfo[]> {
    const results: YouTubeVideoInfo[] = [];

    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const data = await this.fetchApi<YouTubeVideoListResponse>(
        'videos',
        {
          part: 'snippet,statistics,contentDetails',
          id: batch.join(','),
        },
        QUOTA_COSTS['videos.list'],
      );

      for (const item of data.items || []) {
        results.push({
          videoId: item.id,
          channelId: item.snippet.channelId,
          title: item.snippet.title,
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          duration: parseDuration(item.contentDetails.duration),
          viewCount: parseInt(item.statistics?.viewCount || '0', 10),
          likeCount: parseInt(item.statistics?.likeCount || '0', 10),
          commentCount: parseInt(item.statistics?.commentCount || '0', 10),
          tags: item.snippet.tags || [],
          thumbnailUrl: item.snippet.thumbnails?.high?.url || '',
          defaultLanguage: item.snippet.defaultLanguage || '',
          categoryId: item.snippet.categoryId || '',
        });
      }
    }

    return results;
  }

  async searchChannels(
    query: string,
    maxResults = 25,
  ): Promise<{ channelId: string; title: string }[]> {
    const data = await this.fetchApi<YouTubeSearchResponse>(
      'search',
      {
        part: 'snippet',
        q: query,
        type: 'channel',
        maxResults: String(maxResults),
      },
      QUOTA_COSTS['search.list'],
    );

    return (data.items || []).map((item) => ({
      channelId: item.snippet.channelId,
      title: item.snippet.title,
    }));
  }
}

/** Parse ISO 8601 duration (PT1H2M3S) to seconds */
export function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// ─── Error Classes ───

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'YouTubeApiError';
  }
}

export class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExhaustedError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// ─── YouTube API Response Types (internal) ───

interface YouTubeChannelListResponse {
  items: {
    id: string;
    snippet: {
      title: string;
      description: string;
      country?: string;
      customUrl?: string;
      publishedAt: string;
      thumbnails?: { high?: { url: string } };
    };
    statistics: {
      subscriberCount?: string;
      videoCount?: string;
      viewCount?: string;
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }[];
}

interface YouTubeVideoListResponse {
  items: {
    id: string;
    snippet: {
      channelId: string;
      title: string;
      description: string;
      publishedAt: string;
      tags?: string[];
      categoryId?: string;
      defaultLanguage?: string;
      thumbnails?: { high?: { url: string } };
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
    contentDetails: {
      duration: string;
    };
  }[];
}

interface YouTubePlaylistItemsResponse {
  items: {
    contentDetails: {
      videoId: string;
    };
  }[];
  nextPageToken?: string;
}

interface YouTubeSearchResponse {
  items: {
    snippet: {
      channelId: string;
      title: string;
    };
  }[];
}
