import type { EpisodeStructure, AgeBracket, EducationalCategory, EngagementHookType } from '@kidsvid/shared';

/**
 * Episode structure template for kids educational content.
 *
 * Structure: hook (15s) → problem/question (30s) → exploration/teaching (2-3min)
 *            → resolution/celebration (30s) → preview next episode (15s)
 */

export interface EpisodeTemplate {
  educationalCategory: EducationalCategory;
  ageBracket: AgeBracket;
  structure: EpisodeStructure;
  suggestedHooks: EngagementHookType[];
  promptGuidance: string;
}

export const EPISODE_TEMPLATES: Record<EducationalCategory, EpisodeTemplate> = {
  early_math: {
    educationalCategory: 'early_math',
    ageBracket: '2-4',
    structure: {
      hook: {
        duration: 15,
        description: 'Character discovers a math puzzle or mystery number. "Oh no! How many apples fell from the tree? Can you help me count?"',
      },
      problem: {
        duration: 30,
        description: 'Present the math problem visually with bright objects. Character tries but needs help. "Hmm, I think there are... let me count..."',
      },
      exploration: {
        duration: 150,
        description: 'Count together using visual aids. Repeat the concept 3 times with different objects. "One apple, two apples, three apples! Let\'s try with stars now!"',
      },
      resolution: {
        duration: 30,
        description: 'Celebrate getting the answer! Stars, confetti, cheering sounds. "You did it! We counted to 5! You\'re a counting superstar!"',
      },
      nextPreview: {
        duration: 15,
        description: 'Tease next episode\'s math adventure. "Next time, we learn about SHAPES! Can you find something round?"',
      },
    },
    suggestedHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'direct_address'],
    promptGuidance: 'Use visual counting with bright, distinct objects. Repeat the number/concept at least 3 times. Pause for child to count along. Celebrate each correct answer.',
  },

  phonics_reading: {
    educationalCategory: 'phonics_reading',
    ageBracket: '4-6',
    structure: {
      hook: {
        duration: 15,
        description: 'A letter appears magically or a character finds a mystery letter. "Today we\'re going on an adventure with the letter B! B-b-b-b!"',
      },
      problem: {
        duration: 30,
        description: 'Character needs to find things that start with the letter. "B is for... hmm, what starts with B? Can you think of something?"',
      },
      exploration: {
        duration: 150,
        description: 'Explore 4-5 words with the letter sound. Catchy mini-song for each. "B is for Ball! B-b-ball! B is for Banana! B-b-banana!"',
      },
      resolution: {
        duration: 30,
        description: 'Sing the full letter song recap. "B-B-B, Ball, Banana, Bear, Butterfly, Bus! You know the B sound!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: the letter C! Can you guess... what animal says MEOW and starts with C?"',
      },
    },
    suggestedHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'easter_egg'],
    promptGuidance: 'Emphasize the phonetic sound of the letter. Use alliteration. Include a catchy song/chant. Show the letter visually large and colorful.',
  },

  science: {
    educationalCategory: 'science',
    ageBracket: '4-6',
    structure: {
      hook: {
        duration: 15,
        description: 'Start with a "wow" question. "Did you know that rainbows have SEVEN colors? Want to find out what they are?"',
      },
      problem: {
        duration: 30,
        description: 'Character observes a natural phenomenon and wonders about it. "Look at that rainbow! But where do the colors come from?"',
      },
      exploration: {
        duration: 180,
        description: 'Simple experiment or visual explanation. Break into 3 discovery moments. Each one reveals a new fact with a "wow" reaction.',
      },
      resolution: {
        duration: 30,
        description: 'Summarize what we learned with a fun recap. "Today we discovered that light makes rainbows with 7 colors! Can you name them?"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: Why is the SKY blue? It\'s a mystery we\'re going to solve together!"',
      },
    },
    suggestedHooks: ['mystery_reveal', 'call_response', 'reward_loop', 'pattern_interrupt'],
    promptGuidance: 'Use "Did you know?" format. Break complex concepts into simple visual steps. Include a hands-on suggestion ("Try this at home!"). Sense of wonder is key.',
  },

  social_emotional: {
    educationalCategory: 'social_emotional',
    ageBracket: '4-6',
    structure: {
      hook: {
        duration: 15,
        description: 'Character faces an emotional situation. "Oh no, my friend looks sad today. What should I do?"',
      },
      problem: {
        duration: 30,
        description: 'Show the conflict or emotional challenge clearly. Character makes a relatable mistake.',
      },
      exploration: {
        duration: 150,
        description: 'Character tries different approaches, learns empathy. Shows wrong way then right way. "When I share, my friend smiles! Sharing makes us BOTH happy!"',
      },
      resolution: {
        duration: 30,
        description: 'Characters resolve the situation positively. Name the feeling and the lesson. "I felt frustrated, but I tried again and I did it!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: what do you do when you feel ANGRY? Let\'s learn a cool trick to calm down!"',
      },
    },
    suggestedHooks: ['character_growth', 'direct_address', 'call_response', 'reward_loop'],
    promptGuidance: 'Story-driven with relatable characters. Name emotions explicitly. Show growth mindset. Character makes mistakes and learns. Never preach — show through story.',
  },

  world_knowledge: {
    educationalCategory: 'world_knowledge',
    ageBracket: '4-6',
    structure: {
      hook: {
        duration: 15,
        description: 'Character boards a magic vehicle/portal. "Today we\'re flying to JAPAN! What do you think we\'ll find there?"',
      },
      problem: {
        duration: 30,
        description: 'Arrive and encounter something new and exciting. "Wow, look at this beautiful garden! And what is that tall mountain with snow on top?"',
      },
      exploration: {
        duration: 180,
        description: 'Discover 3-4 fun facts about the place. Food, animals, landmarks, language. "In Japan, people say KONNICHIWA to say hello! Can you say it?"',
      },
      resolution: {
        duration: 30,
        description: 'Recap the adventure on a fun "passport stamp" moment. "We learned 3 amazing things about Japan! Let\'s stamp our passport!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next stop: BRAZIL! We\'re going to see the biggest jungle in the world!"',
      },
    },
    suggestedHooks: ['mystery_reveal', 'call_response', 'reward_loop', 'cliffhanger'],
    promptGuidance: 'Adventure/exploration format. Use a magical travel mechanic. Teach through discovery. Include a word in the local language. Be culturally respectful.',
  },

  problem_solving: {
    educationalCategory: 'problem_solving',
    ageBracket: '4-6',
    structure: {
      hook: {
        duration: 15,
        description: 'Character faces a puzzle or obstacle. "Oh no! The bridge is broken! How will we get across? Can you help me think?"',
      },
      problem: {
        duration: 30,
        description: 'Show the problem clearly. Give the viewer a moment to think. "Hmm, we need something long and strong... what could we use?"',
      },
      exploration: {
        duration: 150,
        description: 'Try 2-3 solutions. First attempts fail in funny ways. "A banana? No, that\'s too bendy! A rope? Almost! What about a LOG?"',
      },
      resolution: {
        duration: 30,
        description: 'The correct solution works! Big celebration. "WE DID IT! The log made a perfect bridge! You are such a great problem solver!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: we need to find the SECRET KEY hidden in the castle! Can you help us search?"',
      },
    },
    suggestedHooks: ['mystery_reveal', 'call_response', 'direct_address', 'reward_loop'],
    promptGuidance: 'Interactive puzzle feel. Pause for viewer to "think". Wrong answers should be funny, not scary. Celebrate the process of trying, not just the answer.',
  },

  music_rhythm: {
    educationalCategory: 'music_rhythm',
    ageBracket: '2-4',
    structure: {
      hook: {
        duration: 15,
        description: 'Start with a catchy beat or instrument sound. "Do you hear that? TAP TAP TAP! Let\'s make music together!"',
      },
      problem: {
        duration: 30,
        description: 'Character wants to play a song but needs to learn the rhythm/instrument. "I want to play the drums but I don\'t know the pattern!"',
      },
      exploration: {
        duration: 150,
        description: 'Learn a simple rhythm or song. Repeat the pattern with variations. "CLAP clap CLAP! Now you try! CLAP clap CLAP!"',
      },
      resolution: {
        duration: 30,
        description: 'Play the full song together. "We played the whole song! Listen to how AMAZING we sound together!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: we learn the GUITAR! And a brand new song!"',
      },
    },
    suggestedHooks: ['call_response', 'reward_loop', 'pattern_interrupt', 'direct_address'],
    promptGuidance: 'Heavy on repetition. Build patterns up gradually. Use body percussion (clap, stomp, snap). Song should be earworm-level catchy. Repeat the hook 3+ times.',
  },
};

export function getTemplate(category: EducationalCategory): EpisodeTemplate {
  return EPISODE_TEMPLATES[category];
}

export function getTemplateForAge(
  category: EducationalCategory,
  ageBracket: AgeBracket,
): EpisodeTemplate {
  const template = { ...EPISODE_TEMPLATES[category] };
  template.ageBracket = ageBracket;

  // Adjust exploration duration based on age
  const explorationDuration =
    ageBracket === '2-4' ? 120 : ageBracket === '4-6' ? 150 : 180;

  template.structure = {
    ...template.structure,
    exploration: {
      ...template.structure.exploration,
      duration: explorationDuration,
    },
  };

  return template;
}
