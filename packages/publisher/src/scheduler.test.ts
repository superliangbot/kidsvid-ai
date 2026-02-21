import { describe, it, expect, vi } from 'vitest';
import { UploadScheduler } from './scheduler.js';
import type { Logger } from '@kidsvid/shared';

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

describe('UploadScheduler', () => {
  it('constructs with default options', () => {
    const scheduler = new UploadScheduler({}, mockLogger);
    expect(scheduler).toBeDefined();
  });

  it('returns next slot on a preferred day and hour', () => {
    const scheduler = new UploadScheduler(
      {
        preferredDays: [1, 2, 3, 4, 5],
        preferredHoursUtc: [14, 15, 16],
      },
      mockLogger,
    );

    const slot = scheduler.getNextSlot(new Date('2026-02-16T10:00:00Z')); // Monday
    expect(slot.getUTCDay()).toBeGreaterThanOrEqual(1);
    expect(slot.getUTCDay()).toBeLessThanOrEqual(5);
    expect([14, 15, 16]).toContain(slot.getUTCHours());
  });

  it('skips weekends when preferredDays is weekdays only', () => {
    const scheduler = new UploadScheduler(
      {
        preferredDays: [1, 2, 3, 4, 5],
        preferredHoursUtc: [14],
      },
      mockLogger,
    );

    // Saturday
    const slot = scheduler.getNextSlot(new Date('2026-02-21T10:00:00Z'));
    const day = slot.getUTCDay();
    expect(day).not.toBe(0); // Not Sunday
    expect(day).not.toBe(6); // Not Saturday
  });

  it('returns multiple slots with minimum gap', () => {
    const scheduler = new UploadScheduler(
      {
        preferredDays: [1, 2, 3, 4, 5],
        preferredHoursUtc: [14, 15],
        minHoursBetweenUploads: 24,
      },
      mockLogger,
    );

    const slots = scheduler.getSlots(3);

    expect(slots).toHaveLength(3);

    // Check minimum gap between slots
    for (let i = 1; i < slots.length; i++) {
      const gap = slots[i].getTime() - slots[i - 1].getTime();
      expect(gap).toBeGreaterThanOrEqual(24 * 3600_000);
    }
  });

  it('respects maxUploadsPerDay', () => {
    const scheduler = new UploadScheduler(
      {
        preferredDays: [1, 2, 3, 4, 5],
        preferredHoursUtc: [10, 11, 12, 13, 14, 15, 16, 17],
        minHoursBetweenUploads: 2,
        maxUploadsPerDay: 2,
      },
      mockLogger,
    );

    const slots = scheduler.getSlots(5, new Date('2026-02-16T08:00:00Z'));

    // Count uploads per day
    const dayMap = new Map<string, number>();
    for (const slot of slots) {
      const day = slot.toISOString().slice(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }

    for (const [, count] of dayMap) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('clears schedule', () => {
    const scheduler = new UploadScheduler({}, mockLogger);
    scheduler.getSlots(3);
    expect(scheduler.getScheduledSlots()).toHaveLength(3);

    scheduler.clearSchedule();
    expect(scheduler.getScheduledSlots()).toHaveLength(0);
  });

  it('creates scheduler from analysis patterns', () => {
    const scheduler = UploadScheduler.fromAnalysis(
      [
        {
          patternType: 'upload_time',
          metadata: { bestDays: [2, 3, 4], bestHours: [15, 16] },
        },
      ],
      mockLogger,
    );

    expect(scheduler).toBeDefined();
    const slot = scheduler.getNextSlot(new Date('2026-02-16T10:00:00Z'));
    expect([15, 16]).toContain(slot.getUTCHours());
  });

  it('fallback returns next day when no slots found in 2 weeks', () => {
    const scheduler = new UploadScheduler(
      {
        preferredDays: [],
        preferredHoursUtc: [],
      },
      mockLogger,
    );

    const start = new Date('2026-02-16T10:00:00Z');
    const slot = scheduler.getNextSlot(start);

    // Should return fallback (next day at hour 14)
    expect(slot.getTime()).toBeGreaterThan(start.getTime());
  });
});
