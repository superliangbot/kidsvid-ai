import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaylistManager } from './playlist-manager.js';
import type { Logger } from '@kidsvid/shared';

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
      playlists: {
        insert: vi.fn().mockResolvedValue({
          data: { id: 'pl-created-123' },
        }),
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              { id: 'pl-existing-1', snippet: { title: 'Math Fun for Kids' } },
              { id: 'pl-existing-2', snippet: { title: 'Kids Songs' } },
            ],
          },
        }),
      },
      playlistItems: {
        insert: vi.fn().mockResolvedValue({}),
      },
    }),
  },
}));

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

const baseOptions = {
  clientId: 'id',
  clientSecret: 'secret',
  refreshToken: 'token',
};

describe('PlaylistManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dry-run mode', () => {
    it('returns mock playlist ID in dry-run', async () => {
      const manager = new PlaylistManager({ ...baseOptions, dryRun: true }, mockLogger);
      const id = await manager.createPlaylist({
        name: 'Test Playlist',
        description: 'Desc',
        tags: ['kids'],
      });

      expect(id).toContain('dry-run-playlist-');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Playlist' }),
        'DRY RUN: Would create playlist',
      );
    });

    it('logs dry-run for addToPlaylist', async () => {
      const manager = new PlaylistManager({ ...baseOptions, dryRun: true }, mockLogger);
      await manager.addToPlaylist('pl-123', 'vid-456');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ playlistId: 'pl-123', videoId: 'vid-456' }),
        'DRY RUN: Would add video to playlist',
      );
    });
  });

  describe('live mode', () => {
    it('creates playlist via YouTube API', async () => {
      const manager = new PlaylistManager({ ...baseOptions, dryRun: false }, mockLogger);
      const id = await manager.createPlaylist({
        name: 'Math Fun',
        description: 'Learning math!',
        tags: ['math', 'kids'],
      });

      expect(id).toBe('pl-created-123');
    });

    it('adds video to playlist via YouTube API', async () => {
      const manager = new PlaylistManager({ ...baseOptions, dryRun: false }, mockLogger);
      await manager.addToPlaylist('pl-123', 'vid-456');

      const { google } = await import('googleapis');
      const ytClient = (google.youtube as ReturnType<typeof vi.fn>)();
      expect(ytClient.playlistItems.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          part: ['snippet'],
          requestBody: expect.objectContaining({
            snippet: expect.objectContaining({
              playlistId: 'pl-123',
            }),
          }),
        }),
      );
    });

    it('lists playlists and populates cache', async () => {
      const manager = new PlaylistManager({ ...baseOptions, dryRun: false }, mockLogger);
      const playlists = await manager.listPlaylists();

      expect(playlists).toHaveLength(2);
      expect(playlists[0].title).toBe('Math Fun for Kids');
    });
  });

  describe('getOrCreatePlaylist', () => {
    it('creates playlist for category', async () => {
      const manager = new PlaylistManager({ ...baseOptions, dryRun: true }, mockLogger);
      const id = await manager.getOrCreatePlaylist('educational');

      expect(id).toContain('dry-run-playlist-');
    });

    it('returns cached playlist on second call', async () => {
      const manager = new PlaylistManager({ ...baseOptions, dryRun: true }, mockLogger);
      const id1 = await manager.getOrCreatePlaylist('song');
      const id2 = await manager.getOrCreatePlaylist('song');

      expect(id1).toBe(id2);
    });

    it('includes series name in playlist title', () => {
      const manager = new PlaylistManager({ ...baseOptions }, mockLogger);
      const name = manager.getPlaylistName('Cosmo Adventures', 'educational');

      expect(name).toContain('Cosmo Adventures');
      expect(name).toContain('Learning Adventures');
    });
  });

  describe('getPlaylistName', () => {
    it('maps category to friendly name', () => {
      const manager = new PlaylistManager({ ...baseOptions }, mockLogger);

      expect(manager.getPlaylistName('', 'nursery_rhyme')).toContain('Nursery Rhymes');
      expect(manager.getPlaylistName('', 'early_math')).toContain('Math Fun');
      expect(manager.getPlaylistName('', 'song')).toContain('Kids Songs');
    });

    it('falls back to category name for unknown categories', () => {
      const manager = new PlaylistManager({ ...baseOptions }, mockLogger);
      const name = manager.getPlaylistName('', 'unknown_category');

      expect(name).toContain('unknown category');
    });
  });
});
