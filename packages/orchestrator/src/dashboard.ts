import express from 'express';
import type { Logger } from '@kidsvid/shared';
import type { QueueManager } from './queue.js';
import type { AnalyticsEngine } from './analytics.js';
import { JOB_NAMES } from './jobs.js';

/** Express dashboard API for monitoring pipeline status, job history,
 * content queue, and manual approval gate. */

export function createDashboard(
  queueManager: QueueManager,
  logger: Logger,
  port = 3000,
  analytics?: AnalyticsEngine,
) {
  const app = express();
  app.use(express.json());

  // ─── Health ───

  app.get('/health', async (_req, res) => {
    try {
      const health = await queueManager.getHealth();
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        queue: health,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: String(err) });
    }
  });

  // ─── Queue Stats ───

  app.get('/api/queue/stats', async (_req, res) => {
    try {
      const health = await queueManager.getHealth();
      res.json(health);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ─── Job History ───

  app.get('/api/jobs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const jobs = await queueManager.getJobHistory(limit);
      res.json({ jobs, total: jobs.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ─── Content Review Queue ───

  app.get('/api/review', async (_req, res) => {
    try {
      const queue = await queueManager.getReviewQueue();
      res.json({ queue, total: queue.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ─── Manual Approval Gate ───

  app.post('/api/review/:jobId/approve', async (req, res) => {
    try {
      await queueManager.approveVideo(req.params.jobId);
      res.json({ status: 'approved', jobId: req.params.jobId });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/review/:jobId/reject', async (req, res) => {
    try {
      const reason = req.body.reason || 'No reason provided';
      await queueManager.rejectVideo(req.params.jobId, reason);
      res.json({ status: 'rejected', jobId: req.params.jobId, reason });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ─── Trigger Individual Jobs ───

  app.post('/api/jobs/analyze', async (req, res) => {
    try {
      const jobId = await queueManager.addJob(JOB_NAMES.ANALYZE, {
        type: 'analyze',
        ...req.body,
      });
      res.json({ jobId, status: 'queued' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/jobs/generate', async (req, res) => {
    try {
      const jobId = await queueManager.addJob(JOB_NAMES.GENERATE_SCRIPT, {
        type: 'generate-script',
        ...req.body,
      });
      res.json({ jobId, status: 'queued' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/jobs/publish', async (req, res) => {
    try {
      const jobId = await queueManager.addJob(JOB_NAMES.PUBLISH, {
        type: 'publish',
        ...req.body,
      });
      res.json({ jobId, status: 'queued' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/jobs/track', async (req, res) => {
    try {
      const jobId = await queueManager.addJob(JOB_NAMES.TRACK, {
        type: 'track-performance',
        ...req.body,
      });
      res.json({ jobId, status: 'queued' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/jobs/report', async (req, res) => {
    try {
      const jobId = await queueManager.addJob(JOB_NAMES.REPORT, {
        type: 'weekly-report',
        ...req.body,
      });
      res.json({ jobId, status: 'queued' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ─── Full Pipeline ───

  app.post('/api/pipeline/start', async (req, res) => {
    try {
      const jobIds = await queueManager.schedulePipeline(req.body);
      res.json({ jobIds, status: 'pipeline-started', stages: jobIds.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ─── Pipeline Stages Info ───

  app.get('/api/pipeline/stages', (_req, res) => {
    res.json({
      stages: [
        { name: 'analyze', description: 'Analyze YouTube channels and detect patterns' },
        { name: 'generate-script', description: 'Generate educational script via Claude' },
        { name: 'generate-media', description: 'Generate thumbnail, voice, music, video' },
        { name: 'quality-check', description: 'Score educational value and engagement' },
        { name: 'review', description: 'Manual approval gate' },
        { name: 'publish', description: 'Upload to YouTube with SEO optimization' },
        { name: 'track-performance', description: 'Track views, engagement, retention' },
      ],
    });
  });

  // ─── Analytics (if engine provided) ───

  if (analytics) {
    app.get('/api/analytics/summary', async (_req, res) => {
      try { res.json(await analytics.getSummaryStats()); }
      catch (err) { res.status(500).json({ error: String(err) }); }
    });

    app.get('/api/analytics/videos-over-time', async (req, res) => {
      try {
        const days = parseInt(req.query.days as string) || 30;
        res.json(await analytics.getVideosOverTime(days));
      } catch (err) { res.status(500).json({ error: String(err) }); }
    });

    app.get('/api/analytics/quality-distribution', async (_req, res) => {
      try { res.json(await analytics.getQualityDistribution()); }
      catch (err) { res.status(500).json({ error: String(err) }); }
    });

    app.get('/api/analytics/series-progress', async (_req, res) => {
      try { res.json(await analytics.getSeriesProgress()); }
      catch (err) { res.status(500).json({ error: String(err) }); }
    });

    app.get('/api/analytics/export', async (_req, res) => {
      try { res.json(await analytics.exportAll()); }
      catch (err) { res.status(500).json({ error: String(err) }); }
    });
  }

  const server = app.listen(port, () => {
    logger.info({ port }, 'Dashboard API running');
  });

  return server;
}
