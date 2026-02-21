import { describe, it, expect } from 'vitest';
import { scoreContent, checkAntiBrainRotRules, PASSING_THRESHOLD } from './quality-scorer.js';
import type { ScoreableContent } from './quality-scorer.js';
import type { EpisodeStructure, EngagementHookType, AgeBracket } from '@kidsvid/shared';

function makeStructure(overrides: Partial<EpisodeStructure> = {}): EpisodeStructure {
  return {
    hook: { duration: 15, description: 'Character discovers a mystery number' },
    problem: { duration: 30, description: 'How many apples? Can you help count?' },
    exploration: { duration: 150, description: 'Let\'s count together with different objects and learn numbers' },
    resolution: { duration: 30, description: 'We did it! We learned to count to 5!' },
    nextPreview: { duration: 15, description: 'Next time: shapes!' },
    ...overrides,
  };
}

function makeContent(overrides: Partial<ScoreableContent> = {}): ScoreableContent {
  return {
    title: 'Count to 5 with Cosmo! Can You Do It?',
    script: `[Cosmo appears bouncing] "Hey friends! Let's count together! Can you count with me?
One apple, two apples, three apples! That's right!
Now let's try with stars. One star, two stars, three stars, four stars, five stars!
Can you find something red? Yes! The apple is red! Amazing!
Let's count one more time. 1, 2, 3, 4, 5! You did it!
Do you know what comes after five? Let's discover together!"`,
    educationalObjective: 'Learn to count objects from 1 to 5 using visual aids',
    learningTakeaways: ['Count from 1 to 5', 'Recognize number quantities'],
    engagementHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'direct_address'] as EngagementHookType[],
    episodeStructure: makeStructure(),
    ageBracket: '2-4' as AgeBracket,
    estimatedDuration: 150,
    ...overrides,
  };
}

describe('scoreContent', () => {
  it('passes high-quality educational content', () => {
    const result = scoreContent(makeContent());
    expect(result.passed).toBe(true);
    expect(result.educationalValue).toBeGreaterThanOrEqual(PASSING_THRESHOLD);
    expect(result.engagementPotential).toBeGreaterThanOrEqual(PASSING_THRESHOLD);
    expect(result.feedback).toHaveLength(0);
  });

  it('fails content with no educational objective', () => {
    const result = scoreContent(makeContent({ educationalObjective: '' }));
    expect(result.passed).toBe(false);
    expect(result.feedback.some((f) => f.includes('objective'))).toBe(true);
  });

  it('fails content with no learning takeaways', () => {
    const result = scoreContent(makeContent({ learningTakeaways: [] }));
    expect(result.passed).toBe(false);
    // Brain rot rule: no learning takeaway
    expect(result.feedback.some((f) => f.includes('takeaway') || f.includes('BRAIN-ROT'))).toBe(true);
  });

  it('fails content with no engagement hooks', () => {
    const result = scoreContent(makeContent({ engagementHooks: [] }));
    expect(result.passed).toBe(false);
    expect(result.feedback.some((f) => f.includes('hooks'))).toBe(true);
  });

  it('penalizes missing critical hooks (call_response and reward_loop)', () => {
    const result = scoreContent(makeContent({
      engagementHooks: ['mystery_reveal', 'easter_egg', 'cliffhanger'] as EngagementHookType[],
    }));
    expect(result.engagementPotential).toBeLessThan(
      scoreContent(makeContent()).engagementPotential,
    );
  });

  it('rewards diverse hook types', () => {
    const fewHooks = scoreContent(makeContent({
      engagementHooks: ['call_response', 'reward_loop'] as EngagementHookType[],
    }));
    const manyHooks = scoreContent(makeContent({
      engagementHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'direct_address'] as EngagementHookType[],
    }));
    expect(manyHooks.engagementPotential).toBeGreaterThan(fewHooks.engagementPotential);
  });

  it('scores educational content markers in script', () => {
    const bareScript = scoreContent(makeContent({
      script: 'A character walks around. Things happen. The end.',
    }));
    const richScript = scoreContent(makeContent());
    expect(richScript.educationalValue).toBeGreaterThan(bareScript.educationalValue);
  });

  it('checks age-appropriate duration for 2-4', () => {
    const good = scoreContent(makeContent({ ageBracket: '2-4', estimatedDuration: 120 }));
    const tooLong = scoreContent(makeContent({ ageBracket: '2-4', estimatedDuration: 400 }));
    expect(good.educationalValue).toBeGreaterThan(tooLong.educationalValue);
  });

  it('checks age-appropriate duration for 4-6', () => {
    const good = scoreContent(makeContent({ ageBracket: '4-6', estimatedDuration: 200 }));
    const tooShort = scoreContent(makeContent({ ageBracket: '4-6', estimatedDuration: 30 }));
    expect(good.educationalValue).toBeGreaterThan(tooShort.educationalValue);
  });

  it('checks age-appropriate duration for 6-8', () => {
    const good = scoreContent(makeContent({ ageBracket: '6-8', estimatedDuration: 300 }));
    expect(good.passed).toBe(true);
  });

  it('rewards engaging titles with ? or ! or numbers', () => {
    const engaging = scoreContent(makeContent({ title: 'Can You Count to 5?' }));
    const boring = scoreContent(makeContent({ title: 'Counting Video' }));
    expect(engaging.engagementPotential).toBeGreaterThan(boring.engagementPotential);
  });

  it('scores episode structure completeness', () => {
    const complete = scoreContent(makeContent());
    const incomplete = scoreContent(makeContent({
      episodeStructure: makeStructure({
        hook: { duration: 15, description: '' },
        problem: { duration: 30, description: '' },
      }),
    }));
    expect(complete.engagementPotential).toBeGreaterThan(incomplete.engagementPotential);
  });

  it('rewards resolution that references learning', () => {
    const good = scoreContent(makeContent({
      episodeStructure: makeStructure({
        resolution: { duration: 30, description: 'We did it! We learned to count to 5!' },
      }),
    }));
    const bad = scoreContent(makeContent({
      episodeStructure: makeStructure({
        resolution: { duration: 30, description: 'Yay! Party time! Woohoo!' },
      }),
    }));
    expect(good.educationalValue).toBeGreaterThan(bad.educationalValue);
  });

  it('returns correct score format', () => {
    const result = scoreContent(makeContent());
    expect(result).toHaveProperty('educationalValue');
    expect(result).toHaveProperty('engagementPotential');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('feedback');
    expect(typeof result.educationalValue).toBe('number');
    expect(typeof result.engagementPotential).toBe('number');
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.feedback)).toBe(true);
  });

  it('caps scores at 10', () => {
    const result = scoreContent(makeContent());
    expect(result.educationalValue).toBeLessThanOrEqual(10);
    expect(result.engagementPotential).toBeLessThanOrEqual(10);
  });
});

describe('checkAntiBrainRotRules', () => {
  it('returns no violations for well-structured content', () => {
    const violations = checkAntiBrainRotRules(makeContent());
    expect(violations).toHaveLength(0);
  });

  it('flags missing learning takeaways', () => {
    const violations = checkAntiBrainRotRules(makeContent({ learningTakeaways: [] }));
    expect(violations.some((v) => v.includes('ANTI-BRAIN-ROT') && v.includes('takeaway'))).toBe(true);
  });

  it('flags vague educational objectives', () => {
    const violations = checkAntiBrainRotRules(makeContent({ educationalObjective: 'fun' }));
    expect(violations.some((v) => v.includes('ANTI-BRAIN-ROT') && v.includes('objective'))).toBe(true);
  });

  it('flags scripts with no interactive moments', () => {
    const violations = checkAntiBrainRotRules(makeContent({
      script: 'A long script with no questions or engagement. Characters just talk to each other about nothing in particular. The animation shows bright colors and loud sounds. More things happen on screen.',
    }));
    expect(violations.some((v) => v.includes('interactive'))).toBe(true);
  });

  it('flags excessive exclamation marks (sensory overload)', () => {
    // >5% exclamation density = sensory overload flag
    const script = '! '.repeat(50) + 'some normal text';
    const violations = checkAntiBrainRotRules(makeContent({ script }));
    expect(violations.some((v) => v.includes('exclamation') || v.includes('sensory'))).toBe(true);
  });

  it('flags teaching section shorter than combined intro/outro', () => {
    const violations = checkAntiBrainRotRules(makeContent({
      episodeStructure: makeStructure({
        exploration: { duration: 30, description: 'Very short teaching section' },
        hook: { duration: 15, description: 'Long hook' },
        problem: { duration: 30, description: 'Long problem' },
        resolution: { duration: 30, description: 'Long celebration' },
        nextPreview: { duration: 15, description: 'Long preview' },
      }),
      estimatedDuration: 120,
    }));
    expect(violations.some((v) => v.includes('Teaching section'))).toBe(true);
  });

  it('flags age-inappropriate duration', () => {
    const violations = checkAntiBrainRotRules(makeContent({
      ageBracket: '2-4',
      estimatedDuration: 600, // 10 minutes for toddlers
    }));
    expect(violations.some((v) => v.includes('Duration'))).toBe(true);
  });

  it('accepts content with interactive call-and-response patterns', () => {
    const violations = checkAntiBrainRotRules(makeContent({
      script: 'Let\'s count together! Can you count to three? One, two, three! Your turn now!',
    }));
    expect(violations.filter((v) => v.includes('interactive'))).toHaveLength(0);
  });
});

describe('PASSING_THRESHOLD', () => {
  it('is 7', () => {
    expect(PASSING_THRESHOLD).toBe(7);
  });
});
