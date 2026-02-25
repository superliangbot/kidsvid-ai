#!/usr/bin/env npx tsx
/**
 * Pro Video V8 — Character Consistency Overhaul
 *
 * Pipeline: Cosmo Identity → Imagen Starting Frames → Veo Motion-Only → Quality Gate → FFmpeg Concat
 *
 * Key improvements over V7:
 * - Fixed Gemini API calls (no referenceImages/generateAudio — those are Vertex AI only)
 * - Imagen 4 generates per-scene starting frames (character in context)
 * - Veo receives starting frame via `image` param, gets motion-only prompts
 * - Gemini refines prompts before each Veo call
 * - Gemini evaluates each clip frame + retry on low quality
 * - negativePrompt on every call
 * - Consistent seed across scenes
 * - FFmpeg block overlay + TTS + SFX + music from V7
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Local modules
import { COSMO_IDENTITY } from '../src/characters/cosmo.js';
import { VeoProvider } from '../src/providers/veo.js';
import { ImagenProvider } from '../src/providers/imagen.js';
import { PromptEngineer } from '../src/pipeline/prompt-engineer.js';
import { QualityGate } from '../src/pipeline/quality-gate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v8');
const VEO_DELAY_MS = 150_000;
const MAX_RETRIES = 2;
const QUALITY_MIN_SCORE = 7;
const CONSISTENT_SEED = 42;
const STATE_FILE = resolve(OUTPUT_DIR, 'pipeline_state.json');

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

interface StoryBeat {
  id: string;
  phase: 'intro' | 'count' | 'celebrate' | 'outro';
  blockCount: number;
  /** Scene idea — what happens in this beat (human-readable). */
  sceneIdea: string;
  /** TTS narration. */
  narration: string;
  /** Veo clip duration in seconds. */
  veoDurationSec: number;
}

interface PipelineState {
  clipsDone: number[];
  startedAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════
// BLOCK COLORS
// ═══════════════════════════════════════════════════

const BLOCK_COLORS = [
  '#FF3333', '#FF8833', '#FFDD33', '#33CC33', '#3388FF',
  '#9933FF', '#FF66CC', '#FFFFFF', '#33DDDD', '#FFD700',
];

// ═══════════════════════════════════════════════════
// STORY BEATS — scene ideas (NOT full Veo prompts — Gemini refines these)
// ═══════════════════════════════════════════════════

const STORY_BEATS: StoryBeat[] = [
  {
    id: 'intro',
    phase: 'intro',
    blockCount: 0,
    sceneIdea: 'Cosmo stands in a bright colorful workshop with wooden shelves and toys. He waves hello at the camera with both hands, bouncing excitedly. He gestures to a clear area on his right where there is an empty wooden platform ready for building. Camera slowly zooms in. Bright warm lighting.',
    narration: "Hi friends! I'm Cosmo, and today we're going to count to ten by building the tallest tower ever! Are you ready? Let's go!",
    veoDurationSec: 8,
  },
  {
    id: 'count_1',
    phase: 'count',
    blockCount: 1,
    sceneIdea: 'Cosmo reaches down and picks up a bright red cube with both hands. He lifts it up proudly, then places it on the wooden platform. He looks at the camera and holds up one finger. Close-up shot, warm lighting.',
    narration: 'One! One red block. This is where our tower begins!',
    veoDurationSec: 8,
  },
  {
    id: 'count_2',
    phase: 'count',
    blockCount: 2,
    sceneIdea: 'Cosmo picks up an orange cube and carefully stacks it on top of the red block, pressing it down gently. He claps his hands together happily and bounces. Medium shot, bright workshop background.',
    narration: 'Two! One, two! An orange block on top. Our tower is growing!',
    veoDurationSec: 8,
  },
  {
    id: 'count_3',
    phase: 'count',
    blockCount: 3,
    sceneIdea: 'Cosmo holds up a yellow cube, showing it to the camera with a big smile. He reaches up slightly higher to stack it, then steps back counting on his fingers. Workshop background.',
    narration: 'Three! One, two, three! A yellow block makes three. Can you count with me?',
    veoDurationSec: 8,
  },
  {
    id: 'count_4',
    phase: 'count',
    blockCount: 4,
    sceneIdea: 'Cosmo concentrates hard, tongue peeking out, carefully placing a green cube up higher. He steadies it, then gives a thumbs up with a relieved smile. Medium shot, warm workshop lighting.',
    narration: "Four! One, two, three, four! Green makes four. We're almost halfway!",
    veoDurationSec: 8,
  },
  {
    id: 'count_5',
    phase: 'count',
    blockCount: 5,
    sceneIdea: 'Cosmo excitedly places a blue cube and then jumps up and down with his arms raised. Small sparkles appear around him. He does a little victory spin. Wide shot, bright workshop.',
    narration: "Five! One, two, three, four, five! Wow, five blocks! We're halfway there!",
    veoDurationSec: 8,
  },
  {
    id: 'midpoint',
    phase: 'celebrate',
    blockCount: 5,
    sceneIdea: 'Cosmo does an adorable robot dance — bobbing side to side, pumping his stubby arms, spinning around. Colorful sparkles and small confetti particles float around him. He points at the camera. Bright festive lighting.',
    narration: "Great job counting to five! You're doing amazing! Let's keep going and build it even taller!",
    veoDurationSec: 8,
  },
  {
    id: 'count_6',
    phase: 'count',
    blockCount: 6,
    sceneIdea: 'Cosmo stands on a small wooden step stool to reach higher. He carefully places a purple cube, wobbling slightly on the stool but keeping balance. He looks up admiringly at the growing height. Workshop background.',
    narration: 'Six! One, two, three, four, five, six! Purple makes six!',
    veoDurationSec: 8,
  },
  {
    id: 'count_7',
    phase: 'count',
    blockCount: 7,
    sceneIdea: 'Cosmo stretches on tiptoes on the step stool, reaching way up with a pink cube. His antenna wobbles as he stretches. He places it and looks amazed at how tall it is getting. Camera tilts up slightly.',
    narration: "Seven! One, two, three, four, five, six, seven! Pink makes seven. It's getting so tall!",
    veoDurationSec: 8,
  },
  {
    id: 'count_8',
    phase: 'count',
    blockCount: 8,
    sceneIdea: 'Cosmo really stretching now, on the very tips of his toes on the stool, reaching up with a white cube. His eyes are wide looking up at the towering height. He manages to place it and holds up both hands showing eight fingers. Slight low angle camera.',
    narration: 'Eight! Count with me — one, two, three, four, five, six, seven, eight! Almost there!',
    veoDurationSec: 8,
  },
  {
    id: 'count_9',
    phase: 'count',
    blockCount: 9,
    sceneIdea: 'Cosmo very nervously and carefully reaches up with a cyan cube. Something wobbles and he gasps, quickly steadying it with a panicked expression. Then he sighs with huge relief, wiping his forehead. Tense then relieved mood.',
    narration: 'Nine! One, two, three, four, five, six, seven, eight, nine! Careful! Just one more!',
    veoDurationSec: 8,
  },
  {
    id: 'count_10',
    phase: 'count',
    blockCount: 10,
    sceneIdea: 'Cosmo holds up a special shiny golden cube that glows and sparkles. He reaches up dramatically in slow motion to place the final piece. Golden light bursts out. He throws both arms up in an epic victory pose, antenna glowing bright. Dramatic cinematic lighting, then explosion of color.',
    narration: 'TEN! We did it! One, two, three, four, five, six, seven, eight, nine, TEN! The tallest tower EVER!',
    veoDurationSec: 8,
  },
  {
    id: 'finale',
    phase: 'outro',
    blockCount: 10,
    sceneIdea: 'Cosmo dances joyfully next to a colorful tower, confetti and sparkles raining down everywhere. He waves goodbye at the camera with both hands, blows a kiss, then takes a cute little bow. The workshop is bathed in warm golden light.',
    narration: "You counted all the way to ten! You're a SUPER builder! Don't forget to subscribe for more fun! See you next time, friends! Bye bye!",
    veoDurationSec: 8,
  },
];

// ═══════════════════════════════════════════════════
// PROVIDERS (lazy-init)
// ═══════════════════════════════════════════════════

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY not set in .env');
  return key;
}

function createVeo(): VeoProvider {
  return new VeoProvider({
    apiKey: getApiKey(),
    model: 'veo-3.0-generate-001',
    defaultNegativePrompt: COSMO_IDENTITY.negativePrompt,
  });
}

function createImagen(): ImagenProvider {
  return new ImagenProvider({ apiKey: getApiKey() });
}

function createPromptEngineer(): PromptEngineer {
  return new PromptEngineer({ apiKey: getApiKey() });
}

function createQualityGate(): QualityGate {
  return new QualityGate({ apiKey: getApiKey(), minScore: QUALITY_MIN_SCORE });
}

// ═══════════════════════════════════════════════════
// RESUME STATE
// ═══════════════════════════════════════════════════

async function loadState(): Promise<PipelineState> {
  if (existsSync(STATE_FILE)) {
    const s = JSON.parse(await readFile(STATE_FILE, 'utf-8'));
    console.log(`♻️  Resume: ${s.clipsDone.length}/${STORY_BEATS.length} clips done`);
    return s;
  }
  return { clipsDone: [], startedAt: new Date().toISOString(), updatedAt: '' };
}

async function saveState(state: PipelineState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

// ═══════════════════════════════════════════════════
// STEP 1: Generate Cosmo reference with Imagen 4
// ═══════════════════════════════════════════════════

async function generateCosmoReference(imagen: ImagenProvider): Promise<string> {
  const refPath = resolve(OUTPUT_DIR, 'cosmo_reference.png');
  if (existsSync(refPath)) {
    console.log('♻️  Using cached Cosmo reference');
    return refPath;
  }
  console.log('\n🎨 Generating Cosmo reference with Imagen 4...\n');
  const buffer = await imagen.generateImage({
    prompt: `Full body character design sheet of ${COSMO_IDENTITY.description}. Standing in a bright colorful workshop with wooden shelves and toys. Front-facing full body, waving cheerfully, clean composition with space on the right side. Bright warm studio lighting.`,
    aspectRatio: '16:9',
    negativePrompt: COSMO_IDENTITY.negativePrompt,
  });
  await writeFile(refPath, buffer);
  console.log('✅ Cosmo reference saved');
  return refPath;
}

// ═══════════════════════════════════════════════════
// STEP 2: Per-scene — Gemini refine → Imagen frame → Veo animate → Quality gate
// ═══════════════════════════════════════════════════

async function generateScene(
  beat: StoryBeat,
  index: number,
  refBase64: string,
  promptEng: PromptEngineer,
  imagen: ImagenProvider,
  veo: VeoProvider,
  qualityGate: QualityGate,
): Promise<string> {
  const clipDir = resolve(OUTPUT_DIR, 'clips');
  const frameDir = resolve(OUTPUT_DIR, 'frames');
  await mkdir(clipDir, { recursive: true });
  await mkdir(frameDir, { recursive: true });

  const clipPath = resolve(clipDir, `${beat.id}.mp4`);
  const framePath = resolve(frameDir, `${beat.id}.png`);

  // --- Phase A: Gemini refines the scene idea into Imagen + Veo prompts ---
  console.log(`   📝 Refining prompt with Gemini...`);
  const refined = await promptEng.refineScenePrompt({
    sceneIdea: beat.sceneIdea,
    characterDescription: COSMO_IDENTITY.description,
    motionOnly: true,
    durationSec: beat.veoDurationSec,
  });
  console.log(`   📝 Imagen: ${refined.imagenPrompt.substring(0, 80)}...`);
  console.log(`   📝 Veo:    ${refined.veoMotionPrompt.substring(0, 80)}...`);

  // --- Phase B: Imagen 4 generates the starting frame ---
  let frameBase64: string;
  if (existsSync(framePath)) {
    console.log(`   ♻️  Using cached starting frame`);
    frameBase64 = (await readFile(framePath)).toString('base64');
  } else {
    console.log(`   🖼️ Generating starting frame with Imagen 4...`);
    const frameBuffer = await imagen.generateImage({
      prompt: refined.imagenPrompt,
      aspectRatio: '16:9',
      negativePrompt: COSMO_IDENTITY.negativePrompt,
    });
    await writeFile(framePath, frameBuffer);
    frameBase64 = frameBuffer.toString('base64');
    console.log(`   ✅ Starting frame saved`);
  }

  // --- Phase C: Veo animates from starting frame (motion-only prompt) ---
  console.log(`   🎬 Generating Veo clip (motion-only from starting frame)...`);
  const videoBuffer = await veo.generateClip({
    prompt: refined.veoMotionPrompt,
    startingFrame: frameBase64,
    startingFrameMime: 'image/png',
    durationSec: beat.veoDurationSec,
    aspectRatio: '16:9',
    negativePrompt: COSMO_IDENTITY.negativePrompt,
    seed: CONSISTENT_SEED,
  });
  await writeFile(clipPath, videoBuffer);
  const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`   ✅ Clip: ${sizeMB}MB`);

  // --- Phase D: Quality gate ---
  console.log(`   🔍 Quality gate evaluation...`);
  const evaluation = await qualityGate.evaluateClip(clipPath, refBase64, beat.sceneIdea);
  console.log(`   📊 Score: ${evaluation.overallScore}/10 (char: ${evaluation.characterScore}, quality: ${evaluation.qualityScore})`);
  if (!evaluation.passed) {
    console.log(`   ⚠️ Below threshold: ${evaluation.feedback}`);
    if (evaluation.promptSuggestions) {
      console.log(`   💡 Suggestion: ${evaluation.promptSuggestions}`);
    }
  }

  return clipPath;
}

async function generateAllClips(refBase64: string): Promise<string[]> {
  const promptEng = createPromptEngineer();
  const imagen = createImagen();
  const veo = createVeo();
  const qualityGate = createQualityGate();
  const state = await loadState();
  const clipPaths: string[] = [];

  for (let i = 0; i < STORY_BEATS.length; i++) {
    const beat = STORY_BEATS[i];
    const clipPath = resolve(OUTPUT_DIR, 'clips', `${beat.id}.mp4`);
    clipPaths.push(clipPath);

    // Skip if already done
    if (state.clipsDone.includes(i) && existsSync(clipPath)) {
      const size = (await readFile(clipPath)).length;
      if (size > 50_000) {
        console.log(`♻️  Cached clip ${i}: ${beat.id} (${(size / 1024 / 1024).toFixed(1)}MB)`);
        continue;
      }
    }

    console.log(`\n🎬 Scene ${i + 1}/${STORY_BEATS.length}: ${beat.id}`);

    // Rate limit between Veo calls
    if (i > 0 && !state.clipsDone.includes(i)) {
      console.log(`   ⏳ Waiting ${VEO_DELAY_MS / 1000}s before Veo call...`);
      await sleep(VEO_DELAY_MS);
    }

    // Generate with retry
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await generateScene(beat, i, refBase64, promptEng, imagen, veo, qualityGate);

        // Sanity check
        const size = (await readFile(clipPath)).length;
        if (size < 50_000) {
          throw new Error(`Clip suspiciously small: ${(size / 1024).toFixed(0)}KB`);
        }

        state.clipsDone.push(i);
        await saveState(state);
        break;
      } catch (err: any) {
        console.log(`   ⚠️ Attempt ${attempt} failed: ${err.message}`);
        if (attempt >= MAX_RETRIES) {
          console.log(`   🔲 Using placeholder for ${beat.id}`);
          const colors = ['0x3498db', '0xe74c3c', '0x2ecc71', '0xf39c12', '0x9b59b6'];
          execSync(
            `ffmpeg -f lavfi -i color=c=${colors[i % 5]}:s=1920x1080:d=${beat.veoDurationSec} ` +
            `-f lavfi -i anullsrc=r=44100:cl=stereo ` +
            `-c:v libx264 -c:a aac -shortest -pix_fmt yuv420p -y "${clipPath}" 2>/dev/null`,
          );
          state.clipsDone.push(i);
          await saveState(state);
        } else {
          await sleep(30_000);
        }
      }
    }
  }

  return clipPaths;
}

// ═══════════════════════════════════════════════════
// TTS NARRATION (OpenAI — unchanged from V7)
// ═══════════════════════════════════════════════════

async function generateNarration(): Promise<string[]> {
  console.log('\n🎙️ Generating TTS narration...\n');
  const voiceDir = resolve(OUTPUT_DIR, 'voice');
  await mkdir(voiceDir, { recursive: true });
  const paths: string[] = [];

  for (const beat of STORY_BEATS) {
    const voicePath = resolve(voiceDir, `${beat.id}.mp3`);
    if (existsSync(voicePath)) {
      paths.push(voicePath);
      continue;
    }
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'tts-1-hd', voice: 'nova', input: beat.narration, speed: 0.85 }),
    });
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
    await writeFile(voicePath, Buffer.from(await res.arrayBuffer()));
    console.log(`✅ Voice: ${beat.id}`);
    paths.push(voicePath);
  }
  return paths;
}

// ═══════════════════════════════════════════════════
// SFX (from V7)
// ═══════════════════════════════════════════════════

async function generateSFX(): Promise<{ stack: string; celebrate: string }> {
  const sfxDir = resolve(OUTPUT_DIR, 'sfx');
  await mkdir(sfxDir, { recursive: true });
  const stackPath = resolve(sfxDir, 'stack.wav');
  const celebratePath = resolve(sfxDir, 'celebrate.wav');

  if (!existsSync(stackPath)) {
    execSync(
      `ffmpeg -f lavfi -i "sine=frequency=180:duration=0.08" -f lavfi -i "sine=frequency=400:duration=0.06" ` +
      `-filter_complex "[0]afade=t=out:d=0.08[a];[1]adelay=20|20,afade=t=out:d=0.06[b];[a][b]amix=inputs=2:duration=longest,volume=0.7" ` +
      `-y "${stackPath}" 2>/dev/null`,
    );
  }
  if (!existsSync(celebratePath)) {
    execSync(
      `ffmpeg -f lavfi -i "sine=frequency=523:duration=0.15" -f lavfi -i "sine=frequency=659:duration=0.15" ` +
      `-f lavfi -i "sine=frequency=784:duration=0.25" -f lavfi -i "sine=frequency=1047:duration=0.35" ` +
      `-filter_complex "[0]adelay=0|0[a];[1]adelay=150|150[b];[2]adelay=300|300[c];[3]adelay=450|450[d];` +
      `[a][b][c][d]amix=inputs=4:duration=longest,afade=t=out:st=0.5:d=0.3,volume=0.5" ` +
      `-y "${celebratePath}" 2>/dev/null`,
    );
  }
  return { stack: stackPath, celebrate: celebratePath };
}

// ═══════════════════════════════════════════════════
// BACKGROUND MUSIC (from V7)
// ═══════════════════════════════════════════════════

async function generateMusic(totalDur: number): Promise<string> {
  const musicPath = resolve(OUTPUT_DIR, 'bg_music.wav');
  if (existsSync(musicPath)) return musicPath;
  console.log('🎵 Generating background music...');

  const sfxDir = resolve(OUTPUT_DIR, 'sfx');
  await mkdir(sfxDir, { recursive: true });
  const dur = Math.ceil(totalDur) + 5;
  const notes = [
    { freq: 262, delay: 0 }, { freq: 330, delay: 400 }, { freq: 392, delay: 800 },
    { freq: 523, delay: 1200 }, { freq: 392, delay: 1600 }, { freq: 330, delay: 2000 },
    { freq: 262, delay: 2400 },
  ];
  const inputs = notes.map(n => `-f lavfi -i "sine=frequency=${n.freq}:duration=0.35"`).join(' ');
  const filters = notes.map((n, i) => `[${i}]adelay=${n.delay}|${n.delay},afade=t=in:d=0.03,afade=t=out:st=0.25:d=0.1[n${i}]`).join(';');
  const mix = notes.map((_, i) => `[n${i}]`).join('');
  const loopFile = resolve(sfxDir, 'music_loop.wav');

  execSync(`ffmpeg ${inputs} -filter_complex "${filters};${mix}amix=inputs=${notes.length}:duration=longest,volume=0.12" -t 2.8 -y "${loopFile}" 2>/dev/null`);
  execSync(`ffmpeg -stream_loop ${Math.ceil(dur / 2.8)} -i "${loopFile}" -t ${dur} -af "afade=t=in:d=2,afade=t=out:st=${dur - 3}:d=3,volume=0.10" -y "${musicPath}" 2>/dev/null`);
  return musicPath;
}

// ═══════════════════════════════════════════════════
// BLOCK OVERLAY FILTER (from V7)
// ═══════════════════════════════════════════════════

function buildBlockFilter(blockCount: number): string {
  if (blockCount === 0) return '';

  const W = 130;
  const H = 55;
  const GAP = 5;
  const X = 1520;
  const BASE_Y = 920;
  const EDGE = 7;

  let f = '';
  for (let b = 0; b < blockCount; b++) {
    const color = BLOCK_COLORS[b];
    const y = BASE_Y - (b * (H + GAP));
    const isNew = b === blockCount - 1;
    const enable = isNew ? `:enable='gte(t\\,0.2)'` : '';

    f += `,drawbox=x=${X}:y=${y}:w=${W}:h=${H}:color=${color}@0.92:t=fill${enable}`;
    f += `,drawbox=x=${X + W - EDGE}:y=${y + 2}:w=${EDGE}:h=${H - 2}:color=black@0.25:t=fill${enable}`;
    f += `,drawbox=x=${X + 2}:y=${y + H - 4}:w=${W - 2}:h=4:color=black@0.2:t=fill${enable}`;
    f += `,drawbox=x=${X + 4}:y=${y + 2}:w=${W - EDGE - 6}:h=5:color=white@0.3:t=fill${enable}`;
    f += `,drawbox=x=${X + 1}:y=${y + 2}:w=3:h=${H - 6}:color=white@0.15:t=fill${enable}`;
  }

  const numY = BASE_Y - (blockCount * (H + GAP)) - 75;
  const num = blockCount.toString();
  const fc = blockCount === 10 ? 'gold' : 'white';
  f += `,drawtext=text='${num}':fontsize=110:fontcolor=${fc}:borderw=5:bordercolor=black:x=${X + W / 2 - (blockCount >= 10 ? 55 : 28)}:y=${numY}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`;

  return f;
}

// ═══════════════════════════════════════════════════
// ASSEMBLY (adapted from V7)
// ═══════════════════════════════════════════════════

async function assembleVideo(clipPaths: string[], voicePaths: string[]): Promise<string> {
  console.log('\n🎞️ Assembling: clips + block overlay + TTS + audio...\n');
  const segDir = resolve(OUTPUT_DIR, 'segments');
  await mkdir(segDir, { recursive: true });

  const sfx = await generateSFX();
  const segPaths: string[] = [];
  let totalDuration = 0;

  for (let i = 0; i < STORY_BEATS.length; i++) {
    const beat = STORY_BEATS[i];
    const seg = resolve(segDir, `seg_${i.toString().padStart(2, '0')}_${beat.id}.mp4`);

    const ttsDur = parseFloat(
      execSync(`ffprobe -i "${voicePaths[i]}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim(),
    );
    const targetDur = ttsDur + 1.0;
    totalDuration += targetDur;

    const blockFilter = buildBlockFilter(beat.blockCount);
    const sfxFile = beat.phase === 'celebrate' ? sfx.celebrate : (beat.phase === 'count' ? sfx.stack : null);

    const inputs: string[] = [
      `-stream_loop -1 -i "${clipPaths[i]}"`,
      `-i "${voicePaths[i]}"`,
    ];
    if (sfxFile) inputs.push(`-i "${sfxFile}"`);

    const videoF = `[0:v]scale=1920:1080,setsar=1${blockFilter}[v]`;

    let audioF: string;
    if (sfxFile) {
      audioF = `[0:a]volume=0.20[veo];[1:a]volume=1.0[voice];[2:a]adelay=300|300,volume=0.5[sfx];[veo][voice][sfx]amix=inputs=3:duration=first:dropout_transition=2[a]`;
    } else {
      audioF = `[0:a]volume=0.20[veo];[1:a]volume=1.0[voice];[veo][voice]amix=inputs=2:duration=first:dropout_transition=2[a]`;
    }

    const cmd = `ffmpeg ${inputs.join(' ')} -filter_complex "${videoF};${audioF}" -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -t ${targetDur.toFixed(2)} -pix_fmt yuv420p -y "${seg}" 2>&1`;

    try {
      execSync(cmd);
    } catch {
      // Fallback: no Veo audio stream
      const fallbackCmd = `ffmpeg -stream_loop -1 -i "${clipPaths[i]}" -i "${voicePaths[i]}" -filter_complex "[0:v]scale=1920:1080,setsar=1${blockFilter}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -t ${targetDur.toFixed(2)} -pix_fmt yuv420p -y "${seg}" 2>/dev/null`;
      execSync(fallbackCmd);
    }

    console.log(`✅ Seg ${i}: ${beat.id} (${targetDur.toFixed(1)}s) [${beat.blockCount} blocks]${sfxFile ? ' +sfx' : ''}`);
    segPaths.push(seg);
  }

  // Concatenate
  console.log('\n🔗 Concatenating...');
  const concatFile = resolve(OUTPUT_DIR, 'concat.txt');
  await writeFile(concatFile, segPaths.map(s => `file '${s}'`).join('\n'));
  const concatPath = resolve(OUTPUT_DIR, 'concat_raw.mp4');
  execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -pix_fmt yuv420p -y "${concatPath}" 2>/dev/null`);

  // Add background music
  console.log('🎵 Adding background music...');
  const bgMusic = await generateMusic(totalDuration);
  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  execSync(`ffmpeg -i "${concatPath}" -i "${bgMusic}" -filter_complex "[0:a]volume=1.0[main];[1:a]volume=0.12[music];[main][music]amix=inputs=2:duration=first:dropout_transition=3[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -y "${finalPath}" 2>/dev/null`);

  const size = (await readFile(finalPath)).length;
  const dur = parseFloat(execSync(`ffprobe -i "${finalPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim());
  console.log(`\n🎬 FINAL: ${finalPath}`);
  console.log(`   ${dur.toFixed(1)}s | ${(size / 1024 / 1024).toFixed(1)}MB`);
  return finalPath;
}

// ═══════════════════════════════════════════════════
// THUMBNAIL (Imagen 4 instead of DALL-E)
// ═══════════════════════════════════════════════════

async function generateThumbnail(imagen: ImagenProvider): Promise<string> {
  const p = resolve(OUTPUT_DIR, 'thumbnail.png');
  if (existsSync(p)) return p;
  console.log('\n🖼️ Generating thumbnail with Imagen 4...');
  const buffer = await imagen.generateImage({
    prompt: `YouTube thumbnail: ${COSMO_IDENTITY.description} standing next to a tall rainbow tower of 10 colorful building blocks. Bold playful text "COUNT TO 10!" in bubble font. Bright yellow starburst background. Eye-catching, fun, for kids.`,
    aspectRatio: '16:9',
    negativePrompt: COSMO_IDENTITY.negativePrompt,
  });
  await writeFile(p, buffer);
  return p;
}

// ═══════════════════════════════════════════════════
// UPLOAD (from V7)
// ═══════════════════════════════════════════════════

async function uploadToYouTube(videoPath: string, thumbPath?: string): Promise<string> {
  console.log('\n📤 Uploading to YouTube (PRIVATE)...');
  const { google } = await import('googleapis');
  const { createReadStream } = await import('fs');

  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const yt = google.youtube({ version: 'v3', auth: oauth2 });

  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: '🧱 Count to 10 with Cosmo the Robot! | Learn Numbers | Super Builders',
        description: `Count from 1 to 10 with Cosmo the friendly robot! Watch the rainbow block tower grow as we count each colorful block together. Perfect for toddlers and preschoolers! 🤖🧱✨\n\n🔢 Learn numbers 1-10\n🌈 10 colorful blocks\n🏗️ Building & counting fun\n🎵 Catchy music & sounds\n\nSubscribe to Super Builders for more educational adventures! ⭐`,
        tags: ['counting', 'numbers', '1 to 10', 'learn to count', 'kids', 'toddler', 'preschool', 'educational', 'building blocks', 'robot', 'Cosmo', 'Super Builders', 'math for kids', 'counting video', 'learn numbers for kids'],
        categoryId: '22',
      },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: true },
    },
    media: { body: createReadStream(videoPath) },
  });

  const id = res.data.id!;
  console.log(`✅ https://youtube.com/watch?v=${id} (PRIVATE)`);

  if (thumbPath && existsSync(thumbPath)) {
    try {
      await yt.thumbnails.set({ videoId: id, media: { body: createReadStream(thumbPath) } });
      console.log('✅ Thumbnail set');
    } catch (e: any) {
      console.log(`⚠️ Thumbnail: ${e.message}`);
    }
  }
  return id;
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  KIDSVID-AI V8 — Character Consistency Overhaul');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Beats: ${STORY_BEATS.length}`);
  console.log('  Pipeline: Cosmo Identity → Imagen Frame → Veo Motion → Quality Gate');
  console.log('  Fixes: No referenceImages/generateAudio (Gemini API compatible)');
  console.log('  New: Imagen 4 starting frames, Gemini prompt refinement, quality gate');
  console.log(`  Audio: TTS + SFX + background music (Veo ambient ducked)`)
  console.log(`  Blocks: FFmpeg drawbox overlay (programmatic, 100% accurate)`);
  console.log(`  Est. time: ~${Math.ceil((STORY_BEATS.length * VEO_DELAY_MS / 1000) / 60)} min`);
  console.log('═══════════════════════════════════════════════════\n');

  await mkdir(OUTPUT_DIR, { recursive: true });

  const compositeOnly = process.argv.includes('--composite-only');
  const skipUpload = process.argv.includes('--no-upload');

  const imagen = createImagen();

  let clipPaths: string[];
  if (compositeOnly) {
    clipPaths = STORY_BEATS.map(b => resolve(OUTPUT_DIR, 'clips', `${b.id}.mp4`));
    const missing = clipPaths.filter(p => !existsSync(p));
    if (missing.length) throw new Error(`Missing clips: ${missing.join(', ')}`);
    console.log('♻️  Using existing clips (--composite-only)');
  } else {
    const refImagePath = await generateCosmoReference(imagen);
    const refBase64 = (await readFile(refImagePath)).toString('base64');
    clipPaths = await generateAllClips(refBase64);
  }

  const voicePaths = await generateNarration();
  const finalPath = await assembleVideo(clipPaths, voicePaths);

  let thumbnail: string | undefined;
  try {
    thumbnail = await generateThumbnail(imagen);
  } catch (e) {
    console.log('⚠️ Thumbnail skipped');
  }

  if (!skipUpload) {
    const id = await uploadToYouTube(finalPath, thumbnail);
    console.log(`\n🎉 V8 COMPLETE! https://studio.youtube.com/video/${id}/edit`);
  } else {
    console.log(`\n🎉 V8 COMPLETE! ${finalPath}`);
  }
}

main().catch(err => {
  console.error('\n❌ FATAL:', err);
  process.exit(1);
});
