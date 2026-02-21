import type { Logger, ContentCategory, EducationalCategory, AgeBracket } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { generatedVideos, eq, and } from '@kidsvid/shared/db';

/** Content deduplication — prevents generating near-duplicate scripts. */

export interface DedupCheck {
  topic: string;
  category: ContentCategory;
  educationalCategory: EducationalCategory;
  ageBracket: AgeBracket;
}

export interface DedupResult {
  isDuplicate: boolean;
  similarCount: number;
  existingTitles: string[];
  suggestedAngle: string | null;
}

const ANGLE_SUFFIXES = [
  'with animals',
  'song version',
  'at the playground',
  'in space',
  'underwater adventure',
  'with food',
  'at the farm',
  'with vehicles',
  'with dinosaurs',
  'dance party',
  'bedtime edition',
  'rainy day fun',
];

export class ContentDeduplicator {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}

  /** Check if similar content already exists in DB */
  async check(input: DedupCheck): Promise<DedupResult> {
    const existing = await this.db.query.generatedVideos.findMany({
      where: and(
        eq(generatedVideos.category, input.category),
      ),
      columns: { id: true, title: true, tags: true, generationMetadata: true },
    });

    const topicWords = this.tokenize(input.topic);
    const similar = existing.filter((row) => {
      const titleWords = this.tokenize(row.title);
      const similarity = this.jaccardSimilarity(topicWords, titleWords);
      // Also check metadata for matching educational category
      const meta = row.generationMetadata as Record<string, unknown> | null;
      const sameEduCat = meta?.educationalObjective
        ? String(meta.educationalObjective).toLowerCase().includes(input.topic.toLowerCase().split(' ')[0])
        : false;
      return similarity > 0.25 || sameEduCat;
    });

    const isDuplicate = similar.length > 0;
    const suggestedAngle = isDuplicate
      ? this.suggestAngle(input.topic, similar.map((s) => s.title))
      : null;

    if (isDuplicate) {
      this.logger.info(
        { topic: input.topic, similarCount: similar.length, suggestedAngle },
        'Duplicate content detected — suggesting unique angle',
      );
    }

    return {
      isDuplicate,
      similarCount: similar.length,
      existingTitles: similar.map((s) => s.title),
      suggestedAngle,
    };
  }

  /** Suggest a unique angle to differentiate from existing content */
  private suggestAngle(topic: string, existingTitles: string[]): string {
    const usedAngles = new Set(
      existingTitles.map((t) => t.toLowerCase()),
    );

    for (const suffix of ANGLE_SUFFIXES) {
      const candidate = `${topic} ${suffix}`;
      const alreadyUsed = [...usedAngles].some((t) => t.includes(suffix.split(' ')[0]));
      if (!alreadyUsed) return candidate;
    }

    // Fallback: add a number
    return `${topic} — Part ${existingTitles.length + 1}`;
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2),
    );
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}
