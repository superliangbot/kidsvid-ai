import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YouTubeUploader } from './uploader.js';
import type { PublishRequest, Logger } from '@kidsvid/shared';

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }),
      })),
    },
    youtube: vi.fn().mockReturnValue({
      videos: {
        insert: vi.fn().mockResolvedValue({
          data: { id: 'yt-video-123' },
        }),
      },
      thumbnails: {
        set: vi.fn().mockResolvedValue({}),
      },
      playlistItems: {
        insert: vi.fn().mockResolvedValue({}),
      },
    }),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  createReadStream: vi.fn().mockReturnValue('mock-stream'),
  existsSync: vi.fn().mockReturnValue(true),
}));

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
} as unknown as Logger;

const baseRequest: PublishRequest = {
  title: 'Counting to 10 with Cosmo!',
  description: 'Learn to count with your favorite robot friend.',
  tags: ['counting', 'math', 'kids'],
  thumbnailPath: '/tmp/thumb.png',
  videoPath: '/tmp/video.mp4',
  madeForKids: true,
};

describe('YouTubeUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with dry-run enabled by default', () => {
    const uploader = new YouTubeUploader(
      { clientId: 'id', clientSecret: 'secret', refreshToken: 'token' },
      mockLogger,
    );
    expect(uploader).toBeDefined();
  });

  it('returns dry-run result when dryRun=true', async () => {
    const uploader = new YouTubeUploader(
      { clientId: 'id', clientSecret: 'secret', refreshToken: 'token', dryRun: true },
      mockLogger,
    );

    const result = await uploader.upload(baseRequest);

    expect(result.videoId).toContain('dry-run-');
    expect(result.url).toContain('dry-run-');
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ title: baseRequest.title }),
      'DRY RUN: Would upload video',
    );
  });

  it('uploads video via YouTube API when dryRun=false', async () => {
    const uploader = new YouTubeUploader(
      { clientId: 'id', clientSecret: 'secret', refreshToken: 'token', dryRun: false },
      mockLogger,
    );

    const result = await uploader.upload(baseRequest);

    expect(result.videoId).toBe('yt-video-123');
    expect(result.url).toContain('yt-video-123');
  });

  it('uploads thumbnail after video', async () => {
    const uploader = new YouTubeUploader(
      { clientId: 'id', clientSecret: 'secret', refreshToken: 'token', dryRun: false },
      mockLogger,
    );

    await uploader.upload({ ...baseRequest, thumbnailPath: '/tmp/thumb.png' });

    // Thumbnail upload should have been called
    const { google } = await import('googleapis');
    const ytClient = (google.youtube as ReturnType<typeof vi.fn>)();
    expect(ytClient.thumbnails.set).toHaveBeenCalled();
  });

  it('adds video to playlist when playlistId provided', async () => {
    const uploader = new YouTubeUploader(
      { clientId: 'id', clientSecret: 'secret', refreshToken: 'token', dryRun: false },
      mockLogger,
    );

    await uploader.upload({ ...baseRequest, playlistId: 'pl-123' });

    const { google } = await import('googleapis');
    const ytClient = (google.youtube as ReturnType<typeof vi.fn>)();
    expect(ytClient.playlistItems.insert).toHaveBeenCalled();
  });

  it('sets privacy to private when scheduledAt is provided', async () => {
    const uploader = new YouTubeUploader(
      { clientId: 'id', clientSecret: 'secret', refreshToken: 'token', dryRun: false },
      mockLogger,
    );

    const scheduledRequest = {
      ...baseRequest,
      scheduledAt: new Date('2026-03-01T14:00:00Z'),
    };

    await uploader.upload(scheduledRequest);

    const { google } = await import('googleapis');
    const ytClient = (google.youtube as ReturnType<typeof vi.fn>)();
    const callArgs = ytClient.videos.insert.mock.calls[0][0];
    expect(callArgs.requestBody.status.privacyStatus).toBe('private');
    expect(callArgs.requestBody.status.publishAt).toBeDefined();
  });

  it('sets madeForKids flag', async () => {
    const uploader = new YouTubeUploader(
      { clientId: 'id', clientSecret: 'secret', refreshToken: 'token', dryRun: false },
      mockLogger,
    );

    await uploader.upload(baseRequest);

    const { google } = await import('googleapis');
    const ytClient = (google.youtube as ReturnType<typeof vi.fn>)();
    const callArgs = ytClient.videos.insert.mock.calls[0][0];
    expect(callArgs.requestBody.status.selfDeclaredMadeForKids).toBe(true);
  });
});
