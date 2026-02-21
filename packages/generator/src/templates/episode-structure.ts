import type { EpisodeStructure, AgeBracket, EducationalCategory, EngagementHookType } from '@kidsvid/shared';

/**
 * Episode structure template for kids educational content.
 *
 * Structure: hook (15s) -> problem/question (30s) -> exploration/teaching (2-3min)
 *            -> resolution/celebration (30s) -> preview next episode (15s)
 *
 * Total target: 3-4 minutes for ages 2-4, 4-5 minutes for 4-6, 5-7 minutes for 6-8
 */

export interface EpisodeTemplate {
  educationalCategory: EducationalCategory;
  ageBracket: AgeBracket;
  structure: EpisodeStructure;
  suggestedHooks: EngagementHookType[];
  promptGuidance: string;
}

/**
 * Engagement hook descriptions — used to guide LLM script generation.
 * Each hook type has a specific purpose in keeping kids engaged while learning.
 */
export const ENGAGEMENT_HOOK_DESCRIPTIONS: Record<EngagementHookType, {
  name: string;
  description: string;
  example: string;
  bestFor: EducationalCategory[];
}> = {
  mystery_reveal: {
    name: 'Mystery & Reveals',
    description: 'Create curiosity gaps. Present a mystery, let kids guess, then reveal the answer with a big payoff.',
    example: '"What\'s behind door number 3? Let\'s count to find out! 1... 2... 3!"',
    bestFor: ['early_math', 'science', 'world_knowledge', 'problem_solving'],
  },
  call_response: {
    name: 'Call and Response',
    description: 'Pause and ask kids to answer, count, or repeat. The most powerful learning hook — active participation cements knowledge.',
    example: '"Can you count with me? Ready? 1... 2... 3! Now YOU say it! ... Great job!"',
    bestFor: ['early_math', 'phonics_reading', 'music_rhythm', 'science'],
  },
  reward_loop: {
    name: 'Reward Loop',
    description: 'Celebrate correct answers with sounds, animations, confetti. Dopamine hit tied to learning, not passive consumption.',
    example: '[Stars explode, confetti rains down] "YOU DID IT! You counted to 5! AMAZING!"',
    bestFor: ['early_math', 'phonics_reading', 'problem_solving', 'music_rhythm'],
  },
  cliffhanger: {
    name: 'Cliffhanger / Next Episode Tease',
    description: 'End with a question about what comes next. Drives playlist engagement and series commitment.',
    example: '"Next time, we visit the OCEAN! What animals live under the water? Find out next time!"',
    bestFor: ['world_knowledge', 'science', 'social_emotional', 'problem_solving'],
  },
  character_growth: {
    name: 'Character Growth & Mistakes',
    description: 'Character learns alongside the kid, makes mistakes, models growth mindset. Kids relate to imperfect characters.',
    example: '"Oops! I counted wrong! Let me try again... You\'ll help me, right?"',
    bestFor: ['social_emotional', 'problem_solving', 'early_math', 'science'],
  },
  easter_egg: {
    name: 'Easter Eggs & Running Gags',
    description: 'Recurring silly moments kids anticipate and look forward to. Builds series loyalty.',
    example: '[Professor Paws falls asleep mid-sentence AGAIN] "Wake up, Professor! Haha!"',
    bestFor: ['phonics_reading', 'world_knowledge', 'music_rhythm', 'science'],
  },
  pattern_interrupt: {
    name: 'Pattern Interrupt',
    description: 'Unexpected funny moment that breaks the flow to recapture wandering attention. Use sparingly.',
    example: '[Character is counting calmly] "5, 6, 7—" [A rubber duck falls from the sky] "Where did THAT come from?!"',
    bestFor: ['early_math', 'phonics_reading', 'science', 'world_knowledge'],
  },
  direct_address: {
    name: 'Direct Address (The Dora Formula)',
    description: 'Talk directly to the viewer, wait for their "response", then celebrate together. Creates the illusion of conversation.',
    example: '"Do YOU see the red ball? Where is it? ... YES! It\'s behind the tree! Great job, you found it!"',
    bestFor: ['early_math', 'phonics_reading', 'problem_solving', 'science'],
  },
};

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
        description: 'Celebrate getting the answer! Stars, confetti, cheering sounds. "You did it! We counted to 5! Now we know — you learned to count!"',
      },
      nextPreview: {
        duration: 15,
        description: 'Tease next episode\'s math adventure. "Next time, we learn about SHAPES! Can you find something round?"',
      },
    },
    suggestedHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'direct_address'],
    promptGuidance: `Use visual counting with bright, distinct objects. Repeat the number/concept at least 3 times.
Pause for child to count along (call-and-response). Celebrate each correct answer with reward sounds.
Use the Dora formula: ask a question, wait, then confirm.
For ages 2-4: stick to numbers 1-10, basic shapes, simple patterns.
For ages 4-6: introduce addition/subtraction, skip counting, number bonds.
For ages 6-8: multiplication concepts, fractions intro, multi-step problems.`,
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
        description: 'Sing the full letter song recap. "B-B-B, Ball, Banana, Bear, Butterfly, Bus! Now you know — you discovered the B sound!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: the letter C! Can you guess... what animal says MEOW and starts with C?"',
      },
    },
    suggestedHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'easter_egg'],
    promptGuidance: `Emphasize the phonetic sound of the letter, not just the name.
Use alliteration heavily. Include a catchy song/chant that repeats the sound.
Show the letter visually large and colorful. Pair each word with a clear image.
For ages 2-4: letter recognition, initial sounds only.
For ages 4-6: blending sounds, CVC words, sight words.
For ages 6-8: word families, digraphs, simple sentences.`,
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
        description: 'Summarize what we learned with a fun recap. "Today we discovered that light makes rainbows with 7 colors! Now you remember them!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: Why is the SKY blue? It\'s a mystery we\'re going to solve together!"',
      },
    },
    suggestedHooks: ['mystery_reveal', 'call_response', 'reward_loop', 'pattern_interrupt'],
    promptGuidance: `Use "Did you know?" format to spark curiosity.
Break complex concepts into simple visual steps (max 3 discovery moments).
Include a hands-on suggestion ("Try this at home with a grown-up!").
Sense of wonder is key — every fact should feel like a revelation.
For ages 2-4: sensory exploration (colors, textures, water, animals).
For ages 4-6: simple cause-and-effect, animal facts, weather, plants.
For ages 6-8: basic experiments, earth science, the human body, space.`,
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
        description: 'Characters resolve the situation positively. Name the feeling and the lesson. "I learned that when I feel frustrated, I can take a deep breath and try again!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: what do you do when you feel ANGRY? Let\'s learn a cool trick to calm down!"',
      },
    },
    suggestedHooks: ['character_growth', 'direct_address', 'call_response', 'reward_loop'],
    promptGuidance: `Story-driven with relatable characters. Name emotions explicitly ("I feel sad").
Show growth mindset — character makes mistakes and learns from them.
Never preach — show through story. Wrong approach first, then correct approach.
For ages 2-4: sharing, taking turns, naming basic emotions (happy, sad, angry).
For ages 4-6: empathy, friendship, dealing with frustration, asking for help.
For ages 6-8: conflict resolution, self-regulation, understanding different perspectives.`,
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
        description: 'Recap the adventure on a fun "passport stamp" moment. "We learned 3 amazing things about Japan! Now we remember our adventure!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next stop: BRAZIL! We\'re going to see the biggest jungle in the world!"',
      },
    },
    suggestedHooks: ['mystery_reveal', 'call_response', 'reward_loop', 'cliffhanger'],
    promptGuidance: `Adventure/exploration format. Use a magical travel mechanic.
Teach through discovery — the character is experiencing it for the first time too.
Include a word in the local language (call-and-response to practice it).
Be culturally respectful and focus on celebration of differences.
For ages 2-4: animals from different places, basic geography (ocean, mountain).
For ages 4-6: countries, cultures, food, landmarks, greetings.
For ages 6-8: history basics, ecosystems, how things are made, global awareness.`,
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
        description: 'The correct solution works! Big celebration. "WE DID IT! The log made a perfect bridge! You found out the answer — great problem solving!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: we need to find the SECRET KEY hidden in the castle! Can you help us search?"',
      },
    },
    suggestedHooks: ['mystery_reveal', 'call_response', 'direct_address', 'reward_loop'],
    promptGuidance: `Interactive puzzle feel. Pause for viewer to "think" (Dora formula).
Wrong answers should be funny, not scary. Celebrate the process of TRYING, not just the answer.
Model the thought process out loud: "Hmm, let me think... it needs to be long AND strong..."
For ages 2-4: simple matching, sorting by color/size, finding hidden objects.
For ages 4-6: logical sequences, mazes, simple puzzles, building challenges.
For ages 6-8: multi-step problems, cause-and-effect chains, creative solutions.`,
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
        description: 'Play the full song together. "We played the whole song! We learned a new rhythm today!"',
      },
      nextPreview: {
        duration: 15,
        description: '"Next time: we learn the GUITAR! And a brand new song!"',
      },
    },
    suggestedHooks: ['call_response', 'reward_loop', 'pattern_interrupt', 'direct_address'],
    promptGuidance: `Heavy on repetition — repeat the core rhythm/melody at least 3 times.
Build patterns up gradually: simple -> add one element -> full pattern.
Use body percussion (clap, stomp, snap) so kids can participate physically.
Song should be earworm-level catchy. Repeat the hook 3+ times.
For ages 2-4: simple clapping patterns, animal sounds, basic rhythms.
For ages 4-6: instrument identification, following a beat, simple melodies.
For ages 6-8: rhythm reading, pitch concepts, creating simple compositions.`,
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

export function getHooksForCategory(category: EducationalCategory): EngagementHookType[] {
  return EPISODE_TEMPLATES[category].suggestedHooks;
}
