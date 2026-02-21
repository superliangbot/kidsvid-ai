import express from 'express';
import type { Logger } from '@kidsvid/shared';
import type { QueueManager } from './queue.js';

/** Simple Express dashboard API for monitoring pipeline status */

export function createDashboard(
  queueManager: QueueManager,
  logger: Logger,
  port = 3000,
) {
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', async (_req, res) => {
    try {
      const health = await queueManager.getHealth();
      res.json({ status: 'ok', queue: health });
    } catch (err) {
      res.status(500).json({ status: 'error', error: String(err) });
    }
  });

  // Queue stats
  app.get('/api/queue/stats', async (_req, res) => {
    try {
      const health = await queueManager.getHealth();
      res.json(health);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Add analysis job
  app.post('/api/jobs/analyze', async (req, res) => {
    try {
      const jobId = await queueManager.addJob('analyze', req.body);
      res.json({ jobId });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Add generation job
  app.post('/api/jobs/generate', async (req, res) => {
    try {
      const jobId = await queueManager.addJob('generate-script', req.body);
      res.json({ jobId });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Start full pipeline
  app.post('/api/pipeline/start', async (req, res) => {
    try {
      const jobIds = await queueManager.schedulePipeline(req.body);
      res.json({ jobIds });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  const server = app.listen(port, () => {
    logger.info({ port }, 'Dashboard API running');
  });

  return server;
}
