import type { Logger } from '@kidsvid/shared';

/** SEO optimizer for YouTube kids content.
 * Uses analysis patterns to optimize titles, descriptions, and tags. */

export interface SeoInput {
  title: string;
  description: string;
  tags: string[];
  category: string;
}

export interface SeoResult {
  title: string;
  description: string;
  tags: string[];
  changes: string[];
}

export class SeoOptimizer {
  constructor(private logger: Logger) {}

  optimize(input: SeoInput): SeoResult {
    const changes: string[] = [];
    let { title, description, tags } = input;

    // Title optimizations
    if (title.length > 60) {
      title = title.slice(0, 57) + '...';
      changes.push('Truncated title to 60 chars');
    }

    // Ensure title has engagement markers
    if (!/[!?]/.test(title) && !/\d/.test(title)) {
      title = title + '!';
      changes.push('Added exclamation to title');
    }

    // Description optimizations
    const descLines = [
      description,
      '',
      '---',
      `#kids #educational #learning #${input.category.replace(/_/g, '')}`,
      '',
      'Subscribe for new videos every week!',
    ];
    description = descLines.join('\n');
    changes.push('Added hashtags and subscribe CTA to description');

    // Tag optimizations
    const baseTags = [
      'kids',
      'children',
      'educational',
      'learning',
      'kids videos',
      'preschool',
      'toddler',
      'kids learning',
    ];
    const merged = [...new Set([...tags, ...baseTags])];
    if (merged.length > tags.length) {
      changes.push(`Added ${merged.length - tags.length} base tags`);
    }
    tags = merged.slice(0, 500); // YouTube tag limit is 500 chars total

    this.logger.info({ changes }, 'SEO optimization applied');

    return { title, description, tags, changes };
  }
}
