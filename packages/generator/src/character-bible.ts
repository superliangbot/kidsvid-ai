import type { CharacterDef } from '@kidsvid/shared';

/** Default character library for content generation.
 * Each character has a distinct teaching style and personality. */

export const DEFAULT_CHARACTERS: CharacterDef[] = [
  {
    name: 'Cosmo',
    description: 'A curious little robot who loves to explore and learn about the world',
    personality: 'Endlessly curious, a bit clumsy, very enthusiastic. Makes mistakes but never gives up. Celebrates every small discovery.',
    appearance: 'Small rounded robot, bright blue body, large expressive LED eyes, little antenna that lights up when excited',
    catchphrases: [
      'Wow, let\'s find out!',
      'Oopsie! Let me try again!',
      'My antenna is tingling — I think I know!',
      'Discovery time!',
    ],
    ageRange: '2-6',
    teachingStyle: 'through curiosity — asks questions, explores, makes mistakes, discovers answers together with the viewer',
    styleSheet: {
      primaryColor: '#4A90D9',
      secondaryColor: '#FFD700',
      eyeColor: '#00FF88',
      animationStyle: 'bouncy and energetic',
    },
  },
  {
    name: 'Melody',
    description: 'A musical fairy who teaches through songs and rhythm',
    personality: 'Cheerful, musical, turns everything into a song. Gentle and encouraging. Loves to dance.',
    appearance: 'Small fairy with rainbow wings, sparkly purple dress, musical notes float around her when she sings',
    catchphrases: [
      'Let\'s sing it together!',
      'Ready? Here we go! La la la!',
      'Music makes everything better!',
      'One more time, with feeling!',
    ],
    ageRange: '2-5',
    teachingStyle: 'through songs — creates catchy melodies for every lesson, uses rhythm and repetition to make concepts stick',
    styleSheet: {
      primaryColor: '#9B59B6',
      secondaryColor: '#F39C12',
      wingColor: 'rainbow gradient',
      animationStyle: 'floaty and graceful with sparkle effects',
    },
  },
  {
    name: 'Professor Paws',
    description: 'A wise but silly cat who knows lots of facts about the world',
    personality: 'Smart but goofy, gets distracted by cat things (yarn, naps, boxes). Presents facts in a "did you know?" style. Falls asleep at funny moments.',
    appearance: 'Orange tabby cat with tiny glasses, bow tie, and a small chalkboard. Fluffy tail that swishes when excited.',
    catchphrases: [
      'Did you know? DID YOU KNOW?!',
      'Now THAT\'s a fun fact!',
      'Hmm, let me check my big book of... *yawns* ...sorry, where was I?',
      'Paws-itively amazing!',
    ],
    ageRange: '4-8',
    teachingStyle: 'through facts and humor — presents knowledge with comedy, uses silly moments to keep attention, makes learning feel fun and not like school',
    styleSheet: {
      primaryColor: '#E67E22',
      secondaryColor: '#2ECC71',
      glassesColor: '#34495E',
      animationStyle: 'cat-like movements, occasionally distracted',
    },
  },
  {
    name: 'Brave Bea',
    description: 'An adventurous bear cub who solves problems and never gives up',
    personality: 'Brave but relatable — gets scared sometimes but pushes through. Growth mindset champion. Celebrates effort over results.',
    appearance: 'Small brown bear cub with a red explorer hat, tiny backpack with a map sticking out, hiking boots',
    catchphrases: [
      'We can do this! Let\'s try!',
      'Hmm, that didn\'t work. But I have another idea!',
      'Adventure awaits!',
      'I was a little scared, but I tried anyway!',
    ],
    ageRange: '3-7',
    teachingStyle: 'through challenges and growth mindset — faces problems head-on, models perseverance, shows that mistakes are learning opportunities',
    styleSheet: {
      primaryColor: '#8B4513',
      secondaryColor: '#E74C3C',
      hatColor: '#C0392B',
      animationStyle: 'determined and expressive, big emotions',
    },
  },
  {
    name: 'Pixel & Dot',
    description: 'Twin number sprites who live in a world made of math',
    personality: 'Pixel is enthusiastic and counts everything. Dot is calm and spots patterns. They work as a team.',
    appearance: 'Two small glowing sprites — Pixel is a blue square, Dot is a pink circle. They leave trails of numbers and shapes.',
    catchphrases: [
      'Pixel: "Count with me! 1, 2, 3!"',
      'Dot: "I see a pattern! Look!"',
      'Both: "Math is everywhere!"',
      'Pixel: "How many? Let\'s find out!"',
    ],
    ageRange: '3-6',
    teachingStyle: 'through visual math — numbers and shapes come alive, counting is an adventure, patterns are puzzles to solve together',
    styleSheet: {
      primaryColor: '#3498DB',
      secondaryColor: '#E91E63',
      trailEffect: 'glowing numbers and shapes',
      animationStyle: 'zippy and geometric',
    },
  },
];

export function getCharacterByName(name: string): CharacterDef | undefined {
  return DEFAULT_CHARACTERS.find(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  );
}

export function getCharactersForAge(ageBracket: string): CharacterDef[] {
  const [minStr, maxStr] = ageBracket.split('-');
  const min = parseInt(minStr, 10);
  const max = parseInt(maxStr, 10);

  return DEFAULT_CHARACTERS.filter((c) => {
    const [cMin, cMax] = c.ageRange.split('-').map(Number);
    return cMin <= max && cMax >= min; // overlapping ranges
  });
}
