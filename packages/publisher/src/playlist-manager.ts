import { google } from 'googleapis';
import type { Logger, ContentCategory } from '@kidsvid/shared';

/** Playlist manager — auto-creates and organizes playlists for series content.
 * Uses YouTube Data API v3 for playlist CRUD operations.
 * In dry-run mode, returns mock IDs without making API calls. */

export interface PlaylistConfig {
  name: string;
  description: string;
  tags: string[];
  privacyStatus?: 'public' | 'private' | 'unlisted';
}

export interface PlaylistManagerOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  dryRun?: boolean;
}

/** Maps educational categories to playlist naming conventions */
const CATEGORY_PLAYLIST_NAMES: Record<string, string> = {
  nursery_rhyme: 'Nursery Rhymes & Songs',
  song: 'Kids Songs & Sing-Alongs',
  educational: 'Learning Adventures',
  story: 'Story Time for Kids',
  animation: 'Fun Animations',
  roleplay: 'Pretend Play & Adventures',
  challenge: 'Fun Challenges',
  unboxing: 'Toy Time',
  early_math: 'Math Fun for Kids',
  phonics_reading: 'ABCs & Reading',
  science: 'Science Explorers',
  social_emotional: 'Feelings & Friends',
  world_knowledge: 'World Discovery',
  problem_solving: 'Puzzle Time',
  music_rhythm: 'Music & Rhythm',
};

export class PlaylistManager {
  private dryRun: boolean;
  private playlistCache: Map<string, string> = new Map();

  constructor(
    private options: PlaylistManagerOptions,
    private logger: Logger,
  ) {
    this.dryRun = options.dryRun ?? true;
  }

  /** Create a new playlist */
  async createPlaylist(config: PlaylistConfig): Promise<string> {
    if (this.dryRun) {
      const mockId = `dry-run-playlist-${Date.now()}`;
      this.logger.info({ name: config.name }, 'DRY RUN: Would create playlist');
      this.playlistCache.set(config.name, mockId);
      return mockId;
    }

    const youtube = await this.getAuthenticatedClient();

    const response = await youtube.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: config.name,
          description: config.description,
          tags: config.tags,
        },
        status: {
          privacyStatus: config.privacyStatus ?? 'public',
        },
      },
    });

    const playlistId = response.data.id;
    if (!playlistId) {
      throw new Error('Playlist creation succeeded but returned no ID');
    }

    this.playlistCache.set(config.name, playlistId);
    this.logger.info({ playlistId, name: config.name }, 'Playlist created');
    return playlistId;
  }

  /** Add a video to a playlist */
  async addToPlaylist(playlistId: string, videoId: string): Promise<void> {
    if (this.dryRun) {
      this.logger.info({ playlistId, videoId }, 'DRY RUN: Would add video to playlist');
      return;
    }

    const youtube = await this.getAuthenticatedClient();

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

    this.logger.info({ playlistId, videoId }, 'Video added to playlist');
  }

  /** Get or create a playlist for the given category */
  async getOrCreatePlaylist(
    category: string,
    seriesName?: string,
  ): Promise<string> {
    const playlistName = this.getPlaylistName(seriesName ?? '', category);

    // Check cache first
    const cached = this.playlistCache.get(playlistName);
    if (cached) return cached;

    // Create new playlist
    const description = `${CATEGORY_PLAYLIST_NAMES[category] ?? 'Kids Content'} — Educational and fun content for children ages 2-8.`;

    return this.createPlaylist({
      name: playlistName,
      description,
      tags: ['kids', 'educational', 'learning', category.replace(/_/g, ' ')],
    });
  }

  /** Get series playlist name from content metadata */
  getPlaylistName(seriesName: string, category: string): string {
    if (seriesName) {
      return `${seriesName} | ${CATEGORY_PLAYLIST_NAMES[category] ?? category.replace(/_/g, ' ')} for Kids`;
    }
    return `${CATEGORY_PLAYLIST_NAMES[category] ?? category.replace(/_/g, ' ')} for Kids`;
  }

  /** List existing playlists (for cache population) */
  async listPlaylists(): Promise<Array<{ id: string; title: string }>> {
    if (this.dryRun) {
      return Array.from(this.playlistCache.entries()).map(([title, id]) => ({
        id,
        title,
      }));
    }

    const youtube = await this.getAuthenticatedClient();

    const response = await youtube.playlists.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
    });

    const playlists = (response.data.items ?? []).map((item) => ({
      id: item.id!,
      title: item.snippet?.title ?? '',
    }));

    // Populate cache
    for (const pl of playlists) {
      this.playlistCache.set(pl.title, pl.id);
    }

    return playlists;
  }

  private async getAuthenticatedClient() {
    const oauth2Client = new google.auth.OAuth2(
      this.options.clientId,
      this.options.clientSecret,
    );

    oauth2Client.setCredentials({
      refresh_token: this.options.refreshToken,
    });

    await oauth2Client.getAccessToken();
    return google.youtube({ version: 'v3', auth: oauth2Client });
  }
}
