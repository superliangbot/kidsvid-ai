import { loadConfig, createLogger } from '@kidsvid/shared';
import { QueueManager } from './queue.js';
import { createDashboard } from './dashboard.js';
import { JOB_NAMES } from './jobs.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
kidsvid-ai orchestrator — Pipeline orchestration with BullMQ

Usage:
  npm run orchestrate [options]

Commands:
  --dashboard          Start the dashboard API server
  --port <n>           Dashboard port (default: 3000)
  --analyze            Queue an analysis job
  --generate           Queue a generation job
  --generate-media     Queue a media generation job
  --quality-check      Queue a quality check job
  --publish            Queue a publish job (dry-run by default)
  --track              Queue a performance tracking job
  --report             Queue a weekly report job
  --score              Queue a strategy scoring job
  --pipeline           Start the full pipeline (analyze → ... → track)
  --status             Show queue health status
  --history            Show recent job history
  --review             Show content review queue
  --approve <jobId>    Approve a video for publishing
  --reject <jobId>     Reject a video with reason
  --help, -h           Show this help

Requires Redis to be running (see docker-compose.yml).
    `);
    process.exit(0);
  }

  const config = loadConfig();
  const logger = createLogger('orchestrator', config.logLevel);

  const queueManager = new QueueManager(
    { redisUrl: config.redisUrl },
    logger,
  );

  try {
    // ─── Dashboard ───
    if (args.includes('--dashboard')) {
      const portIdx = args.indexOf('--port');
      const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 3000;
      createDashboard(queueManager, logger, port);
    }

    // ─── Individual Commands ───

    if (args.includes('--analyze')) {
      await queueManager.addJob(JOB_NAMES.ANALYZE, { type: 'analyze' });
      logger.info('Analysis job queued');
    }

    if (args.includes('--generate')) {
      await queueManager.addJob(JOB_NAMES.GENERATE_SCRIPT, {
        type: 'generate-script',
        educationalCategory: 'early_math',
        topic: 'counting to 10',
        ageBracket: '4-6',
        characterIds: [0],
      });
      logger.info('Generation job queued');
    }

    if (args.includes('--generate-media')) {
      await queueManager.addJob(JOB_NAMES.GENERATE_MEDIA, {
        type: 'generate-media',
        scriptId: 0,
        generateThumbnail: true,
        generateVoice: true,
        generateMusic: true,
        generateVideo: true,
      });
      logger.info('Media generation job queued');
    }

    if (args.includes('--quality-check')) {
      await queueManager.addJob(JOB_NAMES.QUALITY_CHECK, {
        type: 'quality-check',
        generatedVideoId: 0,
      });
      logger.info('Quality check job queued');
    }

    if (args.includes('--publish')) {
      await queueManager.addJob(JOB_NAMES.PUBLISH, {
        type: 'publish',
        generatedVideoId: 0,
        dryRun: config.dryRun,
      });
      logger.info('Publish job queued');
    }

    if (args.includes('--track')) {
      await queueManager.addJob(JOB_NAMES.TRACK, { type: 'track-performance' });
      logger.info('Performance tracking job queued');
    }

    if (args.includes('--report')) {
      await queueManager.addJob(JOB_NAMES.REPORT, {
        type: 'weekly-report',
        period: 'weekly',
      });
      logger.info('Weekly report job queued');
    }

    if (args.includes('--score')) {
      await queueManager.addJob(JOB_NAMES.SCORE, { type: 'score-strategies' });
      logger.info('Strategy scoring job queued');
    }

    // ─── Full Pipeline ───

    if (args.includes('--pipeline')) {
      const jobIds = await queueManager.schedulePipeline({
        dryRun: config.dryRun,
      });
      logger.info({ stages: jobIds.length }, 'Full pipeline scheduled');
    }

    // ─── Status Commands ───

    if (args.includes('--status')) {
      const health = await queueManager.getHealth();
      console.log('\nQueue Health:');
      console.log(`  Waiting:   ${health.waiting}`);
      console.log(`  Active:    ${health.active}`);
      console.log(`  Completed: ${health.completed}`);
      console.log(`  Failed:    ${health.failed}`);
      console.log(`  Delayed:   ${health.delayed}`);
    }

    if (args.includes('--history')) {
      const jobs = await queueManager.getJobHistory(10);
      console.log('\nRecent Jobs:');
      for (const job of jobs) {
        const time = new Date(job.timestamp).toISOString().slice(11, 19);
        console.log(
          `  [${job.state.padEnd(9)}] ${job.name.padEnd(20)} id=${job.id} at=${time}`,
        );
      }
    }

    if (args.includes('--review')) {
      const queue = await queueManager.getReviewQueue();
      console.log(`\nReview Queue (${queue.length} items):`);
      for (const item of queue) {
        console.log(`  id=${item.id} data=${JSON.stringify(item.data)}`);
      }
    }

    if (args.includes('--approve')) {
      const idx = args.indexOf('--approve');
      const jobId = args[idx + 1];
      if (!jobId) {
        console.error('Usage: --approve <jobId>');
        process.exit(1);
      }
      await queueManager.approveVideo(jobId);
      logger.info({ jobId }, 'Video approved');
    }

    if (args.includes('--reject')) {
      const idx = args.indexOf('--reject');
      const jobId = args[idx + 1];
      if (!jobId) {
        console.error('Usage: --reject <jobId> [reason]');
        process.exit(1);
      }
      const reasonIdx = idx + 2;
      const reason = args[reasonIdx] ?? 'Rejected via CLI';
      await queueManager.rejectVideo(jobId, reason);
      logger.info({ jobId, reason }, 'Video rejected');
    }

    // Keep process alive only if dashboard is running
    if (!args.includes('--dashboard')) {
      await queueManager.shutdown();
    }
  } catch (err) {
    logger.error({ err }, 'Orchestrator error');
    await queueManager.shutdown();
    process.exit(1);
  }
}

main();
