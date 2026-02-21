export { ScriptGenerator, type ScriptGeneratorOptions } from './script-generator.js';
export { scoreContent, checkAntiBrainRotRules, PASSING_THRESHOLD, type ScoreableContent } from './quality-scorer.js';
export { DEFAULT_CHARACTERS, getCharacterByName, getCharactersForAge } from './character-bible.js';
export {
  EPISODE_TEMPLATES,
  ENGAGEMENT_HOOK_DESCRIPTIONS,
  getTemplate,
  getTemplateForAge,
  getHooksForCategory,
  type EpisodeTemplate,
} from './templates/episode-structure.js';
export {
  SeriesGenerator,
  SERIES_TEMPLATES,
  type SeriesRequest,
} from './series-generator.js';
export {
  ThumbnailIntelligence,
  THUMBNAIL_PATTERNS,
} from './thumbnail-intelligence.js';
export { ContentDeduplicator, type DedupCheck, type DedupResult } from './dedup.js';
export * from './providers/index.js';
