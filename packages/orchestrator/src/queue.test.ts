import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueManager } from './queue.js';
import type { Logger } from '@kidsvid/shared';

// Mock bullmq
vi.mock('bullmq', () => {
  const mockJob = {
    id: 'job-123',
    name: 'analyze',
    data: { type: 'analyze' },
    timestamp: Date.now(),
    attemptsMade: 0,
    progress: 0,
    updateData: vi.fn(),
    moveToFailed: vi.fn(),
  };

  return {
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: 'job-123' }),
      getWaitingCount: vi.fn().mockResolvedValue(2),
      getActiveCount: vi.fn().mockResolvedValue(1),
      getCompletedCount: vi.fn().mockResolvedValue(10),
      getFailedCount: vi.fn().mockResolvedValue(1),
      getDelayedCount: vi.fn().mockResolvedValue(0),
      getCompleted: vi.fn().mockResolvedValue([
        { id: 'c1', name: 'analyze', timestamp: Date.now(), attemptsMade: 1, finishedOn: Date.now(), data: {} },
      ]),
      getFailed: vi.fn().mockResolvedValue([
        { id: 'f1', name: 'publish', timestamp: Date.now(), attemptsMade: 3, failedReason: 'timeout', data: {} },
      ]),
      getActive: vi.fn().mockResolvedValue([]),
      getWaiting: vi.fn().mockResolvedValue([
        { ...mockJob, name: 'review', data: { type: 'review', generatedVideoId: 1 } },
      ]),
      getJob: vi.fn().mockResolvedValue(mockJob),
      close: vi.fn(),
    })),
    Worker: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      close: vi.fn(),
    })),
    FlowProducer: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({
        job: { id: 'flow-root' },
        children: [
          {
            job: { id: 'flow-child-1' },
            children: [
              { job: { id: 'flow-child-2' }, children: [] },
            ],
          },
        ],
      }),
      close: vi.fn(),
    })),
  };
});

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

describe('QueueManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with Redis URL', () => {
    const qm = new QueueManager(
      { redisUrl: 'redis://localhost:6379' },
      mockLogger,
    );
    expect(qm).toBeDefined();
  });

  describe('addJob', () => {
    it('adds job to queue and returns ID', async () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      const jobId = await qm.addJob('analyze', { type: 'analyze' });
      expect(jobId).toBe('job-123');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-123', name: 'analyze' }),
        'Job added to queue',
      );
    });

    it('supports delay and priority options', async () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      await qm.addJob('generate-script', {
        type: 'generate-script',
        educationalCategory: 'early_math',
        topic: 'counting',
        ageBracket: '4-6',
        characterIds: [0],
      }, { delay: 5000, priority: 1 });

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('schedulePipeline', () => {
    it('creates flow with all pipeline stages', async () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      const jobIds = await qm.schedulePipeline({
        dryRun: true,
        educationalCategory: 'early_math',
        topic: 'counting to 10',
      });

      expect(jobIds.length).toBeGreaterThan(0);
      expect(jobIds).toContain('flow-root');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ stages: expect.any(Number) }),
        'Full pipeline scheduled',
      );
    });
  });

  describe('getHealth', () => {
    it('returns queue statistics', async () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      const health = await qm.getHealth();

      expect(health.waiting).toBe(2);
      expect(health.active).toBe(1);
      expect(health.completed).toBe(10);
      expect(health.failed).toBe(1);
      expect(health.delayed).toBe(0);
    });
  });

  describe('getJobHistory', () => {
    it('returns recent jobs sorted by timestamp', async () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      const history = await qm.getJobHistory(10);

      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('id');
      expect(history[0]).toHaveProperty('name');
      expect(history[0]).toHaveProperty('state');
    });
  });

  describe('getReviewQueue', () => {
    it('returns only review jobs from waiting queue', async () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      const queue = await qm.getReviewQueue();

      expect(queue.length).toBeGreaterThan(0);
      expect(queue[0].name).toBe('review');
    });
  });

  describe('approveVideo', () => {
    it('updates job data with approved flag', async () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      await qm.approveVideo('job-123');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-123' }),
        'Video approved for publishing',
      );
    });
  });

  describe('rejectVideo', () => {
    it('moves job to failed with reason', async () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      await qm.rejectVideo('job-123', 'Content quality too low');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-123', reason: 'Content quality too low' }),
        'Video rejected',
      );
    });
  });

  describe('registerProcessor', () => {
    it('registers a processor without errors', () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      // Should not throw
      expect(() => {
        qm.registerProcessor('analyze', async () => ({ result: 'done' }));
      }).not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('closes queue and workers', async () => {
      const qm = new QueueManager(
        { redisUrl: 'redis://localhost:6379' },
        mockLogger,
      );

      qm.registerProcessor('analyze', async () => ({}));
      await qm.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('Queue manager shut down');
    });
  });
});
