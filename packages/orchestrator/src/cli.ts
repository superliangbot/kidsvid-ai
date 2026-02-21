import { loadConfig, createLogger } from '@kidsvid/shared';
import { QueueManager } from './queue.js';
import { createDashboard } from './dashboard.js';
import { JOB_NAMES } from './jobs.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  const config = loadConfig();
  const logger = createLogger('kidsvid', config.logLevel);

  // Dynamic imports for chalk/ora/table (ESM)
  const chalk = (await import('chalk')).default;
  const Table = (await import('cli-table3')).default;

  const print = {
    header: (text: string) => console.log('\n' + chalk.bold.cyan(`  ${text}`)),
    success: (text: string) => console.log(chalk.green(`  ✓ ${text}`)),
    info: (text: string) => console.log(chalk.blue(`  ℹ ${text}`)),
    warn: (text: string) => console.log(chalk.yellow(`  ⚠ ${text}`)),
    error: (text: string) => console.log(chalk.red(`  ✗ ${text}`)),
    dim: (text: string) => console.log(chalk.dim(`    ${text}`)),
  };

  try {
    switch (command) {
      case 'analyze': {
        print.header('Channel Analysis');
        const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
        const jobId = await qm.addJob(JOB_NAMES.ANALYZE, {
          type: 'analyze',
          channelIds: getFlag(args, '--channels')?.split(','),
          videosPerChannel: getFlag(args, '--videos') ? parseInt(getFlag(args, '--videos')!, 10) : undefined,
        });
        print.success(`Analysis job queued (${chalk.bold(jobId)})`);
        print.dim('Run "kidsvid status" to monitor progress');
        await qm.shutdown();
        break;
      }

      case 'generate': {
        const seriesName = getFlag(args, '--series');
        const episodes = getFlag(args, '--episodes');
        const topic = getFlag(args, '--topic') ?? 'counting to 10';
        const age = getFlag(args, '--age') ?? '4-6';
        const category = getFlag(args, '--category') ?? 'early_math';

        if (seriesName) {
          print.header(`Series Generation: "${seriesName}"`);
          const { SeriesGenerator } = await import('@kidsvid/generator');
          const seriesGen = new SeriesGenerator(logger);
          const series = seriesGen.generate({
            name: seriesName,
            educationalCategory: category as 'early_math',
            topic,
            ageBracket: age as '4-6',
            totalEpisodes: episodes ? parseInt(episodes, 10) : 10,
            characterIds: [0],
          });

          const table = new Table({
            head: [
              chalk.cyan('Ep'),
              chalk.cyan('Title'),
              chalk.cyan('Topic'),
              chalk.cyan('Duration'),
            ],
            colWidths: [5, 35, 30, 10],
          });

          for (const ep of series.episodeOutlines) {
            table.push([
              ep.episodeNumber.toString(),
              ep.title.slice(0, 33),
              ep.topic,
              `${Math.round(ep.targetDuration / 60)}min`,
            ]);
          }

          console.log(table.toString());
          print.success(`Series "${series.name}" generated with ${series.totalEpisodes} episodes`);
          print.dim(`Series ID: ${series.id}`);
          print.dim(`Story arc: ${series.storyArc.slice(0, 100)}...`);
        } else {
          print.header('Single Video Generation');
          const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
          const jobId = await qm.addJob(JOB_NAMES.GENERATE_SCRIPT, {
            type: 'generate-script',
            educationalCategory: category,
            topic,
            ageBracket: age,
            characterIds: [0],
          });
          print.success(`Generation job queued (${chalk.bold(jobId)})`);
          print.dim(`Topic: ${topic} | Age: ${age} | Category: ${category}`);
          await qm.shutdown();
        }
        break;
      }

      case 'review': {
        print.header('Content Review Queue');
        const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
        const queue = await qm.getReviewQueue();

        if (queue.length === 0) {
          print.info('No content pending review');
        } else {
          const table = new Table({
            head: [
              chalk.cyan('Job ID'),
              chalk.cyan('Type'),
              chalk.cyan('Status'),
              chalk.cyan('Data'),
            ],
            colWidths: [15, 15, 12, 40],
          });

          for (const item of queue) {
            table.push([
              item.id,
              item.name,
              chalk.yellow(item.state),
              JSON.stringify(item.data).slice(0, 38),
            ]);
          }
          console.log(table.toString());
          print.info(`${queue.length} item(s) pending review`);
          print.dim('Use "kidsvid approve <id>" or "kidsvid reject <id>"');
        }
        await qm.shutdown();
        break;
      }

      case 'approve': {
        const jobId = args[1];
        if (!jobId) {
          print.error('Usage: kidsvid approve <jobId>');
          process.exit(1);
        }
        print.header('Approve Content');
        const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
        await qm.approveVideo(jobId);
        print.success(`Video ${chalk.bold(jobId)} approved for publishing`);
        await qm.shutdown();
        break;
      }

      case 'reject': {
        const jobId = args[1];
        const reason = args.slice(2).join(' ') || 'Rejected via CLI';
        if (!jobId) {
          print.error('Usage: kidsvid reject <jobId> [reason]');
          process.exit(1);
        }
        print.header('Reject Content');
        const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
        await qm.rejectVideo(jobId, reason);
        print.warn(`Video ${chalk.bold(jobId)} rejected: ${reason}`);
        await qm.shutdown();
        break;
      }

      case 'publish': {
        print.header('Publish Approved Content');
        const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
        const jobId = await qm.addJob(JOB_NAMES.PUBLISH, {
          type: 'publish',
          generatedVideoId: 0,
          dryRun: config.dryRun,
        });
        print.success(`Publish job queued (${chalk.bold(jobId)})`);
        if (config.dryRun) print.warn('DRY RUN mode — no actual upload will occur');
        await qm.shutdown();
        break;
      }

      case 'stats': {
        print.header('Queue Health & Statistics');
        const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
        const health = await qm.getHealth();

        const table = new Table();
        table.push(
          { [chalk.cyan('Waiting')]: chalk.yellow(health.waiting.toString()) },
          { [chalk.cyan('Active')]: chalk.blue(health.active.toString()) },
          { [chalk.cyan('Completed')]: chalk.green(health.completed.toString()) },
          { [chalk.cyan('Failed')]: health.failed > 0 ? chalk.red(health.failed.toString()) : '0' },
          { [chalk.cyan('Delayed')]: health.delayed.toString() },
        );
        console.log(table.toString());

        // Show recent job history
        const jobs = await qm.getJobHistory(10);
        if (jobs.length > 0) {
          print.header('Recent Jobs');
          const histTable = new Table({
            head: [
              chalk.cyan('ID'),
              chalk.cyan('Job'),
              chalk.cyan('Status'),
              chalk.cyan('Time'),
            ],
            colWidths: [12, 22, 12, 22],
          });

          for (const job of jobs) {
            const statusColor = job.state === 'completed' ? chalk.green
              : job.state === 'failed' ? chalk.red
              : job.state === 'active' ? chalk.blue
              : chalk.yellow;

            histTable.push([
              job.id.slice(0, 10),
              job.name,
              statusColor(job.state),
              new Date(job.timestamp).toISOString().slice(0, 19),
            ]);
          }
          console.log(histTable.toString());
        }

        await qm.shutdown();
        break;
      }

      case 'report': {
        print.header('Weekly Performance Report');
        const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
        const jobId = await qm.addJob(JOB_NAMES.REPORT, {
          type: 'weekly-report',
          period: 'weekly',
        });
        print.success(`Report generation queued (${chalk.bold(jobId)})`);
        await qm.shutdown();
        break;
      }

      case 'pipeline': {
        print.header('Full Pipeline');
        const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
        const jobIds = await qm.schedulePipeline({
          dryRun: config.dryRun,
          educationalCategory: getFlag(args, '--category') ?? 'early_math',
          topic: getFlag(args, '--topic') ?? 'counting to 10',
          ageBracket: getFlag(args, '--age') ?? '4-6',
        });

        print.success(`Pipeline started with ${jobIds.length} stages`);
        for (let i = 0; i < jobIds.length; i++) {
          print.dim(`  Stage ${i + 1}: ${jobIds[i]}`);
        }
        if (config.dryRun) print.warn('DRY RUN mode enabled');
        await qm.shutdown();
        break;
      }

      case 'dashboard': {
        print.header('Dashboard API');
        const portArg = getFlag(args, '--port');
        const port = portArg ? parseInt(portArg, 10) : 3000;
        const qm = new QueueManager({ redisUrl: config.redisUrl }, logger);
        createDashboard(qm, logger, port);
        print.success(`Dashboard running at ${chalk.underline(`http://localhost:${port}`)}`);
        print.dim('Endpoints: /health, /api/queue/stats, /api/jobs, /api/review');
        print.dim('Press Ctrl+C to stop');
        break;
      }

      case 'strategy': {
        print.header('Channel Strategy');
        const { StrategyEngine } = await import('@kidsvid/analyzer');
        const engine = new StrategyEngine(logger);

        const topic = getFlag(args, '--topic') ?? 'counting';
        const category = getFlag(args, '--category') ?? 'educational';

        // Title recommendations
        const titles = engine.generateTitleRecommendations(topic, category, []);
        print.header('Title Recommendations');
        const titleTable = new Table({
          head: [chalk.cyan('Template'), chalk.cyan('Example'), chalk.cyan('CTR Boost')],
          colWidths: [30, 35, 12],
        });
        for (const t of titles.slice(0, 5)) {
          titleTable.push([
            t.template.slice(0, 28),
            t.example.slice(0, 33),
            chalk.green(`+${Math.round((t.expectedCtrBoost - 1) * 100)}%`),
          ]);
        }
        console.log(titleTable.toString());

        // Upload schedule
        const schedule = engine.optimizeUploadSchedule([]);
        print.header('Optimal Upload Times');
        const schedTable = new Table({
          head: [chalk.cyan('Day'), chalk.cyan('Hour (UTC)'), chalk.cyan('Boost')],
          colWidths: [15, 15, 10],
        });
        for (const s of schedule.slice(0, 5)) {
          schedTable.push([
            s.day,
            `${s.hourUtc}:00`,
            chalk.green(`${s.expectedEngagementBoost}x`),
          ]);
        }
        console.log(schedTable.toString());

        // Growth projections
        const growth = engine.projectGrowth({
          currentSubscribers: 0,
          currentWeeklyViews: 0,
          currentTotalViews: 0,
          uploadsPerWeek: 5,
          avgViewsPerVideo: 1000,
          weeksToProject: 52,
        });
        print.header('Growth Projections (5 videos/week, 1K avg views)');
        const growthTable = new Table({
          head: [chalk.cyan('Timeframe'), chalk.cyan('Subscribers'), chalk.cyan('Weekly Views'), chalk.cyan('Confidence')],
          colWidths: [12, 15, 15, 12],
        });
        for (const g of growth) {
          const label = g.weeksOut <= 4 ? `${g.weeksOut}w` : g.weeksOut <= 12 ? `${Math.round(g.weeksOut / 4)}mo` : `${Math.round(g.weeksOut / 52)}yr`;
          growthTable.push([
            label,
            g.projectedSubscribers.toLocaleString(),
            g.projectedWeeklyViews.toLocaleString(),
            `${Math.round(g.confidence * 100)}%`,
          ]);
        }
        console.log(growthTable.toString());
        break;
      }

      default:
        print.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const chalk = (await import('chalk')).default;
    console.error(chalk.red(`\n  ✗ Error: ${errMsg}`));
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
  kidsvid-ai — AI-powered YouTube Kids content engine

  Usage:
    npm run orchestrate <command> [options]

  Commands:
    analyze                    Run channel analysis
      --channels <ids>         Comma-separated YouTube channel IDs
      --videos <n>             Videos per channel (default: 50)

    generate                   Generate content
      --series "<name>"        Generate a full series (with --episodes)
      --episodes <n>           Number of episodes (default: 10)
      --single                 Generate a single video
      --topic "<topic>"        Content topic
      --age <bracket>          Age bracket: 2-4, 4-6, 6-8
      --category <cat>         Educational category

    review                     Show content review queue
    approve <id>               Approve content for publishing
    reject <id> [reason]       Reject content with reason

    publish                    Publish approved content
    stats                      Show queue health and job history
    report                     Generate weekly performance report
    pipeline                   Run the full pipeline end-to-end
    strategy                   Show channel strategy recommendations
      --topic "<topic>"        Topic for title recommendations
      --category <cat>         Content category
    dashboard                  Start the dashboard API server
      --port <n>               Port (default: 3000)
  `);
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

main();
