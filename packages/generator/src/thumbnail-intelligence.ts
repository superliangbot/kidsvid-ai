import type { ThumbnailSpec, ThumbnailVariant, Logger, ContentCategory } from '@kidsvid/shared';

/** Thumbnail Intelligence Module.
 * Extracts patterns from top-performing thumbnails and generates
 * optimized DALL-E prompts for kids content thumbnails. */

/** Thumbnail analysis patterns derived from top kids channels */
export const THUMBNAIL_PATTERNS = {
  colors: {
    high_performing: ['bright yellow', 'vivid red', 'sky blue', 'lime green', 'orange', 'pink'],
    backgrounds: ['gradient blue-purple', 'bright yellow', 'pastel rainbow', 'white clean'],
    avoid: ['dark', 'muted', 'brown', 'gray', 'black backgrounds'],
  },
  composition: {
    rules: [
      'Character face takes up 40-60% of frame',
      'Character positioned left or center',
      'Background is simple and not distracting',
      'Bold text overlay on right side (if any)',
      'High contrast between subject and background',
      'Rule of thirds for character placement',
    ],
    best_layouts: ['character-center', 'character-left-text-right', 'character-duo'],
  },
  expressions: {
    top_performing: ['excited surprise', 'big smile', 'curious wonder', 'happy laugh'],
    avoid: ['neutral', 'sad', 'angry', 'confused'],
  },
  text: {
    rules: [
      'Max 3-4 words on thumbnail',
      'Font: bold, rounded, child-friendly',
      'Text color contrasts with background',
      'Numbers and emojis grab attention',
      'Question marks increase CTR',
    ],
  },
} as const;

/** Category-specific thumbnail styles */
const CATEGORY_STYLES: Record<string, {
  style: string;
  colors: string[];
  composition: string;
  expression: string;
}> = {
  nursery_rhyme: {
    style: 'soft pastel animation, musical notes floating',
    colors: ['pastel pink', 'baby blue', 'soft yellow'],
    composition: 'character-center with musical elements',
    expression: 'singing joyfully',
  },
  song: {
    style: 'vibrant colorful animation, dancing motion',
    colors: ['rainbow', 'bright pink', 'electric blue'],
    composition: 'character-center dancing',
    expression: 'dancing with excitement',
  },
  educational: {
    style: 'clean bright animation, learning props',
    colors: ['bright blue', 'yellow', 'green'],
    composition: 'character-left with educational props right',
    expression: 'curious and excited',
  },
  story: {
    style: 'adventure scene, dramatic lighting',
    colors: ['golden', 'blue', 'green forest'],
    composition: 'character in an adventure scene',
    expression: 'brave and determined',
  },
  animation: {
    style: '3D animated, Pixar-quality feel',
    colors: ['vibrant multicolor', 'teal', 'orange'],
    composition: 'character-center action pose',
    expression: 'excited surprise',
  },
  challenge: {
    style: 'split screen or VS style, competitive energy',
    colors: ['red vs blue', 'orange', 'yellow'],
    composition: 'dual characters or challenge setup',
    expression: 'competitive excitement',
  },
};

export class ThumbnailIntelligence {
  constructor(private logger: Logger) {}

  /** Generate an optimized thumbnail spec from content metadata */
  generateSpec(params: {
    title: string;
    category: string;
    topic: string;
    characterName?: string;
    episodeNumber?: number;
  }): ThumbnailSpec {
    const categoryStyle = CATEGORY_STYLES[params.category] ?? CATEGORY_STYLES['educational'];

    const textOverlay = this.generateTextOverlay(params.title, params.episodeNumber);

    return {
      prompt: this.buildPrompt(params, categoryStyle),
      style: categoryStyle.style,
      dominantColors: categoryStyle.colors,
      textOverlay,
      characterExpression: categoryStyle.expression,
      composition: categoryStyle.composition,
    };
  }

  /** Generate A/B thumbnail variants for testing */
  generateVariants(params: {
    title: string;
    category: string;
    topic: string;
    characterName?: string;
    count?: number;
  }): ThumbnailSpec[] {
    const count = params.count ?? 3;
    const variants: ThumbnailSpec[] = [];

    // Variant A: Standard optimized
    variants.push(this.generateSpec(params));

    // Variant B: Close-up character focus
    if (count >= 2) {
      const categoryStyle = CATEGORY_STYLES[params.category] ?? CATEGORY_STYLES['educational'];
      variants.push({
        prompt: this.buildCloseUpPrompt(params, categoryStyle),
        style: 'extreme close-up, character emotion focus',
        dominantColors: [...THUMBNAIL_PATTERNS.colors.high_performing.slice(0, 3)],
        textOverlay: this.generateTextOverlay(params.title),
        characterExpression: 'excited surprise with big eyes',
        composition: 'character face fills 70% of frame',
      });
    }

    // Variant C: Action scene
    if (count >= 3) {
      variants.push({
        prompt: this.buildActionPrompt(params),
        style: 'dynamic action scene, motion blur background',
        dominantColors: ['bright yellow', 'vivid red', 'sky blue'],
        textOverlay: this.generateTextOverlay(params.title),
        characterExpression: 'mid-action excitement',
        composition: 'character in dynamic pose with topic elements',
      });
    }

    this.logger.info(
      { variants: variants.length, category: params.category },
      'Generated thumbnail variants',
    );

    return variants;
  }

  /** Build a DALL-E prompt optimized for kids content thumbnails */
  buildDallePrompt(spec: ThumbnailSpec): string {
    return `Create a YouTube kids video thumbnail: ${spec.prompt}.
Style: ${spec.style}, ${spec.dominantColors.join(', ')} color palette.
Composition: ${spec.composition}. Character expression: ${spec.characterExpression}.
Requirements: Eye-catching for children ages 2-8, 3D cartoon animation style,
bright saturated colors, high contrast, professional quality.
NO text in the image (text will be added in post-production).
Child-safe and friendly, no scary elements.`;
  }

  /** Analyze what makes a thumbnail perform well (pattern extraction) */
  analyzePatterns(): {
    colorRules: string[];
    compositionRules: string[];
    expressionRules: string[];
    textRules: string[];
  } {
    return {
      colorRules: [
        'Use bright saturated colors (yellow, red, blue) — avg 2x CTR vs muted',
        'Background should contrast with character',
        'Avoid dark/muted palettes — kids scroll past them',
        ...THUMBNAIL_PATTERNS.colors.high_performing.map(c => `Top color: ${c}`),
      ],
      compositionRules: THUMBNAIL_PATTERNS.composition.rules,
      expressionRules: [
        'Characters with excited/surprised expressions get 40% more clicks',
        ...THUMBNAIL_PATTERNS.expressions.top_performing.map(e => `Use: ${e}`),
        ...THUMBNAIL_PATTERNS.expressions.avoid.map(e => `Avoid: ${e}`),
      ],
      textRules: THUMBNAIL_PATTERNS.text.rules,
    };
  }

  private buildPrompt(
    params: { title: string; topic: string; characterName?: string },
    style: { style: string; expression: string },
  ): string {
    const character = params.characterName ?? 'a friendly cartoon character';
    return `${character} looking ${style.expression} while exploring ${params.topic}. Scene from "${params.title}". ${style.style}`;
  }

  private buildCloseUpPrompt(
    params: { title: string; topic: string; characterName?: string },
    style: { expression: string },
  ): string {
    const character = params.characterName ?? 'a friendly cartoon character';
    return `Extreme close-up of ${character}'s face, ${style.expression}, with ${params.topic} elements subtly in the background. Big expressive eyes, bright colors`;
  }

  private buildActionPrompt(params: {
    title: string;
    topic: string;
    characterName?: string;
  }): string {
    const character = params.characterName ?? 'a friendly cartoon character';
    return `${character} in an exciting action pose related to ${params.topic}, dynamic angle, bright vivid colors, motion energy, fun and child-safe adventure scene`;
  }

  private generateTextOverlay(title: string, episodeNumber?: number): string {
    // Extract 2-3 key words for overlay
    const words = title.split(/\s+/).filter(w => w.length > 2);
    const keyWords = words.slice(0, 3).join(' ');
    const prefix = episodeNumber ? `Ep.${episodeNumber} ` : '';
    const overlay = `${prefix}${keyWords}`;
    return overlay.length > 20 ? overlay.slice(0, 20) : overlay;
  }
}
