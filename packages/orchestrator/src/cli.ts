import { loadConfig, createLogger } from '@kidsvid/shared';
import { QueueManager } from './queue.js';
import { createDashboard } from './dashboard.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
kidsvid-ai orchestrator — Pipeline orchestration with BullMQ

Usage:
  npm run orchestrate [options]

Options:
  --dashboard          Start the dashboard API server (default port 3000)
  --port <n>           Dashboard port (default: 3000)
  --analyze            Queue an analysis job
  --generate           Queue a generation job
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

  if (args.includes('--dashboard')) {
    const portIdx = args.indexOf('--port');
    const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 3000;
    createDashboard(queueManager, logger, port);
  }

  if (args.includes('--analyze')) {
    await queueManager.addJob('analyze', {});
    logger.info('Analysis job queued');
  }

  if (args.includes('--generate')) {
    await queueManager.addJob('generate-script', {
      educationalCategory: 'early_math',
      topic: 'counting to 10',
      ageBracket: '4-6',
      characterIds: [0],
    });
    logger.info('Generation job queued');
  }

  // Keep process alive if dashboard is running
  if (!args.includes('--dashboard')) {
    await queueManager.shutdown();
  }
}

main();
