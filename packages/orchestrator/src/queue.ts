import { Queue, Worker, FlowProducer, type Job } from 'bullmq';
import type { Logger } from '@kidsvid/shared';
import { JOB_NAMES, PIPELINE_STAGES, type JobName, type JobData } from './jobs.js';

/** Pipeline queue manager using BullMQ + Redis.
 * Supports individual job submission, full pipeline flows, and worker registration. */

export interface QueueManagerOptions {
  redisUrl: string;
  concurrency?: number;
}

export interface JobStatus {
  id: string;
  name: string;
  state: string;
  progress: number;
  attempts: number;
  timestamp: number;
  finishedOn?: number;
  failedReason?: string;
  data: Record<string, unknown>;
}

const QUEUE_NAME = 'kidsvid-pipeline';

export class QueueManager {
  private queue: Queue;
  private flowProducer: FlowProducer;
  private workers: Worker[] = [];
  private connection: { host: string; port: number };

  constructor(
    private options: QueueManagerOptions,
    private logger: Logger,
  ) {
    this.connection = parseRedisUrl(options.redisUrl);
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.flowProducer = new FlowProducer({ connection: this.connection });
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

  /** Schedule the full pipeline as a flow (chained jobs with dependencies) */
  async schedulePipeline(config: {
    channelIds?: string[];
    educationalCategory?: string;
    topic?: string;
    ageBracket?: string;
    characterIds?: number[];
    dryRun?: boolean;
  }): Promise<string[]> {
    // Build flow from the bottom up (BullMQ FlowProducer uses children-first ordering)
    const flow = await this.flowProducer.add({
      name: JOB_NAMES.TRACK,
      queueName: QUEUE_NAME,
      data: { type: 'track-performance' } as JobData,
      children: [
        {
          name: JOB_NAMES.PUBLISH,
          queueName: QUEUE_NAME,
          data: {
            type: 'publish',
            generatedVideoId: 0, // Filled by preceding job
            dryRun: config.dryRun ?? true,
          } as JobData,
          children: [
            {
              name: JOB_NAMES.REVIEW,
              queueName: QUEUE_NAME,
              data: {
                type: 'review',
                generatedVideoId: 0,
              } as JobData,
              children: [
                {
                  name: JOB_NAMES.QUALITY_CHECK,
                  queueName: QUEUE_NAME,
                  data: {
                    type: 'quality-check',
                    generatedVideoId: 0,
                  } as JobData,
                  children: [
                    {
                      name: JOB_NAMES.GENERATE_MEDIA,
                      queueName: QUEUE_NAME,
                      data: {
                        type: 'generate-media',
                        scriptId: 0,
                        generateThumbnail: true,
                        generateVoice: true,
                        generateMusic: true,
                        generateVideo: true,
                      } as JobData,
                      children: [
                        {
                          name: JOB_NAMES.GENERATE_SCRIPT,
                          queueName: QUEUE_NAME,
                          data: {
                            type: 'generate-script',
                            educationalCategory: config.educationalCategory ?? 'early_math',
                            topic: config.topic ?? 'counting to 10',
                            ageBracket: config.ageBracket ?? '4-6',
                            characterIds: config.characterIds ?? [0],
                          } as JobData,
                          children: [
                            {
                              name: JOB_NAMES.ANALYZE,
                              queueName: QUEUE_NAME,
                              data: {
                                type: 'analyze',
                                channelIds: config.channelIds,
                              } as JobData,
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const jobIds = this.collectFlowJobIds(flow);
    this.logger.info({ jobIds, stages: PIPELINE_STAGES.length }, 'Full pipeline scheduled');
    return jobIds;
  }

  /** Register a processor for a specific job type */
  registerProcessor(
    name: JobName,
    processor: (job: Job) => Promise<unknown>,
  ): void {
    const worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        if (job.name !== name) return;
        this.logger.info({ jobId: job.id, name: job.name }, 'Processing job');
        return processor(job);
      },
      {
        connection: this.connection,
        concurrency: this.options.concurrency ?? 1,
      },
    );

    worker.on('completed', (job) => {
      this.logger.info({ jobId: job.id, name: job.name }, 'Job completed');
    });

    worker.on('failed', (job, err) => {
      this.logger.error({ jobId: job?.id, name: job?.name, err: err.message }, 'Job failed');
    });

    this.workers.push(worker);
  }

  /** Get queue health stats */
  async getHealth(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /** Get recent job history */
  async getJobHistory(limit = 20): Promise<JobStatus[]> {
    const [completed, failed, active, waiting] = await Promise.all([
      this.queue.getCompleted(0, limit),
      this.queue.getFailed(0, limit),
      this.queue.getActive(0, limit),
      this.queue.getWaiting(0, limit),
    ]);

    const allJobs = [...completed, ...failed, ...active, ...waiting];
    allJobs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    return allJobs.slice(0, limit).map((job) => ({
      id: job.id ?? '',
      name: job.name,
      state: job.finishedOn
        ? job.failedReason
          ? 'failed'
          : 'completed'
        : job.processedOn
          ? 'active'
          : 'waiting',
      progress: typeof job.progress === 'number' ? job.progress : 0,
      attempts: job.attemptsMade,
      timestamp: job.timestamp ?? 0,
      finishedOn: job.finishedOn ?? undefined,
      failedReason: job.failedReason ?? undefined,
      data: job.data as Record<string, unknown>,
    }));
  }

  /** Get content queue (videos in review state) */
  async getReviewQueue(): Promise<JobStatus[]> {
    const jobs = await this.queue.getWaiting(0, 50);
    return jobs
      .filter((j) => j.name === JOB_NAMES.REVIEW)
      .map((job) => ({
        id: job.id ?? '',
        name: job.name,
        state: 'waiting',
        progress: 0,
        attempts: job.attemptsMade,
        timestamp: job.timestamp ?? 0,
        data: job.data as Record<string, unknown>,
      }));
  }

  /** Approve a video in the review queue */
  async approveVideo(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Update job data to mark as approved
    await job.updateData({ ...job.data, approved: true });
    this.logger.info({ jobId }, 'Video approved for publishing');
  }

  /** Reject a video in the review queue */
  async rejectVideo(jobId: string, reason: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.moveToFailed(new Error(`Rejected: ${reason}`), '0');
    this.logger.info({ jobId, reason }, 'Video rejected');
  }

  /** Shutdown gracefully */
  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await this.queue.close();
    await this.flowProducer.close();
    this.logger.info('Queue manager shut down');
  }

  private collectFlowJobIds(flow: { job: { id?: string }; children?: Array<{ job: { id?: string }; children?: unknown[] }> }): string[] {
    const ids: string[] = [];
    if (flow.job.id) ids.push(flow.job.id);
    if (flow.children) {
      for (const child of flow.children) {
        ids.push(...this.collectFlowJobIds(child as typeof flow));
      }
    }
    return ids;
  }
}

function parseRedisUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
  };
}
