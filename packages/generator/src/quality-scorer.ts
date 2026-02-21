import type {
  ContentQualityScore,
  EngagementHookType,
  AgeBracket,
  EpisodeStructure,
  ANTI_BRAIN_ROT_RULES,
} from '@kidsvid/shared';

/** Content quality scorer — gates what gets published.
 * Both educationalValue and engagementPotential must be >7 to pass. */

export interface ScoreableContent {
  title: string;
  script: string;
  educationalObjective: string;
  learningTakeaways: string[];
  engagementHooks: EngagementHookType[];
  episodeStructure: EpisodeStructure;
  ageBracket: AgeBracket;
  estimatedDuration: number; // seconds
}

const PASSING_THRESHOLD = 7;

export function scoreContent(content: ScoreableContent): ContentQualityScore {
  const feedback: string[] = [];

  const educationalValue = scoreEducational(content, feedback);
  const engagementPotential = scoreEngagement(content, feedback);
  const passed = educationalValue >= PASSING_THRESHOLD && engagementPotential >= PASSING_THRESHOLD;

  if (!passed) {
    if (educationalValue < PASSING_THRESHOLD) {
      feedback.push(
        `Educational value (${educationalValue}/10) below threshold of ${PASSING_THRESHOLD}. Add clearer learning objectives.`,
      );
    }
    if (engagementPotential < PASSING_THRESHOLD) {
      feedback.push(
        `Engagement potential (${engagementPotential}/10) below threshold of ${PASSING_THRESHOLD}. Add more hooks and interactive moments.`,
      );
    }
  }

  return { educationalValue, engagementPotential, passed, feedback };
}

function scoreEducational(content: ScoreableContent, feedback: string[]): number {
  let score = 0;

  // Has a clear educational objective (0-2)
  if (content.educationalObjective && content.educationalObjective.length > 10) {
    score += 2;
  } else {
    feedback.push('Educational objective is missing or too vague');
  }

  // Has learning takeaways (0-2)
  if (content.learningTakeaways.length >= 1) {
    score += Math.min(content.learningTakeaways.length, 2);
  } else {
    feedback.push('No learning takeaways defined');
  }

  // Script contains educational content markers (0-3)
  const eduMarkers = [
    /let'?s\s+(learn|count|find|discover|explore)/i,
    /can you\s+(count|name|find|spot|guess)/i,
    /do you know/i,
    /that'?s (right|correct|amazing)/i,
    /(one|two|three|four|five|1|2|3|4|5)/i,
    /(red|blue|green|yellow|purple|orange)/i,
    /(circle|square|triangle|rectangle|star)/i,
    /\b(A|B|C)\b.*\bfor\b/i,
  ];
  const scriptMatches = eduMarkers.filter((r) => r.test(content.script)).length;
  score += Math.min(Math.floor(scriptMatches / 2), 3);
  if (scriptMatches < 2) {
    feedback.push('Script lacks educational content markers (counting, colors, shapes, etc.)');
  }

  // Age-appropriate duration (0-1)
  const durationOk = checkDurationForAge(content.ageBracket, content.estimatedDuration);
  if (durationOk) {
    score += 1;
  } else {
    feedback.push(`Duration ${content.estimatedDuration}s may not be appropriate for age ${content.ageBracket}`);
  }

  // Anti-brain-rot: every section serves learning (0-2)
  if (content.episodeStructure.exploration.description.length > 20) {
    score += 1;
  }
  if (content.episodeStructure.resolution.description.includes('learn') ||
      content.episodeStructure.resolution.description.includes('discover') ||
      content.episodeStructure.resolution.description.includes('remember')) {
    score += 1;
  }

  return Math.min(score, 10);
}

function scoreEngagement(content: ScoreableContent, feedback: string[]): number {
  let score = 0;

  // Engagement hooks present (0-3)
  const hookCount = content.engagementHooks.length;
  if (hookCount >= 3) {
    score += 3;
  } else if (hookCount >= 2) {
    score += 2;
  } else if (hookCount >= 1) {
    score += 1;
  } else {
    feedback.push('No engagement hooks defined');
  }

  // Has variety of hook types (0-2)
  const uniqueHooks = new Set(content.engagementHooks);
  if (uniqueHooks.size >= 3) {
    score += 2;
  } else if (uniqueHooks.size >= 2) {
    score += 1;
  }

  // Must-have hooks check (0-2)
  const criticalHooks: EngagementHookType[] = ['call_response', 'reward_loop'];
  const hasCritical = criticalHooks.filter((h) => uniqueHooks.has(h)).length;
  score += hasCritical;
  if (hasCritical === 0) {
    feedback.push('Missing critical engagement hooks: call_response and reward_loop');
  }

  // Episode structure completeness (0-2)
  const structure = content.episodeStructure;
  const structureParts = [
    structure.hook.description,
    structure.problem.description,
    structure.exploration.description,
    structure.resolution.description,
    structure.nextPreview.description,
  ];
  const filledParts = structureParts.filter((s) => s && s.length > 5).length;
  score += Math.min(Math.floor(filledParts / 2), 2);
  if (filledParts < 4) {
    feedback.push('Episode structure is incomplete — fill all sections');
  }

  // Title engagement (0-1)
  if (content.title.includes('?') || content.title.includes('!') || /\d/.test(content.title)) {
    score += 1;
  }

  return Math.min(score, 10);
}

function checkDurationForAge(ageBracket: AgeBracket, duration: number): boolean {
  switch (ageBracket) {
    case '2-4':
      return duration >= 60 && duration <= 180;
    case '4-6':
      return duration >= 120 && duration <= 300;
    case '6-8':
      return duration >= 120 && duration <= 420;
    default:
      return duration >= 60 && duration <= 420;
  }
}

export { PASSING_THRESHOLD };
