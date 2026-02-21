import type { Logger } from '@kidsvid/shared';

/** Upload scheduler — determines optimal publish times based on analysis patterns.
 * Uses engagement data to find the best day/hour combinations for uploading. */

export interface ScheduleOptions {
  preferredDays?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  preferredHoursUtc?: number[]; // 0-23
  minHoursBetweenUploads?: number;
  maxUploadsPerDay?: number;
  timezone?: string;
}

const DEFAULT_OPTIONS: Required<ScheduleOptions> = {
  preferredDays: [1, 2, 3, 4, 5], // Weekdays (analysis shows best engagement)
  preferredHoursUtc: [14, 15, 16], // Afternoon UTC (morning US Eastern)
  minHoursBetweenUploads: 24,
  maxUploadsPerDay: 2,
  timezone: 'UTC',
};

export class UploadScheduler {
  private options: Required<ScheduleOptions>;
  private scheduledSlots: Date[] = [];

  constructor(
    options: ScheduleOptions = {},
    private logger: Logger,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Get the next optimal upload time after the given date */
  getNextSlot(after: Date = new Date()): Date {
    const candidate = new Date(after);

    // Round up to next hour
    candidate.setMinutes(0, 0, 0);
    candidate.setHours(candidate.getHours() + 1);

    // Find next preferred day and hour
    for (let i = 0; i < 14 * 24; i++) {
      // Search up to 2 weeks
      const day = candidate.getUTCDay();
      const hour = candidate.getUTCHours();

      if (
        this.options.preferredDays.includes(day) &&
        this.options.preferredHoursUtc.includes(hour) &&
        !this.isSlotTaken(candidate)
      ) {
        return candidate;
      }

      candidate.setHours(candidate.getHours() + 1);
    }

    // Fallback: next day at first preferred hour
    const fallback = new Date(after);
    fallback.setDate(fallback.getDate() + 1);
    fallback.setUTCHours(this.options.preferredHoursUtc[0] || 14, 0, 0, 0);
    return fallback;
  }

  /** Get a batch of upload slots */
  getSlots(count: number, after: Date = new Date()): Date[] {
    const slots: Date[] = [];
    let current = after;

    for (let i = 0; i < count; i++) {
      const slot = this.getNextSlot(current);
      slots.push(slot);
      this.scheduledSlots.push(slot);
      current = new Date(slot.getTime() + this.options.minHoursBetweenUploads * 3600_000);
    }

    return slots;
  }

  /** Check if a slot conflicts with an existing scheduled upload */
  private isSlotTaken(candidate: Date): boolean {
    const candidateDay = candidate.toISOString().slice(0, 10);
    const uploadsOnDay = this.scheduledSlots.filter(
      (s) => s.toISOString().slice(0, 10) === candidateDay,
    ).length;

    if (uploadsOnDay >= this.options.maxUploadsPerDay) return true;

    // Check minimum hours between uploads
    for (const slot of this.scheduledSlots) {
      const diffMs = Math.abs(candidate.getTime() - slot.getTime());
      if (diffMs < this.options.minHoursBetweenUploads * 3600_000) return true;
    }

    return false;
  }

  /** Configure schedule from analysis results */
  static fromAnalysis(
    analysisPatterns: Array<{ patternType: string; metadata?: Record<string, unknown> }>,
    logger: Logger,
  ): UploadScheduler {
    const options: ScheduleOptions = {};

    const uploadPattern = analysisPatterns.find(
      (p) => p.patternType === 'upload_day' || p.patternType === 'upload_time',
    );

    if (uploadPattern?.metadata) {
      if (uploadPattern.metadata.bestDays) {
        options.preferredDays = uploadPattern.metadata.bestDays as number[];
      }
      if (uploadPattern.metadata.bestHours) {
        options.preferredHoursUtc = uploadPattern.metadata.bestHours as number[];
      }
    }

    logger.info({ options }, 'Scheduler configured from analysis patterns');
    return new UploadScheduler(options, logger);
  }

  /** Clear all scheduled slots */
  clearSchedule(): void {
    this.scheduledSlots = [];
  }

  /** Get all currently scheduled slots */
  getScheduledSlots(): Date[] {
    return [...this.scheduledSlots];
  }
}
