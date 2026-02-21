import type { PublishRequest, PublishResult, Logger } from '@kidsvid/shared';

/** YouTube video uploader via YouTube Data API v3 (OAuth2). */

export interface UploaderOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  dryRun?: boolean;
}

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
      this.logger.info({ title: request.title }, 'DRY RUN: Would upload video');
      return {
        videoId: `dry-run-${Date.now()}`,
        url: `https://youtube.com/watch?v=dry-run-${Date.now()}`,
        publishedAt: new Date(),
      };
    }

    // Step 1: Get access token from refresh token
    const accessToken = await this.getAccessToken();

    // Step 2: Upload video via resumable upload
    this.logger.info({ title: request.title }, 'Uploading video to YouTube');

    const metadata = {
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

    // TODO: Implement actual resumable upload using googleapis
    // 1. POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable
    // 2. Send video file in chunks
    // 3. Set thumbnail after upload

    throw new Error('YouTube upload not yet implemented. Use dryRun=true for testing.');
  }

  private async getAccessToken(): Promise<string> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        refresh_token: this.options.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth token refresh failed: ${response.status}`);
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }
}
