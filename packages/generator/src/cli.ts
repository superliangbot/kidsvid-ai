import { loadConfig, createLogger } from '@kidsvid/shared';
import type { ScriptRequest } from '@kidsvid/shared';
import { ScriptGenerator } from './script-generator.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
kidsvid-ai generator — Generate educational kids content

Usage:
  npm run generate [options]

Options:
  --category <cat>     Educational category: early_math, phonics_reading, science,
                       social_emotional, world_knowledge, problem_solving, music_rhythm
  --topic <topic>      Topic for the content (e.g., "counting to 10", "letter B")
  --age <bracket>      Age bracket: 2-4, 4-6, 6-8 (default: 4-6)
  --character <name>   Character name from bible (default: Cosmo)
  --help, -h           Show this help
    `);
    process.exit(0);
  }

  const config = loadConfig();
  const logger = createLogger('generator', config.logLevel);

  if (!config.anthropicApiKey) {
    logger.error('ANTHROPIC_API_KEY is required for content generation');
    process.exit(1);
  }

  const generator = new ScriptGenerator(
    { anthropicApiKey: config.anthropicApiKey },
    logger,
  );

  const categoryIdx = args.indexOf('--category');
  const topicIdx = args.indexOf('--topic');
  const ageIdx = args.indexOf('--age');

  const request: ScriptRequest = {
    category: 'educational',
    educationalCategory: (categoryIdx >= 0 ? args[categoryIdx + 1] : 'early_math') as any,
    educationalObjective: topicIdx >= 0 ? args[topicIdx + 1] : 'Learn to count to 10',
    engagementHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'direct_address'],
    targetDuration: 180,
    ageBracket: (ageIdx >= 0 ? args[ageIdx + 1] : '4-6') as any,
    characterIds: [0], // Cosmo by default
    topic: topicIdx >= 0 ? args[topicIdx + 1] : undefined,
  };

  try {
    const script = await generator.generate(request);
    logger.info({ title: script.title, passed: script.qualityScore.passed }, 'Script generated');
    console.log(JSON.stringify(script, null, 2));
  } catch (err) {
    logger.error({ err }, 'Generation failed');
    process.exit(1);
  }
}

main();
