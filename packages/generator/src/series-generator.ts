import type {
  SeriesDefinition,
  EpisodeOutline,
  EducationalCategory,
  AgeBracket,
  EngagementHookType,
  Logger,
} from '@kidsvid/shared';
import { ENGAGEMENT_HOOK_TYPES } from '@kidsvid/shared';
import { DEFAULT_CHARACTERS } from './character-bible.js';

/** Content Series Generator.
 * Creates multi-episode series definitions with story arcs, episode
 * sequencing where each builds on the last, and playlist mapping. */

export interface SeriesRequest {
  name: string;
  educationalCategory: EducationalCategory;
  topic: string;
  ageBracket: AgeBracket;
  totalEpisodes: number;
  characterIds: number[];
  season?: number;
}

/** Pre-built series templates for common educational themes */
export const SERIES_TEMPLATES: Record<string, Omit<SeriesRequest, 'name' | 'totalEpisodes'>> = {
  counting_basics: {
    educationalCategory: 'early_math',
    topic: 'counting and numbers',
    ageBracket: '2-4',
    characterIds: [4], // Pixel & Dot
  },
  alphabet_adventure: {
    educationalCategory: 'phonics_reading',
    topic: 'letters and sounds',
    ageBracket: '2-4',
    characterIds: [1], // Melody
  },
  science_explorers: {
    educationalCategory: 'science',
    topic: 'everyday science',
    ageBracket: '4-6',
    characterIds: [0, 2], // Cosmo + Professor Paws
  },
  feelings_friends: {
    educationalCategory: 'social_emotional',
    topic: 'emotions and social skills',
    ageBracket: '4-6',
    characterIds: [3], // Brave Bea
  },
  world_discovery: {
    educationalCategory: 'world_knowledge',
    topic: 'exploring the world',
    ageBracket: '6-8',
    characterIds: [0, 3], // Cosmo + Brave Bea
  },
};

/** Topic progressions for each educational category */
const TOPIC_PROGRESSIONS: Record<EducationalCategory, string[]> = {
  early_math: [
    'numbers 1-5', 'numbers 6-10', 'shapes (circle, square, triangle)',
    'counting objects', 'more and less', 'simple patterns (AB, AB)',
    'sorting by color', 'sorting by size', 'numbers 11-20',
    'simple addition', 'number bonds to 5', 'measuring big and small',
  ],
  phonics_reading: [
    'letter A and its sound', 'letter B and its sound', 'letter C and its sound',
    'rhyming words', 'CVC words (cat, hat, bat)', 'letter D and E sounds',
    'beginning sounds', 'ending sounds', 'sight words (the, and, is)',
    'short vowel sounds', 'blending sounds', 'simple sentences',
  ],
  science: [
    'water and ice', 'plants grow from seeds', 'day and night',
    'rain and weather', 'magnets attract', 'light and shadows',
    'animals and habitats', 'hot and cold', 'sink or float',
    'the five senses', 'seasons change', 'bugs and insects',
  ],
  social_emotional: [
    'happy and sad feelings', 'sharing with friends', 'being brave',
    'saying sorry', 'taking turns', 'being kind',
    'managing anger', 'making friends', 'being a good listener',
    'helping others', 'patience and waiting', 'celebrating differences',
  ],
  world_knowledge: [
    'animals around the world', 'oceans and seas', 'continents',
    'different cultures and foods', 'vehicles and transport', 'space and planets',
    'community helpers', 'weather patterns', 'forests and jungles',
    'mountains and rivers', 'cities and farms', 'recycling and nature',
  ],
  problem_solving: [
    'puzzles and matching', 'finding patterns', 'mazes and paths',
    'what comes next?', 'odd one out', 'building with blocks',
    'cause and effect', 'sequencing events', 'creative solutions',
    'teamwork challenges', 'logic games', 'inventions and ideas',
  ],
  music_rhythm: [
    'clapping rhythms', 'fast and slow', 'loud and quiet',
    'high and low notes', 'instruments of the band', 'singing scales',
    'body percussion', 'dance and movement', 'making music with objects',
    'musical patterns', 'songs of the world', 'creating a song',
  ],
};

export class SeriesGenerator {
  constructor(private logger: Logger) {}

  /** Generate a full series outline from a single request */
  generate(request: SeriesRequest): SeriesDefinition {
    const characters = request.characterIds
      .map((id) => DEFAULT_CHARACTERS[id])
      .filter(Boolean);

    const characterNames = characters.map((c) => c.name).join(' & ');
    const storyArc = this.buildStoryArc(request, characterNames);
    const episodes = this.buildEpisodeOutlines(request);

    const seriesId = this.generateSeriesId(request.name, request.season);

    const series: SeriesDefinition = {
      id: seriesId,
      name: request.name,
      description: `${request.name} — A ${request.totalEpisodes}-episode series teaching ${request.topic} to ${request.ageBracket} year olds with ${characterNames || 'fun characters'}.`,
      educationalCategory: request.educationalCategory,
      ageBracket: request.ageBracket,
      characterIds: request.characterIds,
      totalEpisodes: request.totalEpisodes,
      season: request.season ?? 1,
      storyArc,
      episodeOutlines: episodes,
    };

    this.logger.info(
      {
        seriesId,
        name: request.name,
        episodes: episodes.length,
        category: request.educationalCategory,
      },
      'Series generated',
    );

    return series;
  }

  /** Generate from a natural language prompt */
  generateFromPrompt(prompt: string): SeriesDefinition {
    const parsed = this.parsePrompt(prompt);
    return this.generate(parsed);
  }

  /** Get available topic progressions for a category */
  getTopicsForCategory(category: EducationalCategory): string[] {
    return TOPIC_PROGRESSIONS[category] ?? [];
  }

  private buildStoryArc(request: SeriesRequest, characterNames: string): string {
    const { educationalCategory, topic, totalEpisodes, ageBracket } = request;

    return `Season ${request.season ?? 1} of "${request.name}": ${characterNames || 'Our characters'} embark on a ${totalEpisodes}-episode journey exploring ${topic}. Each episode builds on the last — starting with fundamentals and progressing to more complex concepts. Designed for ${ageBracket} year olds, the series uses repetition, songs, and interactive moments to reinforce learning. By the final episode, viewers will have mastered the core concepts of ${educationalCategory.replace(/_/g, ' ')}.`;
  }

  private buildEpisodeOutlines(request: SeriesRequest): EpisodeOutline[] {
    const topics = TOPIC_PROGRESSIONS[request.educationalCategory] ?? [];
    const episodes: EpisodeOutline[] = [];

    for (let i = 0; i < request.totalEpisodes; i++) {
      const topic = topics[i % topics.length] ?? `${request.topic} - Part ${i + 1}`;
      const prevTopic = i > 0 ? topics[(i - 1) % topics.length] ?? 'previous concepts' : 'nothing (first episode)';

      // Rotate engagement hooks across episodes for variety
      const hookPool: EngagementHookType[] = [...ENGAGEMENT_HOOK_TYPES];
      const hooks: EngagementHookType[] = [
        'call_response', // Always include for kids
        'reward_loop',   // Always include for kids
        hookPool[(i * 2) % hookPool.length],
        hookPool[(i * 2 + 1) % hookPool.length],
      ];
      const uniqueHooks = [...new Set(hooks)];

      episodes.push({
        episodeNumber: i + 1,
        title: this.generateEpisodeTitle(request.name, topic, i + 1),
        topic,
        educationalObjective: `Learn about ${topic} through interactive play and songs`,
        buildOn: i === 0
          ? 'First episode — introduces the series theme and characters'
          : `Builds on Episode ${i}: "${prevTopic}"`,
        engagementHooks: uniqueHooks,
        targetDuration: request.ageBracket === '2-4' ? 150 : request.ageBracket === '4-6' ? 210 : 270,
      });
    }

    return episodes;
  }

  private generateEpisodeTitle(seriesName: string, topic: string, epNum: number): string {
    const topicCapitalized = topic.charAt(0).toUpperCase() + topic.slice(1);
    return `${seriesName} Ep.${epNum}: ${topicCapitalized}!`;
  }

  private generateSeriesId(name: string, season?: number): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${slug}-s${season ?? 1}`;
  }

  private parsePrompt(prompt: string): SeriesRequest {
    // Extract episode count
    const episodeMatch = prompt.match(/(\d+)[- ]?episode/i);
    const totalEpisodes = episodeMatch ? parseInt(episodeMatch[1], 10) : 10;

    // Extract age
    const ageMatch = prompt.match(/(\d+)[- ]?year[- ]?old/i);
    const age = ageMatch ? parseInt(ageMatch[1], 10) : 4;
    const ageBracket: AgeBracket = age <= 3 ? '2-4' : age <= 5 ? '4-6' : '6-8';

    // Extract topic keywords and map to category
    const lowerPrompt = prompt.toLowerCase();
    let educationalCategory: EducationalCategory = 'early_math';
    let topic = 'educational content';

    if (/count|number|math|add/i.test(lowerPrompt)) {
      educationalCategory = 'early_math';
      topic = 'counting and numbers';
    } else if (/color|colour/i.test(lowerPrompt)) {
      educationalCategory = 'science';
      topic = 'colors';
    } else if (/letter|abc|alphabet|phonic|read/i.test(lowerPrompt)) {
      educationalCategory = 'phonics_reading';
      topic = 'letters and sounds';
    } else if (/science|nature|animal|plant|weather/i.test(lowerPrompt)) {
      educationalCategory = 'science';
      topic = 'science exploration';
    } else if (/feel|emotion|friend|share|kind/i.test(lowerPrompt)) {
      educationalCategory = 'social_emotional';
      topic = 'emotions and social skills';
    } else if (/shape/i.test(lowerPrompt)) {
      educationalCategory = 'early_math';
      topic = 'shapes';
    } else if (/music|song|rhythm|dance/i.test(lowerPrompt)) {
      educationalCategory = 'music_rhythm';
      topic = 'music and rhythm';
    } else if (/world|culture|planet|ocean/i.test(lowerPrompt)) {
      educationalCategory = 'world_knowledge';
      topic = 'world knowledge';
    } else if (/puzzle|problem|think|logic/i.test(lowerPrompt)) {
      educationalCategory = 'problem_solving';
      topic = 'problem solving';
    }

    // Extract series name or generate one
    const nameMatch = prompt.match(/(?:series|called|named|titled)\s+"([^"]+)"/i);
    const name = nameMatch ? nameMatch[1] : `${topic.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} with ${DEFAULT_CHARACTERS[0]?.name ?? 'Friends'}`;

    return {
      name,
      educationalCategory,
      topic,
      ageBracket,
      totalEpisodes,
      characterIds: [0], // Default to Cosmo
    };
  }
}
