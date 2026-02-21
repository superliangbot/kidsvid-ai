import { google } from 'googleapis';
import type { PublishRequest, PublishResult, Logger } from '@kidsvid/shared';
import * as fs from 'fs';

export interface UploaderOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  dryRun?: boolean;
}

/** YouTube video uploader via YouTube Data API v3 (OAuth2).
 * Supports resumable uploads, thumbnail setting, and made-for-kids flag.
 * Defaults to dry-run mode — set dryRun=false for actual uploads. */
export class YouTubeUploader {
  private dryRun: boolean;

  constructor(
    private options: UploaderOptions,
    private logger: Logger,
  ) {
    this.dryRun = options.dryRun ?? true;
  }

  async upload(request: PublishRequest): Promise<PublishResult> {
    if (this.dryRun) {
      const dryId = `dry-run-${Date.now()}`;
      this.logger.info({ title: request.title }, 'DRY RUN: Would upload video');
      return {
        videoId: dryId,
        url: `https://youtube.com/watch?v=${dryId}`,
        publishedAt: new Date(),
      };
    }

    const youtube = await this.getAuthenticatedClient();

    // Step 1: Upload video
    this.logger.info({ title: request.title }, 'Uploading video to YouTube');

    const videoMetadata = {
      snippet: {
        title: request.title,
        description: request.description,
        tags: request.tags,
        categoryId: request.categoryId || '24', // Entertainment
        defaultLanguage: request.language || 'en',
      },
      status: {
        privacyStatus: request.scheduledAt ? 'private' : 'public',
        selfDeclaredMadeForKids: request.madeForKids,
        publishAt: request.scheduledAt?.toISOString(),
      },
    };

    const videoStream = fs.createReadStream(request.videoPath);

    const uploadResponse = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: videoMetadata,
      media: {
        mimeType: 'video/mp4',
        body: videoStream,
      },
    });

    const videoId = uploadResponse.data.id;
    if (!videoId) {
      throw new Error('YouTube upload succeeded but returned no video ID');
    }

    this.logger.info({ videoId }, 'Video uploaded successfully');

    // Step 2: Upload thumbnail if provided
    if (request.thumbnailPath && fs.existsSync(request.thumbnailPath)) {
      await this.uploadThumbnail(youtube, videoId, request.thumbnailPath);
    }

    // Step 3: Add to playlist if specified
    if (request.playlistId) {
      await this.addToPlaylist(youtube, videoId, request.playlistId);
    }

    return {
      videoId,
      url: `https://youtube.com/watch?v=${videoId}`,
      publishedAt: new Date(),
    };
  }

  /** Upload a custom thumbnail for a video */
  async uploadThumbnail(
    youtube: ReturnType<typeof google.youtube>,
    videoId: string,
    thumbnailPath: string,
  ): Promise<void> {
    if (this.dryRun) {
      this.logger.info({ videoId, thumbnailPath }, 'DRY RUN: Would upload thumbnail');
      return;
    }

    this.logger.info({ videoId, thumbnailPath }, 'Uploading thumbnail');

    await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType: 'image/png',
        body: fs.createReadStream(thumbnailPath),
      },
    });

    this.logger.info({ videoId }, 'Thumbnail uploaded');
  }

  /** Add a video to a playlist */
  private async addToPlaylist(
    youtube: ReturnType<typeof google.youtube>,
    videoId: string,
    playlistId: string,
  ): Promise<void> {
    await youtube.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId,
          },
        },
      },
    });

    this.logger.info({ videoId, playlistId }, 'Video added to playlist');
  }

  /** Get an authenticated YouTube API client using OAuth2 refresh token */
  private async getAuthenticatedClient() {
    const oauth2Client = new google.auth.OAuth2(
      this.options.clientId,
      this.options.clientSecret,
    );

    oauth2Client.setCredentials({
      refresh_token: this.options.refreshToken,
    });

    // Force token refresh
    await oauth2Client.getAccessToken();

    return google.youtube({ version: 'v3', auth: oauth2Client });
  }
}
