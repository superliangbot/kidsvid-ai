import type {
  ContentQualityScore,
  EngagementHookType,
  AgeBracket,
  EpisodeStructure,
} from '@kidsvid/shared';

/** Content quality scorer — gates what gets published.
 * Both educationalValue and engagementPotential must be >7 to pass.
 * Anti-brain-rot rules are enforced: violations reduce the educational score. */

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

  // Anti-brain-rot check — can block passing even if scores are high
  const brainRotViolations = checkAntiBrainRotRules(content);
  if (brainRotViolations.length > 0) {
    feedback.push(...brainRotViolations);
  }

  const passed =
    educationalValue >= PASSING_THRESHOLD &&
    engagementPotential >= PASSING_THRESHOLD &&
    brainRotViolations.length === 0;

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
  if (content.learningTakeaways.length >= 2) {
    score += 2;
  } else if (content.learningTakeaways.length >= 1) {
    score += 1;
  } else {
    feedback.push('No learning takeaways defined');
  }

  // Script contains educational content markers (0-3)
  const eduMarkers = [
    /let'?s\s+(learn|count|find|discover|explore|practice|try)/i,
    /can you\s+(count|name|find|spot|guess|tell|show|help)/i,
    /do you (know|remember|see)/i,
    /that'?s (right|correct|amazing|wonderful|great)/i,
    /(one|two|three|four|five|six|seven|eight|nine|ten|1|2|3|4|5|6|7|8|9|10)/i,
    /(red|blue|green|yellow|purple|orange|pink|white|black|brown)/i,
    /(circle|square|triangle|rectangle|star|diamond|oval|hexagon)/i,
    /\b[A-Z]\b.*\b(is for|for|says)\b/i,
    /(bigger|smaller|taller|shorter|more|less|equal|same|different)/i,
    /(first|second|third|next|then|after|before|finally)/i,
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

  // Episode structure serves learning purpose (0-2)
  const structureScore = scoreStructureEducational(content.episodeStructure, feedback);
  score += structureScore;

  return Math.min(score, 10);
}

function scoreStructureEducational(structure: EpisodeStructure, feedback: string[]): number {
  let score = 0;

  // Exploration section is substantial and educational
  if (structure.exploration.description.length > 20) {
    score += 1;
  } else {
    feedback.push('Exploration/teaching section is too brief');
  }

  // Resolution references learning
  const resolutionEdu = /learn|discover|remember|found out|now (we|you) know/i;
  if (resolutionEdu.test(structure.resolution.description)) {
    score += 1;
  } else {
    feedback.push('Resolution should reference what was learned');
  }

  return score;
}

function scoreEngagement(content: ScoreableContent, feedback: string[]): number {
  let score = 0;

  // Engagement hooks present (0-3)
  const hookCount = content.engagementHooks.length;
  if (hookCount >= 4) {
    score += 3;
  } else if (hookCount >= 3) {
    score += 2;
  } else if (hookCount >= 1) {
    score += 1;
  } else {
    feedback.push('No engagement hooks defined');
  }

  // Has variety of hook types (0-2)
  const uniqueHooks = new Set(content.engagementHooks);
  if (uniqueHooks.size >= 4) {
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
  if (filledParts >= 5) {
    score += 2;
  } else if (filledParts >= 3) {
    score += 1;
  } else {
    feedback.push('Episode structure is incomplete — fill all sections');
  }

  // Title engagement (0-1)
  if (content.title.includes('?') || content.title.includes('!') || /\d/.test(content.title)) {
    score += 1;
  }

  return Math.min(score, 10);
}

/**
 * Anti-brain-rot rules enforcement.
 * Returns an array of violation messages. Empty = all clear.
 *
 * Rules:
 * 1. No pure sensory overload without educational purpose
 * 2. Every visual element must serve the learning objective
 * 3. Colors/animations support understanding, not distract
 * 4. Music reinforces the lesson
 * 5. Minimum 1 clear learning takeaway per video
 * 6. Age-appropriate complexity
 */
export function checkAntiBrainRotRules(content: ScoreableContent): string[] {
  const violations: string[] = [];

  // Rule 1: Must have at least 1 learning takeaway
  if (content.learningTakeaways.length === 0) {
    violations.push('[ANTI-BRAIN-ROT] No learning takeaway — every video must teach something');
  }

  // Rule 2: Educational objective must be specific, not vague
  if (content.educationalObjective.length < 10) {
    violations.push('[ANTI-BRAIN-ROT] Educational objective is too vague or missing');
  }

  // Rule 3: Script must contain interactive learning moments (not just passive watching)
  const interactivePatterns = [
    /can you/i,
    /let'?s\s+(count|try|find|look|sing|say|clap)/i,
    /your turn/i,
    /try it/i,
    /say it with me/i,
    /repeat after/i,
    /show me/i,
  ];
  const interactiveCount = interactivePatterns.filter((p) => p.test(content.script)).length;
  if (interactiveCount === 0 && content.script.length > 100) {
    violations.push('[ANTI-BRAIN-ROT] Script has no interactive moments — kids must participate, not just watch');
  }

  // Rule 4: Detect sensory overload patterns (excessive exclamation, all caps)
  // Kids content legitimately uses exclamation marks — only flag extreme overuse (>5% of all chars)
  const exclamationDensity = (content.script.match(/!/g) || []).length / Math.max(content.script.length, 1);
  if (exclamationDensity > 0.05) {
    violations.push('[ANTI-BRAIN-ROT] Excessive exclamation marks suggest sensory overload over substance');
  }

  // Rule 5: Exploration section must be the longest (it's where learning happens)
  const { hook, problem, exploration, resolution, nextPreview } = content.episodeStructure;
  const explorationDuration = exploration.duration;
  const totalOther = hook.duration + problem.duration + resolution.duration + nextPreview.duration;
  if (explorationDuration < totalOther && content.estimatedDuration > 60) {
    violations.push('[ANTI-BRAIN-ROT] Teaching section must be longer than combined intro/outro sections');
  }

  // Rule 6: Age-appropriate duration
  if (!checkDurationForAge(content.ageBracket, content.estimatedDuration)) {
    violations.push(`[ANTI-BRAIN-ROT] Duration ${content.estimatedDuration}s not appropriate for age ${content.ageBracket}`);
  }

  return violations;
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
