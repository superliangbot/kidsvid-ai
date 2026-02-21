/** Pipeline job definitions for BullMQ */

export const JOB_NAMES = {
  ANALYZE: 'analyze',
  GENERATE_SCRIPT: 'generate-script',
  GENERATE_MEDIA: 'generate-media',
  REVIEW: 'review',
  PUBLISH: 'publish',
  TRACK: 'track-performance',
  REPORT: 'weekly-report',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface AnalyzeJobData {
  channelIds?: string[];
  videosPerChannel?: number;
}

export interface GenerateScriptJobData {
  educationalCategory: string;
  topic: string;
  ageBracket: string;
  characterIds: number[];
}

export interface GenerateMediaJobData {
  scriptId: number;
  generateThumbnail: boolean;
  generateVoice: boolean;
  generateMusic: boolean;
  generateVideo: boolean;
}

export interface ReviewJobData {
  generatedVideoId: number;
  autoApprove?: boolean;
}

export interface PublishJobData {
  generatedVideoId: number;
  scheduledAt?: string;
  dryRun?: boolean;
}

export interface TrackJobData {
  videoIds?: string[];
}

export interface ReportJobData {
  period?: 'daily' | 'weekly' | 'monthly';
}

export type JobData =
  | AnalyzeJobData
  | GenerateScriptJobData
  | GenerateMediaJobData
  | ReviewJobData
  | PublishJobData
  | TrackJobData
  | ReportJobData;
