// ─── Content Categories ───

export const CONTENT_CATEGORIES = [
  'nursery_rhyme',
  'story',
  'educational',
  'animation',
  'roleplay',
  'song',
  'challenge',
  'unboxing',
  'other',
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

// ─── YouTube API Response Types ───

export interface YouTubeChannelInfo {
  channelId: string;
  name: string;
  description: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  country: string;
  thumbnailUrl: string;
  customUrl: string;
  publishedAt: string;
}

export interface YouTubeVideoInfo {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string;
  duration: number; // seconds
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
  thumbnailUrl: string;
  defaultLanguage: string;
  categoryId: string;
}

// ─── Analysis Types ───

export interface ChannelAnalysis {
  channelId: string;
  name: string;
  primaryCategory: ContentCategory;
  uploadFrequency: number; // per week
  avgViews: number;
  avgLikes: number;
  engagementRate: number;
  topVideoIds: string[];
}

export interface PatternFinding {
  patternType: string;
  category: ContentCategory | null;
  finding: string;
  confidence: number;
  sampleSize: number;
  metadata: Record<string, unknown>;
}

export interface AnalysisResult {
  channelsAnalyzed: number;
  videosAnalyzed: number;
  patterns: PatternFinding[];
  apiQuotaUsed: number;
}

// ─── Educational Framework ───

export const EDUCATIONAL_CATEGORIES = [
  'early_math',
  'phonics_reading',
  'science',
  'social_emotional',
  'world_knowledge',
  'problem_solving',
  'music_rhythm',
] as const;

export type EducationalCategory = (typeof EDUCATIONAL_CATEGORIES)[number];

export const ENGAGEMENT_HOOK_TYPES = [
  'mystery_reveal',
  'call_response',
  'reward_loop',
  'cliffhanger',
  'character_growth',
  'easter_egg',
  'pattern_interrupt',
  'direct_address',
] as const;

export type EngagementHookType = (typeof ENGAGEMENT_HOOK_TYPES)[number];

export const AGE_BRACKETS = ['2-4', '4-6', '6-8'] as const;
export type AgeBracket = (typeof AGE_BRACKETS)[number];

export interface EpisodeStructure {
  hook: { duration: 15; description: string };
  problem: { duration: 30; description: string };
  exploration: { duration: number; description: string }; // 2-3 min
  resolution: { duration: 30; description: string };
  nextPreview: { duration: 15; description: string };
}

export interface ContentQualityScore {
  educationalValue: number; // 0-10, must be >7 to pass
  engagementPotential: number; // 0-10, must be >7 to pass
  passed: boolean;
  feedback: string[];
}

export const ANTI_BRAIN_ROT_RULES = [
  'No pure sensory overload without educational purpose',
  'Every visual element serves the learning objective',
  'Colors and animations support understanding, not distract',
  'Music reinforces the lesson (counting songs count, color songs name colors)',
  'Minimum 1 clear learning takeaway per video',
  'Age-appropriate complexity tagged per video',
] as const;

// ─── Generation Types ───

export interface ScriptRequest {
  category: ContentCategory;
  educationalCategory: EducationalCategory;
  educationalObjective: string;
  engagementHooks: EngagementHookType[];
  targetDuration: number; // seconds
  ageBracket: AgeBracket;
  characterIds: number[];
  topic?: string;
  style?: string;
  seriesName?: string;
  episodeNumber?: number;
}

export interface GeneratedScript {
  title: string;
  description: string;
  script: string;
  tags: string[];
  estimatedDuration: number;
  educationalObjective: string;
  engagementHooks: EngagementHookType[];
  episodeStructure: EpisodeStructure;
  learningTakeaways: string[];
  qualityScore: ContentQualityScore;
}

export interface CharacterDef {
  name: string;
  description: string;
  personality: string;
  appearance: string;
  catchphrases: string[];
  ageRange: string;
  teachingStyle: string; // 'through mistakes' | 'through curiosity' | 'through songs' | etc.
  styleSheet: Record<string, string>;
}

// ─── Media Provider Interfaces ───

export interface ThumbnailProvider {
  generate(prompt: string, style?: string): Promise<{ url: string; metadata: Record<string, unknown> }>;
}

export interface VoiceProvider {
  generate(text: string, voiceId: string): Promise<{ audioUrl: string; duration: number }>;
  listVoices(): Promise<{ id: string; name: string; preview: string }[]>;
}

export interface MusicProvider {
  generate(prompt: string, duration: number): Promise<{ audioUrl: string; duration: number }>;
}

export interface VideoProvider {
  generate(prompt: string, duration: number): Promise<{ videoUrl: string; duration: number }>;
}

// ─── Publishing Types ───

export interface PublishRequest {
  title: string;
  description: string;
  tags: string[];
  thumbnailPath: string;
  videoPath: string;
  playlistId?: string;
  scheduledAt?: Date;
  categoryId?: string;
  language?: string;
  madeForKids: boolean;
}

export interface PublishResult {
  videoId: string;
  url: string;
  publishedAt: Date;
}

// ─── Feedback Types ───

export interface PerformanceMetrics {
  videoId: string;
  views: number;
  likes: number;
  comments: number;
  ctr: number;
  avgWatchTime: number;
  avgRetention: number;
}

export interface StrategyEvaluation {
  strategy: string;
  category: ContentCategory | null;
  score: number;
  sampleSize: number;
}

// ─── Kids Content Knowledge ───

export const KIDS_CONTENT_RULES = {
  targetDuration: { min: 120, max: 300 }, // 2-5 minutes
  ageRange: { min: 2, max: 8 },
  uploadFrequency: { ideal: 5, min: 3 }, // per week
  titleMaxLength: 60,
  thumbnailRules: [
    'bright saturated colors',
    'high contrast',
    'expressive character faces',
    'bold large text',
    'minimal clutter',
  ],
  contentPrinciples: [
    'repetition of characters and catchphrases',
    'simple narratives with clear cause and effect',
    'music and songs with repetitive hooks',
    'educational hooks (colors, numbers, shapes, animals)',
    'character consistency across videos',
    'series/playlist format for autoplay',
    'minimal complex dialogue for global audience',
  ],
  educationalTopics: [
    'colors',
    'numbers',
    'shapes',
    'ABCs',
    'animals',
    'counting',
    'phonics',
    'weather',
    'seasons',
    'body parts',
    'fruits and vegetables',
    'vehicles',
    'professions',
  ],
} as const;

// ─── Top Kids Channels Seed Data ───

export const TOP_KIDS_CHANNELS = [
  { name: 'Cocomelon', channelId: 'UCbCmjCuTUZos6Inko4u57UQ' },
  { name: 'Like Nastya', channelId: 'UCJplp5SWAUApMJerU0Q2OBg' },
  { name: 'Kids Diana Show', channelId: 'UCk8GzjMOrta8yxDcKfylJYw' },
  { name: 'Vlad and Niki', channelId: 'UCvlE5gTbOvjiolFlEm-c_Ow' },
  { name: 'ChuChu TV', channelId: 'UCBnZ16ahKA2DZ_T5W0FPUXg' },
  { name: 'Pinkfong', channelId: 'UCcdwLMPsaU2ezNSJU1nFoBQ' },
  { name: 'BabyBus', channelId: 'UCpYye8D5fFMUPf9nSfgd4bA' },
  { name: 'Super Simple Songs', channelId: 'UCLsooMJoIpl_7ux2jvdPB-Q' },
  { name: 'Little Angel', channelId: 'UCEh_mFgaciFz5YgfLMPe8Xg' },
  { name: 'Blippi', channelId: 'UC5PYHgAzJ1wLEidB58SK6Xw' },
  { name: 'Moonbug Kids', channelId: 'UCuv7gJnHjVJLp-FXCslBz4A' },
  { name: 'Hey Bear Sensory', channelId: 'UCtMYJl_sBimqnuFwOCs3HbQ' },
  { name: 'Peppa Pig Official', channelId: 'UCAOtE1V7Ots4DjM8JLlrYgg' },
  { name: 'Nick Jr.', channelId: 'UC5partMoL_36OOhBqMBkGSQ' },
  { name: 'Sesame Street', channelId: 'UCFa-x-FIIMQ-hJBClYTMNjQ' },
  { name: 'Ryan\'s World', channelId: 'UChGJGhZ9SOOHvBB0Y4DOO_w' },
  { name: 'Little Baby Bum', channelId: 'UCKAqou7V9FAWXpZd9xtOg3Q' },
  { name: 'Dave and Ava', channelId: 'UC6zhI23bMOn0IMiTrwBvk3Q' },
  { name: 'Bounce Patrol', channelId: 'UCSO71MX-RBpGquzga2saaWA' },
  { name: 'The Wiggles', channelId: 'UCtsGV0dGcXvcp9GhkxXIk7w' },
  { name: 'Masha and the Bear', channelId: 'UCSuJ2vJig1d-JiNBsYRp5PQ' },
  { name: 'Numberblocks', channelId: 'UCPlwvN0w4qFSP1FllALB92w' },
  { name: 'Morphle', channelId: 'UC4NALVCmcmL5ntpV0thoH6w' },
  { name: 'Chu Chu TV Surprise Eggs', channelId: 'UCgFXm4TI8htWmCyJ6cVPG_A' },
  { name: 'Genevieve\'s Playhouse', channelId: 'UCaqfivfQeQxS5mI82Pp3GZQ' },
  { name: 'Toys and Colors', channelId: 'UCgFXm4TI8htWmCyJ6cVPG_A' },
  { name: 'Nursery Rhymes TV', channelId: 'UCraawnIIE07K18PCXmFsGqw' },
  { name: 'LooLoo Kids', channelId: 'UC4NALVCmcmL5ntpV0thoH6w' },
  { name: 'El Reino Infantil', channelId: 'UCNxmTjQIlg2LMMpx10ljmEQ' },
  { name: 'Cartoon Network', channelId: 'UCa-vrCLQHviTOVnEKDOdetQ' },
] as const;
