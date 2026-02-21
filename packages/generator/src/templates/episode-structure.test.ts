import { describe, it, expect } from 'vitest';
import {
  EPISODE_TEMPLATES,
  ENGAGEMENT_HOOK_DESCRIPTIONS,
  getTemplate,
  getTemplateForAge,
  getHooksForCategory,
} from './episode-structure.js';
import type { EducationalCategory, AgeBracket, EngagementHookType } from '@kidsvid/shared';
import { EDUCATIONAL_CATEGORIES, ENGAGEMENT_HOOK_TYPES, AGE_BRACKETS } from '@kidsvid/shared';

describe('EPISODE_TEMPLATES', () => {
  it('has a template for every educational category', () => {
    for (const cat of EDUCATIONAL_CATEGORIES) {
      expect(EPISODE_TEMPLATES[cat]).toBeDefined();
      expect(EPISODE_TEMPLATES[cat].educationalCategory).toBe(cat);
    }
  });

  it('all templates have valid 5-part episode structure', () => {
    for (const cat of EDUCATIONAL_CATEGORIES) {
      const t = EPISODE_TEMPLATES[cat];
      expect(t.structure.hook.duration).toBe(15);
      expect(t.structure.problem.duration).toBe(30);
      expect(t.structure.exploration.duration).toBeGreaterThanOrEqual(120);
      expect(t.structure.resolution.duration).toBe(30);
      expect(t.structure.nextPreview.duration).toBe(15);
    }
  });

  it('all templates have non-empty descriptions for each section', () => {
    for (const cat of EDUCATIONAL_CATEGORIES) {
      const t = EPISODE_TEMPLATES[cat];
      expect(t.structure.hook.description.length).toBeGreaterThan(10);
      expect(t.structure.problem.description.length).toBeGreaterThan(10);
      expect(t.structure.exploration.description.length).toBeGreaterThan(10);
      expect(t.structure.resolution.description.length).toBeGreaterThan(10);
      expect(t.structure.nextPreview.description.length).toBeGreaterThan(10);
    }
  });

  it('all templates have suggested hooks', () => {
    for (const cat of EDUCATIONAL_CATEGORIES) {
      const t = EPISODE_TEMPLATES[cat];
      expect(t.suggestedHooks.length).toBeGreaterThanOrEqual(3);
      for (const hook of t.suggestedHooks) {
        expect(ENGAGEMENT_HOOK_TYPES).toContain(hook);
      }
    }
  });

  it('all templates have prompt guidance', () => {
    for (const cat of EDUCATIONAL_CATEGORIES) {
      expect(EPISODE_TEMPLATES[cat].promptGuidance.length).toBeGreaterThan(50);
    }
  });

  it('all templates have a default age bracket', () => {
    for (const cat of EDUCATIONAL_CATEGORIES) {
      expect(AGE_BRACKETS).toContain(EPISODE_TEMPLATES[cat].ageBracket);
    }
  });

  it('exploration section is longest part of every template', () => {
    for (const cat of EDUCATIONAL_CATEGORIES) {
      const t = EPISODE_TEMPLATES[cat];
      const other = t.structure.hook.duration + t.structure.problem.duration +
        t.structure.resolution.duration + t.structure.nextPreview.duration;
      expect(t.structure.exploration.duration).toBeGreaterThan(other);
    }
  });
});

describe('ENGAGEMENT_HOOK_DESCRIPTIONS', () => {
  it('has a description for every hook type', () => {
    for (const hook of ENGAGEMENT_HOOK_TYPES) {
      const desc = ENGAGEMENT_HOOK_DESCRIPTIONS[hook];
      expect(desc).toBeDefined();
      expect(desc.name.length).toBeGreaterThan(0);
      expect(desc.description.length).toBeGreaterThan(10);
      expect(desc.example.length).toBeGreaterThan(10);
      expect(desc.bestFor.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('all bestFor categories are valid', () => {
    for (const hook of ENGAGEMENT_HOOK_TYPES) {
      for (const cat of ENGAGEMENT_HOOK_DESCRIPTIONS[hook].bestFor) {
        expect(EDUCATIONAL_CATEGORIES).toContain(cat);
      }
    }
  });
});

describe('getTemplate', () => {
  it('returns the correct template for each category', () => {
    for (const cat of EDUCATIONAL_CATEGORIES) {
      const template = getTemplate(cat);
      expect(template.educationalCategory).toBe(cat);
    }
  });
});

describe('getTemplateForAge', () => {
  it('adjusts exploration duration for age 2-4', () => {
    const template = getTemplateForAge('early_math', '2-4');
    expect(template.structure.exploration.duration).toBe(120);
    expect(template.ageBracket).toBe('2-4');
  });

  it('adjusts exploration duration for age 4-6', () => {
    const template = getTemplateForAge('science', '4-6');
    expect(template.structure.exploration.duration).toBe(150);
    expect(template.ageBracket).toBe('4-6');
  });

  it('adjusts exploration duration for age 6-8', () => {
    const template = getTemplateForAge('problem_solving', '6-8');
    expect(template.structure.exploration.duration).toBe(180);
    expect(template.ageBracket).toBe('6-8');
  });

  it('preserves other structure sections unchanged', () => {
    const template = getTemplateForAge('phonics_reading', '4-6');
    expect(template.structure.hook.duration).toBe(15);
    expect(template.structure.problem.duration).toBe(30);
    expect(template.structure.resolution.duration).toBe(30);
    expect(template.structure.nextPreview.duration).toBe(15);
  });

  it('does not mutate the original template', () => {
    const original = EPISODE_TEMPLATES['early_math'].structure.exploration.duration;
    getTemplateForAge('early_math', '6-8');
    expect(EPISODE_TEMPLATES['early_math'].structure.exploration.duration).toBe(original);
  });
});

describe('getHooksForCategory', () => {
  it('returns hooks for every category', () => {
    for (const cat of EDUCATIONAL_CATEGORIES) {
      const hooks = getHooksForCategory(cat);
      expect(hooks.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('early_math includes call_response and reward_loop', () => {
    const hooks = getHooksForCategory('early_math');
    expect(hooks).toContain('call_response');
    expect(hooks).toContain('reward_loop');
  });

  it('social_emotional includes character_growth', () => {
    const hooks = getHooksForCategory('social_emotional');
    expect(hooks).toContain('character_growth');
  });

  it('music_rhythm includes call_response', () => {
    const hooks = getHooksForCategory('music_rhythm');
    expect(hooks).toContain('call_response');
  });
});
