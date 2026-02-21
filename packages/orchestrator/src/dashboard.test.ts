import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDashboard } from './dashboard.js';
import type { Logger } from '@kidsvid/shared';
import type { QueueManager } from './queue.js';
import type { Server } from 'http';

// We don't want to start actual servers in tests, so mock express
vi.mock('express', () => {
  const mockRouter: Record<string, Array<{ path: string; handler: Function }>> = {
    get: [],
    post: [],
  };

  const app = {
    use: vi.fn(),
    get: vi.fn((path: string, handler: Function) => {
      mockRouter.get.push({ path, handler });
    }),
    post: vi.fn((path: string, handler: Function) => {
      mockRouter.post.push({ path, handler });
    }),
    listen: vi.fn((_port: number, cb: Function) => {
      cb();
      return { close: vi.fn() } as unknown as Server;
    }),
    _routes: mockRouter,
  };

  const express = vi.fn(() => app);
  (express as unknown as Record<string, unknown>).json = vi.fn(() => vi.fn());
  return { default: express };
});

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

function createMockQueueManager(): QueueManager {
  return {
    getHealth: vi.fn().mockResolvedValue({
      waiting: 2,
      active: 1,
      completed: 10,
      failed: 1,
      delayed: 0,
    }),
    getJobHistory: vi.fn().mockResolvedValue([
      { id: 'j1', name: 'analyze', state: 'completed' },
    ]),
    getReviewQueue: vi.fn().mockResolvedValue([
      { id: 'r1', name: 'review', state: 'waiting' },
    ]),
    approveVideo: vi.fn(),
    rejectVideo: vi.fn(),
    addJob: vi.fn().mockResolvedValue('new-job-id'),
    schedulePipeline: vi.fn().mockResolvedValue(['j1', 'j2', 'j3']),
  } as unknown as QueueManager;
}

describe('createDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates Express server and registers routes', () => {
    const qm = createMockQueueManager();
    const server = createDashboard(qm, mockLogger, 3001);

    expect(server).toBeDefined();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ port: 3001 }),
      'Dashboard API running',
    );
  });

  it('registers health endpoint', async () => {
    const qm = createMockQueueManager();
    createDashboard(qm, mockLogger, 3002);

    // Find the health route handler
    const express = (await import('express')).default;
    const app = express();
    const getRoutes = (app.get as ReturnType<typeof vi.fn>).mock.calls;
    const healthRoute = getRoutes.find(([path]: [string]) => path === '/health');

    expect(healthRoute).toBeDefined();
  });

  it('registers all API endpoints', async () => {
    const qm = createMockQueueManager();
    createDashboard(qm, mockLogger, 3003);

    const express = (await import('express')).default;
    const app = express();

    const getRoutes = (app.get as ReturnType<typeof vi.fn>).mock.calls.map(
      ([path]: [string]) => path,
    );
    const postRoutes = (app.post as ReturnType<typeof vi.fn>).mock.calls.map(
      ([path]: [string]) => path,
    );

    expect(getRoutes).toContain('/health');
    expect(getRoutes).toContain('/api/queue/stats');
    expect(getRoutes).toContain('/api/jobs');
    expect(getRoutes).toContain('/api/review');
    expect(getRoutes).toContain('/api/pipeline/stages');
    expect(postRoutes).toContain('/api/jobs/analyze');
    expect(postRoutes).toContain('/api/jobs/generate');
    expect(postRoutes).toContain('/api/jobs/publish');
    expect(postRoutes).toContain('/api/jobs/track');
    expect(postRoutes).toContain('/api/jobs/report');
    expect(postRoutes).toContain('/api/pipeline/start');
  });

  it('registers approval/rejection endpoints', async () => {
    const qm = createMockQueueManager();
    createDashboard(qm, mockLogger, 3004);

    const express = (await import('express')).default;
    const app = express();

    const postRoutes = (app.post as ReturnType<typeof vi.fn>).mock.calls.map(
      ([path]: [string]) => path,
    );

    expect(postRoutes).toContain('/api/review/:jobId/approve');
    expect(postRoutes).toContain('/api/review/:jobId/reject');
  });
});
