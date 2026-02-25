/**
 * Gemini Prompt Refinement
 *
 * Before each Veo call, have Gemini refine the raw scene idea into an
 * optimized Veo prompt. This improves:
 * - Camera direction specificity
 * - Lighting and mood description
 * - Audio cue formatting
 * - Duration-appropriate action density
 * - Avoidance of prompt pitfalls (subtitle generation, character re-description)
 */

import { GoogleGenAI } from '@google/genai';

export interface PromptEngineerOptions {
  apiKey: string;
  model?: string;
}

export interface RefinePromptInput {
  /** Raw scene idea / description. */
  sceneIdea: string;
  /** Frozen character description (pasted unchanged into Imagen prompts). */
  characterDescription: string;
  /** Whether this is a motion-only prompt (for image-to-video with starting frame). */
  motionOnly: boolean;
  /** Target clip duration in seconds. */
  durationSec: number;
}

export interface RefinedPrompts {
  /** Full prompt for Imagen starting frame (character + scene setting). */
  imagenPrompt: string;
  /** Motion-only prompt for Veo (no character re-description). */
  veoMotionPrompt: string;
}

export class PromptEngineer {
  private client: GoogleGenAI;
  private model: string;

  constructor(options: PromptEngineerOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? 'gemini-2.5-flash';
  }

  /**
   * Refine a raw scene idea into optimized Imagen + Veo prompts.
   *
   * Returns two prompts:
   * - `imagenPrompt`: Full character description + scene setting for starting frame
   * - `veoMotionPrompt`: Motion/action-only prompt for Veo animation
   */
  async refineScenePrompt(input: RefinePromptInput): Promise<RefinedPrompts> {
    const systemPrompt = `You are an expert prompter for AI video generation pipelines. You produce two prompts:

1. **Imagen prompt**: A single paragraph for generating a still starting frame. It MUST begin with the character description verbatim, then describe the scene setting, pose, camera angle, and lighting. Do NOT include any motion or action.

2. **Veo motion prompt**: A single paragraph describing ONLY the motion, action, and camera movement to animate the starting frame. Do NOT re-describe the character appearance — the starting image already shows them. Focus on: what moves, how it moves, camera direction, timing. Include audio cues using format "Audio: [description]". Add "(no subtitles)" at the end.

Rules:
- Keep each prompt under 200 words
- One single moment per prompt — no scene changes
- ${input.durationSec} seconds of action maximum
- Use present tense
- Be specific about camera movement (zoom, pan, tilt, dolly, static)
- Include lighting description in the Imagen prompt
- Use colon format for any dialogue in Veo prompt: Character: "dialogue"

Respond in JSON format:
{ "imagenPrompt": "...", "veoMotionPrompt": "..." }`;

    const userPrompt = `Scene idea: "${input.sceneIdea}"
Character description (use verbatim in Imagen prompt): "${input.characterDescription}"
Duration: ${input.durationSec} seconds`;

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text ?? '';
    try {
      const parsed = JSON.parse(text);
      return {
        imagenPrompt: parsed.imagenPrompt,
        veoMotionPrompt: parsed.veoMotionPrompt,
      };
    } catch {
      // Fallback: construct prompts manually if Gemini JSON fails
      return {
        imagenPrompt: `${input.characterDescription}. ${input.sceneIdea}. Pixar-style 3D children's animation, bright warm lighting, clean composition.`,
        veoMotionPrompt: `${input.sceneIdea}. Smooth animation, gentle camera movement. Audio: cheerful ambient sounds. (no subtitles)`,
      };
    }
  }
}
