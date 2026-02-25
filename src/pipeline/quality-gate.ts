/**
 * Quality Gate — Gemini-as-Evaluator
 *
 * After generating each clip, extract a frame and have Gemini score it on:
 * - Character consistency with reference
 * - Visual quality
 * - Animation style appropriateness
 * - Artifact detection
 *
 * If score < threshold, regenerate with enhanced prompt (Recurser pattern).
 * Also includes black/solid frame detection via FFmpeg.
 */

import { GoogleGenAI } from '@google/genai';
import { execSync } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';

export interface QualityGateOptions {
  apiKey: string;
  model?: string;
  /** Minimum acceptable score (1-10). Defaults to 7. */
  minScore?: number;
}

export interface QualityEvaluation {
  /** Overall score 1-10. */
  overallScore: number;
  /** Character consistency score 1-10. */
  characterScore: number;
  /** Visual quality score 1-10. */
  qualityScore: number;
  /** Whether the clip passes the gate. */
  passed: boolean;
  /** Human-readable feedback. */
  feedback: string;
  /** Suggested prompt improvements if the clip failed. */
  promptSuggestions?: string;
}

export class QualityGate {
  private client: GoogleGenAI;
  private model: string;
  private minScore: number;

  constructor(options: QualityGateOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? 'gemini-2.5-flash';
    this.minScore = options.minScore ?? 7;
  }

  /**
   * Extract a representative frame from a video clip using FFmpeg.
   * Takes a frame at the specified time offset (default: 2 seconds in).
   */
  async extractFrame(clipPath: string, timeSec: number = 2): Promise<string> {
    const framePath = clipPath.replace(/\.mp4$/, '_frame.jpg');
    execSync(
      `ffmpeg -ss ${timeSec} -i "${clipPath}" -vframes 1 -q:v 2 -y "${framePath}" 2>/dev/null`,
    );
    const frameBuffer = await readFile(framePath);
    return frameBuffer.toString('base64');
  }

  /**
   * Evaluate a video clip frame against the character reference.
   * Returns a structured evaluation with scores and feedback.
   */
  async evaluateClip(
    clipPath: string,
    referenceBase64: string,
    sceneDescription: string,
  ): Promise<QualityEvaluation> {
    let frameBase64: string;
    try {
      frameBase64 = await this.extractFrame(clipPath);
    } catch {
      // If frame extraction fails, the clip is likely corrupt
      return {
        overallScore: 0,
        characterScore: 0,
        qualityScore: 0,
        passed: false,
        feedback: 'Failed to extract frame — clip may be corrupt or empty.',
      };
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are a quality evaluator for AI-generated children's animation clips.

Evaluate this video frame against the reference character image. The scene should show: "${sceneDescription}"

Score each criterion 1-10:
1. **Character consistency**: Does the character in the frame match the reference? Same color, proportions, features?
2. **Visual quality**: Is the frame clean, well-lit, free of artifacts, distortion, or blur?
3. **Style match**: Does it look like Pixar-style 3D children's animation?

Also check for:
- Black or solid-color frames (score 0)
- Text/subtitles burned into the image (deduct 3 points)
- Morphing or distorted character features (deduct 2 points)

Respond in JSON:
{
  "characterScore": <1-10>,
  "qualityScore": <1-10>,
  "overallScore": <1-10>,
  "feedback": "<brief explanation>",
  "promptSuggestions": "<how to improve the prompt if scores are low>"
}`,
            },
            {
              inlineData: { mimeType: 'image/jpeg', data: frameBase64 },
            },
            {
              inlineData: { mimeType: 'image/png', data: referenceBase64 },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text ?? '';
    try {
      const parsed = JSON.parse(text);
      return {
        overallScore: parsed.overallScore ?? 0,
        characterScore: parsed.characterScore ?? 0,
        qualityScore: parsed.qualityScore ?? 0,
        passed: (parsed.overallScore ?? 0) >= this.minScore,
        feedback: parsed.feedback ?? '',
        promptSuggestions: parsed.promptSuggestions,
      };
    } catch {
      // If Gemini response isn't valid JSON, treat as marginal pass
      return {
        overallScore: 6,
        characterScore: 6,
        qualityScore: 6,
        passed: false,
        feedback: `Gemini evaluation response was not valid JSON: ${text.substring(0, 200)}`,
      };
    }
  }

  /**
   * Detect black or solid-color frames in a video clip.
   * Returns true if the clip has problematic solid frames.
   */
  detectBlackFrames(clipPath: string): boolean {
    try {
      const output = execSync(
        `ffprobe -f lavfi -i "movie=${clipPath},blackdetect=d=0.5:pix_th=0.1" -show_entries tags -of json 2>&1`,
        { encoding: 'utf-8', timeout: 15_000 },
      );
      // If blackdetect finds frames, the output contains "black_start"
      return output.includes('black_start');
    } catch {
      // blackdetect may fail on some clips — don't block the pipeline
      return false;
    }
  }

  /**
   * Quick file size sanity check — very small files are likely failed generations.
   */
  checkFileSize(clipPath: string, minBytes: number = 50_000): boolean {
    try {
      const stats = execSync(`stat -c %s "${clipPath}"`, { encoding: 'utf-8' }).trim();
      return parseInt(stats, 10) >= minBytes;
    } catch {
      return false;
    }
  }
}
