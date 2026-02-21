import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import { resolve } from 'path';

dotenvConfig({ path: resolve(process.cwd(), '.env') });

const configSchema = z.object({
  // YouTube
  youtubeApiKey: z.string().min(1),

  // Database
  databaseUrl: z.string().url(),

  // Redis
  redisUrl: z.string().default('redis://localhost:6379'),

  // Anthropic
  anthropicApiKey: z.string().default(''),

  // OpenAI
  openaiApiKey: z.string().default(''),

  // Google (Gemini, Veo, Music, TTS)
  googleApiKey: z.string().default(''),

  // ElevenLabs
  elevenlabsApiKey: z.string().default(''),

  // Suno
  sunoApiKey: z.string().default(''),

  // Providers
  videoProvider: z.enum(['veo', 'nanobanana', 'runway', 'kling', 'sora']).default('veo'),
  musicProvider: z.enum(['gemini', 'suno']).default('gemini'),
  voiceProvider: z.enum(['openai', 'gemini']).default('openai'),
  runwayApiKey: z.string().default(''),

  // YouTube OAuth
  youtubeClientId: z.string().default(''),
  youtubeClientSecret: z.string().default(''),
  youtubeRefreshToken: z.string().default(''),

  // Pipeline
  dryRun: z.coerce.boolean().default(true),
  autoPublish: z.coerce.boolean().default(false),
  manualApproval: z.coerce.boolean().default(true),

  // Logging
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const result = configSchema.safeParse({
    youtubeApiKey: process.env.YOUTUBE_API_KEY,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    sunoApiKey: process.env.SUNO_API_KEY,
    videoProvider: process.env.VIDEO_PROVIDER,
    musicProvider: process.env.MUSIC_PROVIDER,
    voiceProvider: process.env.VOICE_PROVIDER,
    runwayApiKey: process.env.RUNWAY_API_KEY,
    youtubeClientId: process.env.YOUTUBE_CLIENT_ID,
    youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    youtubeRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
    dryRun: process.env.DRY_RUN,
    autoPublish: process.env.AUTO_PUBLISH,
    manualApproval: process.env.MANUAL_APPROVAL,
    logLevel: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const missing = Object.entries(errors)
      .map(([k, v]) => `  ${k}: ${v?.join(', ')}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${missing}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/** Load config with only the fields needed for analysis (no OAuth required) */
export function loadAnalyzerConfig(): Pick<Config, 'youtubeApiKey' | 'databaseUrl' | 'logLevel'> {
  const schema = z.object({
    youtubeApiKey: z.string().min(1),
    databaseUrl: z.string().url(),
    logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  });

  const result = schema.safeParse({
    youtubeApiKey: process.env.YOUTUBE_API_KEY,
    databaseUrl: process.env.DATABASE_URL,
    logLevel: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    throw new Error(
      `Missing analyzer config. Ensure YOUTUBE_API_KEY and DATABASE_URL are set.\n${result.error.message}`,
    );
  }

  return result.data;
}
