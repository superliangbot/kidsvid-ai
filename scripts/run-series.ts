#!/usr/bin/env tsx
/**
 * Generate a complete 5-episode "Cosmo Counts!" series.
 * Each episode generated via Claude, quality-scored, saved to DB.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { createLogger, getDb, withRetry, isRetryableError } from '../packages/shared/src/index.js';
import type { ScriptRequest, EngagementHookType } from '../packages/shared/src/types.js';
import { generatedVideos, contentSeries } from '../packages/shared/src/db/index.js';
import { ScriptGenerator } from '../packages/generator/src/script-generator.js';
import { ContentDeduplicator } from '../packages/generator/src/dedup.js';

const logger = createLogger('series-runner', 'info');

const EPISODES = [
  { topic: 'numbers 1-5', objective: 'Learn to count from 1 to 5 using fun objects' },
  { topic: 'numbers 6-10', objective: 'Learn to count from 6 to 10, building on 1-5' },
  { topic: 'shapes: circle, square, triangle', objective: 'Identify and name three basic shapes' },
  { topic: 'colors and counting: count 3 red balls, 2 blue stars', objective: 'Combine color recognition with counting practice' },
  { topic: 'big vs small, more vs less', objective: 'Compare sizes and quantities using everyday objects' },
];

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY!;
  const dbUrl = process.env.DATABASE_URL!;
  if (!anthropicKey || !dbUrl) { console.error('Missing keys'); process.exit(1); }

  const db = getDb(dbUrl);
  const generator = new ScriptGenerator({ anthropicApiKey: anthropicKey, maxRetries: 1 }, logger);
  const dedup = new ContentDeduplicator(db, logger);

  const SERIES_ID = 'cosmo-counts-s1';
  const SERIES_NAME = 'Cosmo Counts!';

  // Save series definition
  logger.info(`═══ Generating series: "${SERIES_NAME}" (5 episodes) ═══\n`);

  // Upsert series row
  const existing = await db.query.contentSeries.findFirst({
    where: (cs, { eq }) => eq(cs.seriesId, SERIES_ID),
  });
  if (!existing) {
    await db.insert(contentSeries).values({
      seriesId: SERIES_ID,
      name: SERIES_NAME,
      description: 'A 5-episode early math series for ages 2-4 starring Cosmo the curious robot.',
      educationalCategory: 'early_math',
      ageBracket: '2-4',
      characterIds: [0],
      totalEpisodes: 5,
      season: 1,
      storyArc: 'Cosmo discovers the world of numbers, shapes, and sizes across 5 episodes.',
      episodeOutlines: EPISODES.map((e, i) => ({ episodeNumber: i + 1, ...e })),
    });
    logger.info('Series definition saved to DB');
  }

  const results: Array<{ ep: number; title: string; edu: number; eng: number; passed: boolean; id: number }> = [];

  for (let i = 0; i < EPISODES.length; i++) {
    const ep = EPISODES[i];
    const epNum = i + 1;

    logger.info(`\n─── Episode ${epNum}/5: "${ep.topic}" ───`);

    // Dedup check
    const dedupResult = await dedup.check({
      topic: ep.topic,
      category: 'educational',
      educationalCategory: 'early_math',
      ageBracket: '2-4',
    });
    const actualTopic = dedupResult.isDuplicate && dedupResult.suggestedAngle
      ? dedupResult.suggestedAngle
      : ep.topic;
    if (dedupResult.isDuplicate) {
      logger.info(`  Dedup: found ${dedupResult.similarCount} similar → using angle: "${actualTopic}"`);
    }

    const request: ScriptRequest = {
      category: 'educational',
      educationalCategory: 'early_math',
      educationalObjective: ep.objective,
      engagementHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'direct_address'] as EngagementHookType[],
      targetDuration: 150,
      ageBracket: '2-4',
      characterIds: [0],
      topic: actualTopic,
      seriesName: SERIES_NAME,
      episodeNumber: epNum,
    };

    // Generate with retry
    const script = await withRetry(
      () => generator.generate(request),
      logger,
      `generate-ep-${epNum}`,
      { maxAttempts: 2, initialDelayMs: 5000, retryOn: isRetryableError },
    );

    const q = script.qualityScore;
    logger.info(`  Title: "${script.title}"`);
    logger.info(`  Quality: edu=${q.educationalValue}/10, eng=${q.engagementPotential}/10, passed=${q.passed ? '✓' : '✗'}`);
    if (q.feedback.length > 0) {
      for (const f of q.feedback) logger.info(`    ${f}`);
    }

    // Save to DB
    const [saved] = await db.insert(generatedVideos).values({
      title: script.title,
      description: script.description,
      script: script.script,
      category: 'educational',
      targetDuration: script.estimatedDuration,
      targetAgeMin: 2,
      targetAgeMax: 4,
      characters: [0],
      tags: script.tags,
      seriesId: SERIES_ID,
      episodeNumber: epNum,
      status: q.passed ? 'script_ready' : 'draft',
      generationMetadata: {
        qualityScore: q,
        educationalObjective: script.educationalObjective,
        learningTakeaways: script.learningTakeaways,
        engagementHooks: script.engagementHooks,
      },
    }).returning();

    results.push({ ep: epNum, title: script.title, edu: q.educationalValue, eng: q.engagementPotential, passed: q.passed, id: saved.id });
    logger.info(`  Saved: id=${saved.id}, status=${saved.status}`);
  }

  // Summary
  logger.info('\n═══════════════════════════════════════');
  logger.info('SERIES GENERATION COMPLETE');
  logger.info('═══════════════════════════════════════');
  logger.info(`Series: "${SERIES_NAME}" (${SERIES_ID})`);
  for (const r of results) {
    logger.info(`  Ep.${r.ep} [id=${r.id}] "${r.title}" — edu=${r.edu} eng=${r.eng} ${r.passed ? '✓' : '✗'}`);
  }
  const passCount = results.filter(r => r.passed).length;
  logger.info(`Pass rate: ${passCount}/${results.length}`);
  const avgEdu = results.reduce((s, r) => s + r.edu, 0) / results.length;
  const avgEng = results.reduce((s, r) => s + r.eng, 0) / results.length;
  logger.info(`Avg quality: edu=${avgEdu.toFixed(1)}, eng=${avgEng.toFixed(1)}`);

  process.exit(0);
}

main().catch((err) => { logger.error({ err }, 'Series generation failed'); process.exit(1); });
