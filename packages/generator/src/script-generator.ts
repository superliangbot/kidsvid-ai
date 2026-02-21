import type {
  ScriptRequest,
  GeneratedScript,
  EngagementHookType,
  EpisodeStructure,
  Logger,
} from '@kidsvid/shared';
import { getTemplateForAge, ENGAGEMENT_HOOK_DESCRIPTIONS } from './templates/episode-structure.js';
import { DEFAULT_CHARACTERS } from './character-bible.js';
import { scoreContent } from './quality-scorer.js';

/** LLM-powered script generator for kids educational content.
 * Uses Anthropic Claude API to generate scripts following the episode template structure. */

export interface ScriptGeneratorOptions {
  anthropicApiKey: string;
  model?: string;
  maxRetries?: number;
}

export class ScriptGenerator {
  private apiKey: string;
  private model: string;
  private maxRetries: number;

  constructor(
    private options: ScriptGeneratorOptions,
    private logger: Logger,
  ) {
    this.apiKey = options.anthropicApiKey;
    this.model = options.model ?? 'claude-sonnet-4-5-20250929';
    this.maxRetries = options.maxRetries ?? 2;
  }

  async generate(request: ScriptRequest): Promise<GeneratedScript> {
    const template = getTemplateForAge(request.educationalCategory, request.ageBracket);

    // Resolve characters
    const characters = request.characterIds
      .map((id) => DEFAULT_CHARACTERS[id])
      .filter(Boolean);

    const basePrompt = this.buildPrompt(request, template, characters);

    let lastResult: GeneratedScript | null = null;
    let currentPrompt = basePrompt;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.logger.info(
        { attempt, category: request.educationalCategory, topic: request.topic },
        'Generating script',
      );

      const response = await this.callLLM(currentPrompt);
      const parsed = this.parseResponse(response, request, template);

      // Quality gate
      const score = scoreContent({
        title: parsed.title,
        script: parsed.script,
        educationalObjective: parsed.educationalObjective,
        learningTakeaways: parsed.learningTakeaways,
        engagementHooks: parsed.engagementHooks,
        episodeStructure: parsed.episodeStructure,
        ageBracket: request.ageBracket,
        estimatedDuration: parsed.estimatedDuration,
      });

      parsed.qualityScore = score;
      lastResult = parsed;

      if (score.passed) {
        this.logger.info(
          {
            educational: score.educationalValue,
            engagement: score.engagementPotential,
          },
          'Script passed quality gate',
        );
        return parsed;
      }

      this.logger.warn(
        {
          educational: score.educationalValue,
          engagement: score.engagementPotential,
          feedback: score.feedback,
          attempt,
        },
        'Script failed quality gate, retrying with feedback',
      );

      // Append quality feedback to prompt for retry
      currentPrompt = basePrompt + `\n\n## IMPORTANT: Previous attempt scored too low. Fix these issues:\n${score.feedback.map((f) => `- ${f}`).join('\n')}\n\nEducational score: ${score.educationalValue}/10 (need >=7)\nEngagement score: ${score.engagementPotential}/10 (need >=7)`;
    }

    this.logger.warn('Script did not pass quality gate after retries, returning best attempt');
    return lastResult!;
  }

  private buildPrompt(
    request: ScriptRequest,
    template: ReturnType<typeof getTemplateForAge>,
    characters: typeof DEFAULT_CHARACTERS,
  ): string {
    const characterDescriptions = characters.length > 0
      ? characters
          .map(
            (c) =>
              `Character: ${c.name}\n  Description: ${c.description}\n  Personality: ${c.personality}\n  Catchphrases: ${c.catchphrases.join(', ')}\n  Teaching style: ${c.teachingStyle}`,
          )
          .join('\n\n')
      : 'Use an unnamed friendly narrator character.';

    return `You are a kids educational content scriptwriter. Write a script for a ${request.ageBracket} year old audience.

## Content Requirements
- Educational category: ${request.educationalCategory}
- Educational objective: ${request.educationalObjective}
- Topic: ${request.topic || 'Choose an appropriate topic for the category'}
- Target duration: ${request.targetDuration} seconds (~${Math.round(request.targetDuration / 60)} minutes)
- Content category: ${request.category}

## Characters
${characterDescriptions}

## Episode Structure (FOLLOW THIS EXACTLY)
1. HOOK (${template.structure.hook.duration}s): ${template.structure.hook.description}
2. PROBLEM/QUESTION (${template.structure.problem.duration}s): ${template.structure.problem.description}
3. EXPLORATION/TEACHING (${template.structure.exploration.duration}s): ${template.structure.exploration.description}
4. RESOLUTION/CELEBRATION (${template.structure.resolution.duration}s): ${template.structure.resolution.description}
5. NEXT EPISODE PREVIEW (${template.structure.nextPreview.duration}s): ${template.structure.nextPreview.description}

## Required Engagement Hooks (include ALL of these)
${request.engagementHooks.map((h) => `- ${formatHookType(h)}`).join('\n')}

## Template Guidance
${template.promptGuidance}

## Rules
- Use simple vocabulary appropriate for ${request.ageBracket} year olds
- Include at least 2 moments where the viewer is directly addressed ("Can you count with me?")
- Include at least 1 song or chant section
- Every visual element must serve the learning objective
- Include stage directions in [brackets] for animation cues
- Include a clear learning takeaway at the end
- Minimize complex dialogue — this should work globally with minimal translation
- NO scary content, NO conflict that doesn't resolve, NO mean characters

## Output Format (respond in this exact JSON format)
{
  "title": "Engaging title with hook (max 60 chars)",
  "description": "YouTube description with keywords (150-200 words)",
  "script": "Full script with dialogue, stage directions, and timing markers",
  "tags": ["tag1", "tag2", ...],
  "estimatedDuration": <seconds>,
  "educationalObjective": "What the child will learn",
  "learningTakeaways": ["takeaway1", "takeaway2"],
  "engagementHooks": ["hook_type1", "hook_type2", ...],
  "episodeStructure": {
    "hook": {"duration": 15, "description": "..."},
    "problem": {"duration": 30, "description": "..."},
    "exploration": {"duration": <seconds>, "description": "..."},
    "resolution": {"duration": 30, "description": "..."},
    "nextPreview": {"duration": 15, "description": "..."}
  }
}`;
  }

  private async callLLM(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
    };

    return data.content[0]?.text || '';
  }

  private parseResponse(
    response: string,
    request: ScriptRequest,
    template: ReturnType<typeof getTemplateForAge>,
  ): GeneratedScript {
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        title: parsed.title || 'Untitled',
        description: parsed.description || '',
        script: parsed.script || '',
        tags: parsed.tags || [],
        estimatedDuration: parsed.estimatedDuration || request.targetDuration,
        educationalObjective: parsed.educationalObjective || request.educationalObjective,
        engagementHooks: (parsed.engagementHooks || request.engagementHooks) as EngagementHookType[],
        episodeStructure: parsed.episodeStructure || template.structure,
        learningTakeaways: parsed.learningTakeaways || [],
        qualityScore: { educationalValue: 0, engagementPotential: 0, passed: false, feedback: [] },
      };
    } catch {
      this.logger.error('Failed to parse LLM response, using fallback');
      return {
        title: 'Generated Script',
        description: '',
        script: response,
        tags: [],
        estimatedDuration: request.targetDuration,
        educationalObjective: request.educationalObjective,
        engagementHooks: request.engagementHooks,
        episodeStructure: template.structure,
        learningTakeaways: [],
        qualityScore: { educationalValue: 0, engagementPotential: 0, passed: false, feedback: ['Failed to parse LLM response'] },
      };
    }
  }
}

function formatHookType(hook: EngagementHookType): string {
  const desc = ENGAGEMENT_HOOK_DESCRIPTIONS[hook];
  if (desc) {
    return `${desc.name} — ${desc.description} Example: ${desc.example}`;
  }
  return hook;
}
