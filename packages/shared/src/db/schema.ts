import {
  pgTable,
  text,
  varchar,
  integer,
  bigint,
  real,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  serial,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── Enums ───

export const contentCategoryEnum = pgEnum('content_category', [
  'nursery_rhyme',
  'story',
  'educational',
  'animation',
  'roleplay',
  'song',
  'challenge',
  'unboxing',
  'other',
]);

export const videoStatusEnum = pgEnum('video_status', [
  'draft',
  'script_ready',
  'media_generating',
  'media_ready',
  'review',
  'approved',
  'publishing',
  'published',
  'failed',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'active',
  'completed',
  'failed',
  'delayed',
]);

// ─── Channels ───

export const channels = pgTable(
  'channels',
  {
    id: serial('id').primaryKey(),
    youtubeChannelId: varchar('youtube_channel_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description'),
    subscriberCount: bigint('subscriber_count', { mode: 'number' }),
    videoCount: integer('video_count'),
    viewCount: bigint('view_count', { mode: 'number' }),
    country: varchar('country', { length: 10 }),
    thumbnailUrl: text('thumbnail_url'),
    customUrl: varchar('custom_url', { length: 256 }),
    primaryCategory: contentCategoryEnum('primary_category'),
    tags: jsonb('tags').$type<string[]>().default([]),
    uploadFrequency: real('upload_frequency'), // videos per week
    avgViews: bigint('avg_views', { mode: 'number' }),
    avgLikes: bigint('avg_likes', { mode: 'number' }),
    engagementRate: real('engagement_rate'), // likes+comments / views
    lastAnalyzedAt: timestamp('last_analyzed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('channels_yt_id_idx').on(table.youtubeChannelId)],
);

// ─── Videos (from analysis) ───

export const videos = pgTable(
  'videos',
  {
    id: serial('id').primaryKey(),
    youtubeVideoId: varchar('youtube_video_id', { length: 32 }).notNull(),
    channelId: integer('channel_id').references(() => channels.id),
    title: varchar('title', { length: 512 }).notNull(),
    description: text('description'),
    publishedAt: timestamp('published_at'),
    duration: integer('duration'), // seconds
    viewCount: bigint('view_count', { mode: 'number' }),
    likeCount: bigint('like_count', { mode: 'number' }),
    commentCount: bigint('comment_count', { mode: 'number' }),
    category: contentCategoryEnum('category'),
    tags: jsonb('tags').$type<string[]>().default([]),
    thumbnailUrl: text('thumbnail_url'),
    defaultLanguage: varchar('default_language', { length: 10 }),
    // Computed analysis fields
    engagementRate: real('engagement_rate'),
    viewsPerDay: real('views_per_day'),
    titleLength: integer('title_length'),
    hasNumbers: boolean('has_numbers'),
    hasEmoji: boolean('has_emoji'),
    isShort: boolean('is_short'), // < 60 seconds
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('videos_yt_id_idx').on(table.youtubeVideoId)],
);

// ─── Analysis Patterns ───

export const analysisPatterns = pgTable('analysis_patterns', {
  id: serial('id').primaryKey(),
  patternType: varchar('pattern_type', { length: 64 }).notNull(), // 'title', 'duration', 'upload_time', 'thumbnail', 'tags'
  category: contentCategoryEnum('category'),
  finding: text('finding').notNull(),
  confidence: real('confidence'), // 0-1
  sampleSize: integer('sample_size'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Analysis Runs ───

export const analysisRuns = pgTable('analysis_runs', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  channelsAnalyzed: integer('channels_analyzed').default(0),
  videosAnalyzed: integer('videos_analyzed').default(0),
  patternsFound: integer('patterns_found').default(0),
  apiQuotaUsed: integer('api_quota_used').default(0),
  status: varchar('status', { length: 32 }).default('running'),
  error: text('error'),
});

// ─── Characters (for content generation) ───

export const characters = pgTable('characters', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  personality: text('personality'),
  appearance: text('appearance'),
  catchphrases: jsonb('catchphrases').$type<string[]>().default([]),
  ageRange: varchar('age_range', { length: 16 }),
  styleSheet: jsonb('style_sheet').$type<Record<string, string>>().default({}),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Generated Content ───

export const generatedVideos = pgTable('generated_videos', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 512 }).notNull(),
  description: text('description'),
  script: text('script'),
  category: contentCategoryEnum('category'),
  targetDuration: integer('target_duration'), // seconds
  targetAgeMin: integer('target_age_min'),
  targetAgeMax: integer('target_age_max'),
  characters: jsonb('characters').$type<number[]>().default([]),
  tags: jsonb('tags').$type<string[]>().default([]),
  status: videoStatusEnum('status').default('draft'),
  // Media URLs
  thumbnailUrl: text('thumbnail_url'),
  audioUrl: text('audio_url'),
  musicUrl: text('music_url'),
  videoUrl: text('video_url'),
  // Publishing
  youtubeVideoId: varchar('youtube_video_id', { length: 32 }),
  publishedAt: timestamp('published_at'),
  scheduledAt: timestamp('scheduled_at'),
  playlistId: varchar('playlist_id', { length: 64 }),
  // Metadata
  generationMetadata: jsonb('generation_metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Performance Tracking ───

export const performanceSnapshots = pgTable('performance_snapshots', {
  id: serial('id').primaryKey(),
  generatedVideoId: integer('generated_video_id').references(() => generatedVideos.id),
  youtubeVideoId: varchar('youtube_video_id', { length: 32 }).notNull(),
  snapshotAt: timestamp('snapshot_at').defaultNow().notNull(),
  viewCount: bigint('view_count', { mode: 'number' }),
  likeCount: bigint('like_count', { mode: 'number' }),
  commentCount: bigint('comment_count', { mode: 'number' }),
  ctr: real('ctr'), // click-through rate
  avgWatchTime: real('avg_watch_time'), // seconds
  avgRetention: real('avg_retention'), // percentage
});

// ─── Strategy Scores ───

export const strategyScores = pgTable('strategy_scores', {
  id: serial('id').primaryKey(),
  strategy: varchar('strategy', { length: 256 }).notNull(),
  category: contentCategoryEnum('category'),
  score: real('score').notNull(),
  sampleSize: integer('sample_size'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  evaluatedAt: timestamp('evaluated_at').defaultNow().notNull(),
});

// ─── Pipeline Jobs ───

export const pipelineJobs = pgTable('pipeline_jobs', {
  id: serial('id').primaryKey(),
  jobType: varchar('job_type', { length: 64 }).notNull(),
  status: jobStatusEnum('status').default('pending'),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  result: jsonb('result').$type<Record<string, unknown>>(),
  error: text('error'),
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(3),
  scheduledAt: timestamp('scheduled_at'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
