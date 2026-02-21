import { loadAnalyzerConfig, createLogger, YouTubeClient, getDb } from '@kidsvid/shared';
import { AnalysisPipeline } from './pipeline.js';

async function main() {
  const args = process.argv.slice(2);
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`
kidsvid-ai analyzer — Analyze top YouTube Kids channels

Usage:
  npm run analyze [options]

Options:
  --channels <ids>     Comma-separated YouTube channel IDs (default: top 30 kids channels)
  --videos <n>         Videos per channel to analyze (default: 50)
  --skip-existing      Skip channels analyzed in last 24h
  --no-store           Don't store patterns to DB (dry run)
  --help, -h           Show this help
    `);
    process.exit(0);
  }

  const config = loadAnalyzerConfig();
  const logger = createLogger('analyzer', config.logLevel);

  logger.info('Starting YouTube Kids channel analysis...');

  const youtube = new YouTubeClient({ apiKey: config.youtubeApiKey });
  const db = getDb(config.databaseUrl);
  const pipeline = new AnalysisPipeline(youtube, db, logger);

  // Parse CLI args
  const channelIdxArg = args.indexOf('--channels');
  const channelIds = channelIdxArg >= 0 ? args[channelIdxArg + 1]?.split(',') : undefined;

  const videosIdx = args.indexOf('--videos');
  const videosPerChannel = videosIdx >= 0 ? parseInt(args[videosIdx + 1], 10) : 50;

  const skipExisting = args.includes('--skip-existing');
  const storePatterns = !args.includes('--no-store');

  try {
    const result = await pipeline.run({
      channelIds,
      videosPerChannel,
      skipExisting,
      storePatterns,
    });

    logger.info('═══════════════════════════════════════');
    logger.info('Analysis complete!');
    logger.info(`  Channels: ${result.channelsAnalyzed}`);
    logger.info(`  Videos: ${result.videosAnalyzed}`);
    logger.info(`  Patterns: ${result.patterns.length}`);
    logger.info(`  API quota used: ${result.apiQuotaUsed}/10,000`);
    logger.info('═══════════════════════════════════════');

    // Print key findings
    if (result.patterns.length > 0) {
      logger.info('\nKey Findings:');
      const highConf = result.patterns
        .filter((p) => p.confidence >= 0.7 && !p.category)
        .slice(0, 10);
      for (const p of highConf) {
        logger.info(`  [${p.patternType}] ${p.finding}`);
      }
    }
  } catch (err) {
    logger.error({ err }, 'Analysis failed');
    process.exit(1);
  }
}

main();
