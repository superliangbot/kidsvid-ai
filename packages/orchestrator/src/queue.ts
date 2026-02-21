import { Queue, Worker, type Job } from 'bullmq';
import type { Logger } from '@kidsvid/shared';
import { JOB_NAMES, type JobName, type JobData } from './jobs.js';

/** Pipeline queue manager using BullMQ + Redis */

export interface QueueManagerOptions {
  redisUrl: string;
  concurrency?: number;
}

export class QueueManager {
  private queue: Queue;
  private workers: Worker[] = [];

  constructor(
    private options: QueueManagerOptions,
    private logger: Logger,
  ) {
    const connection = parseRedisUrl(options.redisUrl);

    this.queue = new Queue('kidsvid-pipeline', { connection });
  }

  /** Add a job to the pipeline queue */
  async addJob(
    name: JobName,
    data: JobData,
    options?: { delay?: number; priority?: number },
  ): Promise<string> {
    const job = await this.queue.add(name, data, {
      delay: options?.delay,
      priority: options?.priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.info({ jobId: job.id, name }, 'Job added to queue');
    return job.id!;
  }

  /** Register a processor for a specific job type */
  registerProcessor(
    name: JobName,
    processor: (job: Job) => Promise<unknown>,
  ): void {
    const connection = parseRedisUrl(this.options.redisUrl);

    const worker = new Worker(
      'kidsvid-pipeline',
      async (job) => {
        if (job.name !== name) return; // Skip jobs for other processors
        this.logger.info({ jobId: job.id, name: job.name }, 'Processing job');
        return processor(job);
      },
      {
        connection,
        concurrency: this.options.concurrency ?? 1,
      },
    );

    worker.on('completed', (job) => {
      this.logger.info({ jobId: job.id, name: job.name }, 'Job completed');
    });

    worker.on('failed', (job, err) => {
      this.logger.error({ jobId: job?.id, name: job?.name, err }, 'Job failed');
    });

    this.workers.push(worker);
  }

  /** Schedule the full pipeline: analyze → generate → review → publish → track */
  async schedulePipeline(data: {
    analyze?: JobData;
    generate?: JobData;
  }): Promise<string[]> {
    const jobIds: string[] = [];

    // Step 1: Analyze
    if (data.analyze) {
      const id = await this.addJob(JOB_NAMES.ANALYZE, data.analyze);
      jobIds.push(id);
    }

    // Other steps added after analysis completes (via job chaining)
    // TODO: Implement flow/chain via BullMQ FlowProducer

    return jobIds;
  }

  /** Get queue health stats */
  async getHealth(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /** Shutdown gracefully */
  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await this.queue.close();
    this.logger.info('Queue manager shut down');
  }
}

function parseRedisUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
  };
}
