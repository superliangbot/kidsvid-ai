/** Pipeline job definitions for BullMQ */

export const JOB_NAMES = {
  ANALYZE: 'analyze',
  GENERATE_SCRIPT: 'generate-script',
  GENERATE_MEDIA: 'generate-media',
  QUALITY_CHECK: 'quality-check',
  REVIEW: 'review',
  PUBLISH: 'publish',
  TRACK: 'track-performance',
  REPORT: 'weekly-report',
  SCORE: 'score-strategies',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface AnalyzeJobData {
  type: 'analyze';
  channelIds?: string[];
  videosPerChannel?: number;
}

export interface GenerateScriptJobData {
  type: 'generate-script';
  educationalCategory: string;
  topic: string;
  ageBracket: string;
  characterIds: number[];
}

export interface GenerateMediaJobData {
  type: 'generate-media';
  scriptId: number;
  generateThumbnail: boolean;
  generateVoice: boolean;
  generateMusic: boolean;
  generateVideo: boolean;
}

export interface QualityCheckJobData {
  type: 'quality-check';
  generatedVideoId: number;
}

export interface ReviewJobData {
  type: 'review';
  generatedVideoId: number;
  autoApprove?: boolean;
}

export interface PublishJobData {
  type: 'publish';
  generatedVideoId: number;
  scheduledAt?: string;
  dryRun?: boolean;
}

export interface TrackJobData {
  type: 'track-performance';
  videoIds?: string[];
}

export interface ReportJobData {
  type: 'weekly-report';
  period?: 'daily' | 'weekly' | 'monthly';
}

export interface ScoreJobData {
  type: 'score-strategies';
}

export type JobData =
  | AnalyzeJobData
  | GenerateScriptJobData
  | GenerateMediaJobData
  | QualityCheckJobData
  | ReviewJobData
  | PublishJobData
  | TrackJobData
  | ReportJobData
  | ScoreJobData;

/** Full pipeline definition: the ordered sequence of jobs */
export const PIPELINE_STAGES = [
  JOB_NAMES.ANALYZE,
  JOB_NAMES.GENERATE_SCRIPT,
  JOB_NAMES.GENERATE_MEDIA,
  JOB_NAMES.QUALITY_CHECK,
  JOB_NAMES.REVIEW,
  JOB_NAMES.PUBLISH,
  JOB_NAMES.TRACK,
] as const;
