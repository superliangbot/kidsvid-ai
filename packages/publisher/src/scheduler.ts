import type { Logger } from '@kidsvid/shared';

/** Upload scheduler — determines optimal publish times based on analysis patterns. */

export interface ScheduleOptions {
  preferredDays?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  preferredHoursUtc?: number[]; // 0-23
  minHoursBetweenUploads?: number;
  timezone?: string;
}

const DEFAULT_OPTIONS: Required<ScheduleOptions> = {
  preferredDays: [1, 2, 3, 4, 5], // Weekdays
  preferredHoursUtc: [14, 15, 16], // Afternoon UTC (morning US)
  minHoursBetweenUploads: 24,
  timezone: 'UTC',
};

export class UploadScheduler {
  private options: Required<ScheduleOptions>;

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
        this.options.preferredHoursUtc.includes(hour)
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
      current = new Date(slot.getTime() + this.options.minHoursBetweenUploads * 3600_000);
    }

    return slots;
  }
}
