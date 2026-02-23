#!/usr/bin/env npx tsx
/**
 * Pro Video V7 — Per-Scene Veo + Reference Image + Block Compositing
 *
 * Best of all worlds:
 * - Separate Veo clips per scene (higher quality than extend chain)
 * - DALL-E reference image on EVERY Veo call (character consistency)
 * - Veo native audio KEPT as ambient layer (richer sound)
 * - TTS narration mixed on top (clear speech)
 * - FFmpeg drawbox block tower overlay (perfect accuracy)
 * - SFX + background music
 *
 * Combines: V1 pro-video quality + V5 reference consistency + V6 block overlay
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v7');
const VEO_DELAY_MS = 150_000;
const VEO_POLL_INTERVAL = 10_000;
const VEO_POLL_MAX = 60;
const MAX_RETRIES = 2;
const STATE_FILE = resolve(OUTPUT_DIR, 'pipeline_state.json');

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

interface StoryBeat {
  id: string;
  phase: 'intro' | 'count' | 'celebrate' | 'outro';
  blockCount: number;
  /** Rich Veo prompt — describes what Cosmo does, environment, camera, mood */
  veoPrompt: string;
  /** TTS narration */
  narration: string;
  /** Veo clip duration in seconds */
  veoDurationSec: number;
}

// ═══════════════════════════════════════════════════
// BLOCK COLORS
// ═══════════════════════════════════════════════════

const BLOCK_COLORS = [
  '#FF3333', '#FF8833', '#FFDD33', '#33CC33', '#3388FF',
  '#9933FF', '#FF66CC', '#FFFFFF', '#33DDDD', '#FFD700',
];

// ═══════════════════════════════════════════════════
// STORY BEATS
// ═══════════════════════════════════════════════════

const COSMO = `Cosmo, a small cute blue robot with big round brown eyes, stubby arms, a glowing yellow antenna on his round head, and a warm smile`;

const STORY_BEATS: StoryBeat[] = [
  {
    id: 'intro',
    phase: 'intro',
    blockCount: 0,
    veoPrompt: `${COSMO} stands in a bright colorful workshop with wooden shelves and toys. He waves hello at the camera with both hands, bouncing excitedly. He gestures to a clear area on his right where there's an empty wooden platform/table ready for building. Camera slowly zooms in. Bright warm lighting, Pixar-style 3D children's animation. Ambient workshop sounds.`,
    narration: `Hi friends! I'm Cosmo, and today we're going to count to ten by building the tallest tower ever! Are you ready? Let's go!`,
    veoDurationSec: 8,
  },
  {
    id: 'count_1',
    phase: 'count',
    blockCount: 1,
    veoPrompt: `${COSMO} in a bright workshop reaches down and picks up a bright red cube with both hands. He lifts it up proudly showing it to the camera, then places it down on the wooden platform to his right. He looks at the camera and holds up one finger. Close-up shot, warm lighting, Pixar-style 3D children's animation. Satisfying wooden block clacking sound.`,
    narration: `One! One red block. This is where our tower begins!`,
    veoDurationSec: 8,
  },
  {
    id: 'count_2',
    phase: 'count',
    blockCount: 2,
    veoPrompt: `${COSMO} picks up an orange cube and carefully stacks it on top of something to his right, pressing it down gently. He claps his hands together happily and bounces. Medium shot, bright workshop background, Pixar-style 3D children's animation. Block stacking click sound.`,
    narration: `Two! One, two! An orange block on top. Our tower is growing!`,
    veoDurationSec: 8,
  },
  {
    id: 'count_3',
    phase: 'count',
    blockCount: 3,
    veoPrompt: `${COSMO} holds up a yellow cube, showing it to the camera with a big smile. He reaches up slightly higher to stack it, then steps back counting on his fingers — one, two, three. Workshop background, Pixar-style 3D children's animation. Cheerful ambient sounds.`,
    narration: `Three! One, two, three! A yellow block makes three. Can you count with me?`,
    veoDurationSec: 8,
  },
  {
    id: 'count_4',
    phase: 'count',
    blockCount: 4,
    veoPrompt: `${COSMO} concentrates hard, tongue peeking out, carefully placing a green cube up higher. He steadies it, then gives a thumbs up with a relieved smile. Medium shot, warm workshop lighting, Pixar-style 3D children's animation.`,
    narration: `Four! One, two, three, four! Green makes four. We're almost halfway!`,
    veoDurationSec: 8,
  },
  {
    id: 'count_5',
    phase: 'count',
    blockCount: 5,
    veoPrompt: `${COSMO} excitedly places a blue cube and then jumps up and down with his arms raised. Small sparkles appear around him. He does a little victory spin. Wide shot showing the robot celebrating, bright workshop, Pixar-style 3D children's animation. Triumphant little jingle sound.`,
    narration: `Five! One, two, three, four, five! Wow, five blocks! We're halfway there!`,
    veoDurationSec: 8,
  },
  {
    id: 'midpoint',
    phase: 'celebrate',
    blockCount: 5,
    veoPrompt: `${COSMO} does an adorable robot dance — bobbing side to side, pumping his stubby arms, spinning around. Colorful sparkles and small confetti particles float around him. He points at the camera encouragingly. Bright festive lighting, Pixar-style 3D children's animation. Upbeat celebratory music and sounds.`,
    narration: `Great job counting to five! You're doing amazing! Let's keep going and build it even taller!`,
    veoDurationSec: 8,
  },
  {
    id: 'count_6',
    phase: 'count',
    blockCount: 6,
    veoPrompt: `${COSMO} stands on a small wooden step stool to reach higher. He carefully places a purple cube, wobbling slightly on the stool but keeping balance. He looks up admiringly at the growing height. Workshop background, Pixar-style 3D children's animation.`,
    narration: `Six! One, two, three, four, five, six! Purple makes six!`,
    veoDurationSec: 8,
  },
  {
    id: 'count_7',
    phase: 'count',
    blockCount: 7,
    veoPrompt: `${COSMO} stretches on tiptoes on the step stool, reaching way up with a pink cube. His antenna wobbles as he stretches. He places it and looks amazed at how tall it's getting. Camera tilts up slightly. Pixar-style 3D children's animation. Gentle stretching sound effect.`,
    narration: `Seven! One, two, three, four, five, six, seven! Pink makes seven. It's getting so tall!`,
    veoDurationSec: 8,
  },
  {
    id: 'count_8',
    phase: 'count',
    blockCount: 8,
    veoPrompt: `${COSMO} really stretching now, on the very tips of his toes on the stool, reaching up with a white cube. His eyes are wide looking up at the towering height. He manages to place it and holds up both hands showing eight fingers. Slight low angle camera. Pixar-style 3D children's animation.`,
    narration: `Eight! Count with me — one, two, three, four, five, six, seven, eight! Almost there!`,
    veoDurationSec: 8,
  },
  {
    id: 'count_9',
    phase: 'count',
    blockCount: 9,
    veoPrompt: `${COSMO} very nervously and carefully reaches up with a cyan/turquoise cube. Something wobbles and he gasps, quickly steadying it with a panicked expression. Then he sighs with huge relief, wiping his forehead. Tense then relieved mood. Pixar-style 3D children's animation. Wobble sound effect then relief sigh.`,
    narration: `Nine! One, two, three, four, five, six, seven, eight, nine! Careful! Just one more!`,
    veoDurationSec: 8,
  },
  {
    id: 'count_10',
    phase: 'count',
    blockCount: 10,
    veoPrompt: `${COSMO} holds up a special shiny golden cube that glows and sparkles. He reaches up dramatically in slow motion to place the final piece. The moment he places it, golden light bursts out. He throws both arms up in an epic victory pose, antenna glowing bright. Dramatic cinematic lighting, then explosion of color. Pixar-style 3D children's animation. Epic triumphant sound.`,
    narration: `TEN! We did it! One, two, three, four, five, six, seven, eight, nine, TEN! The tallest tower EVER!`,
    veoDurationSec: 8,
  },
  {
    id: 'finale',
    phase: 'outro',
    blockCount: 10,
    veoPrompt: `${COSMO} dances joyfully next to a colorful tower, confetti and sparkles raining down everywhere. He waves goodbye at the camera with both hands, blows a kiss, then takes a cute little bow. The workshop is bathed in warm golden light. Pixar-style 3D children's animation. Joyful celebratory music with tinkling sounds.`,
    narration: `You counted all the way to ten! You're a SUPER builder! Don't forget to subscribe for more fun! See you next time, friends! Bye bye!`,
    veoDurationSec: 8,
  },
];

// ═══════════════════════════════════════════════════
// RESUME STATE
// ═══════════════════════════════════════════════════

interface PipelineState {
  veoCompleted: number[];
  startedAt: string;
  updatedAt: string;
}

async function loadState(): Promise<PipelineState> {
  if (existsSync(STATE_FILE)) {
    const s = JSON.parse(await readFile(STATE_FILE, 'utf-8'));
    console.log(`♻️  Resume: ${s.veoCompleted.length}/${STORY_BEATS.length} Veo clips done`);
    return s;
  }
  return { veoCompleted: [], startedAt: new Date().toISOString(), updatedAt: '' };
}

async function saveState(state: PipelineState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

// ═══════════════════════════════════════════════════
// COSMO REFERENCE IMAGE (DALL-E)
// ═══════════════════════════════════════════════════

async function generateCosmoReference(): Promise<string> {
  const refPath = resolve(OUTPUT_DIR, 'cosmo_reference.png');
  if (existsSync(refPath)) {
    console.log('♻️  Using cached Cosmo reference');
    return refPath;
  }
  console.log('\n🎨 Generating Cosmo reference image...\n');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `Full body character design sheet of Cosmo: a small, cute, friendly blue robot with big round brown eyes, stubby little arms, short legs, and a glowing yellow antenna on top of his round head. He has a yellow circular emblem on his chest. Cheerful expression, waving. Standing in a bright colorful workshop with wooden shelves and toys. Pixar-style 3D rendered, warm studio lighting. Front-facing full body, clean composition with space on the right side.`,
      n: 1, size: '1792x1024', quality: 'hd', response_format: 'b64_json',
    }),
  });
  const data = await res.json();
  if (!data.data?.[0]?.b64_json) throw new Error(`DALL-E failed`);
  await writeFile(refPath, Buffer.from(data.data[0].b64_json, 'base64'));
  console.log('✅ Cosmo reference saved');
  return refPath;
}

// ═══════════════════════════════════════════════════
// VEO: Per-scene generation with reference image
// ═══════════════════════════════════════════════════

async function generateVeoClip(
  beat: StoryBeat, index: number, refBase64: string, clipPath: string
): Promise<void> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  console.log(`\n🎬 Veo ${index + 1}/${STORY_BEATS.length}: ${beat.id}`);
  console.log(`   ${beat.veoPrompt.substring(0, 90)}...`);

  let operation = await client.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt: beat.veoPrompt,
    referenceImages: [{
      image: { imageBytes: refBase64, mimeType: 'image/png' },
      operation: 'SUBJECT_REFERENCE',
    }],
    config: {
      aspectRatio: '16:9',
      durationSeconds: beat.veoDurationSec,
      personGeneration: 'allow_all',
    },
  } as any);

  let attempts = 0;
  while (!operation.done) {
    if (attempts++ >= VEO_POLL_MAX) throw new Error('Veo timed out');
    await sleep(VEO_POLL_INTERVAL);
    operation = await client.operations.getVideosOperation({ operation });
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) throw new Error('No video returned');
  const uri = typeof video === 'string' ? video : (video as any).uri;

  const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await writeFile(clipPath, Buffer.from(await res.arrayBuffer()));

  const size = (await readFile(clipPath)).length;
  console.log(`   ✅ ${(size / 1024 / 1024).toFixed(1)}MB`);
}

async function generateAllVeoClips(refImagePath: string): Promise<string[]> {
  const clipDir = resolve(OUTPUT_DIR, 'clips');
  await mkdir(clipDir, { recursive: true });

  const refBase64 = (await readFile(refImagePath)).toString('base64');
  const state = await loadState();
  const clipPaths: string[] = [];

  for (let i = 0; i < STORY_BEATS.length; i++) {
    const beat = STORY_BEATS[i];
    const clipPath = resolve(clipDir, `${beat.id}.mp4`);
    clipPaths.push(clipPath);

    // Skip if already completed
    if (state.veoCompleted.includes(i) && existsSync(clipPath)) {
      const size = (await readFile(clipPath)).length;
      if (size > 50_000) {
        console.log(`♻️  Cached Veo clip ${i}: ${beat.id} (${(size / 1024 / 1024).toFixed(1)}MB)`);
        continue;
      }
    }

    // Rate limit delay
    if (i > 0) {
      console.log(`\n⏳ Waiting ${VEO_DELAY_MS / 1000}s before Veo call...`);
      await sleep(VEO_DELAY_MS);
    }

    // Generate with retry
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await generateVeoClip(beat, i, refBase64, clipPath);

        // Quick sanity check — reject tiny files (likely black/failed)
        const size = (await readFile(clipPath)).length;
        if (size < 50_000) {
          throw new Error(`Clip suspiciously small: ${(size / 1024).toFixed(0)}KB`);
        }

        state.veoCompleted.push(i);
        await saveState(state);
        break;
      } catch (err: any) {
        console.log(`   ⚠️ Attempt ${attempt} failed: ${err.message}`);
        if (attempt >= MAX_RETRIES) {
          // Generate colored placeholder
          console.log(`   🔲 Using placeholder for ${beat.id}`);
          const colors = ['0x3498db', '0xe74c3c', '0x2ecc71', '0xf39c12', '0x9b59b6'];
          execSync(`ffmpeg -f lavfi -i color=c=${colors[i % 5]}:s=1920x1080:d=${beat.veoDurationSec} -f lavfi -i anullsrc=r=44100:cl=stereo -c:v libx264 -c:a aac -shortest -pix_fmt yuv420p -y "${clipPath}" 2>/dev/null`);
          state.veoCompleted.push(i);
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
// TTS NARRATION
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
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
// SFX
// ═══════════════════════════════════════════════════

async function generateSFX(): Promise<{ stack: string; celebrate: string }> {
  const sfxDir = resolve(OUTPUT_DIR, 'sfx');
  await mkdir(sfxDir, { recursive: true });
  const stackPath = resolve(sfxDir, 'stack.wav');
  const celebratePath = resolve(sfxDir, 'celebrate.wav');

  if (!existsSync(stackPath)) {
    // Satisfying wooden block clack
    execSync(`ffmpeg -f lavfi -i "sine=frequency=180:duration=0.08" -f lavfi -i "sine=frequency=400:duration=0.06" -filter_complex "[0]afade=t=out:d=0.08[a];[1]adelay=20|20,afade=t=out:d=0.06[b];[a][b]amix=inputs=2:duration=longest,volume=0.7" -y "${stackPath}" 2>/dev/null`);
  }
  if (!existsSync(celebratePath)) {
    execSync(`ffmpeg -f lavfi -i "sine=frequency=523:duration=0.15" -f lavfi -i "sine=frequency=659:duration=0.15" -f lavfi -i "sine=frequency=784:duration=0.25" -f lavfi -i "sine=frequency=1047:duration=0.35" -filter_complex "[0]adelay=0|0[a];[1]adelay=150|150[b];[2]adelay=300|300[c];[3]adelay=450|450[d];[a][b][c][d]amix=inputs=4:duration=longest,afade=t=out:st=0.5:d=0.3,volume=0.5" -y "${celebratePath}" 2>/dev/null`);
  }
  return { stack: stackPath, celebrate: celebratePath };
}

// ═══════════════════════════════════════════════════
// BACKGROUND MUSIC
// ═══════════════════════════════════════════════════

async function generateMusic(totalDur: number): Promise<string> {
  const musicPath = resolve(OUTPUT_DIR, 'bg_music.wav');
  if (existsSync(musicPath)) return musicPath;
  console.log('🎵 Generating background music...');

  const sfxDir = resolve(OUTPUT_DIR, 'sfx');
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
// BLOCK OVERLAY FILTER BUILDER
// ═══════════════════════════════════════════════════

function buildBlockFilter(blockCount: number, segDuration: number): string {
  if (blockCount === 0) return '';

  const W = 130;   // block width
  const H = 55;    // block height
  const GAP = 5;
  const X = 1520;  // right side of 1920px
  const BASE_Y = 920; // near bottom
  const EDGE = 7;

  let f = '';
  for (let b = 0; b < blockCount; b++) {
    const color = BLOCK_COLORS[b];
    const y = BASE_Y - (b * (H + GAP));
    const isNew = b === blockCount - 1;
    // New block fades in from t=0.2 to t=0.6
    const enable = isNew ? `:enable='gte(t\\,0.2)'` : '';

    // Main body
    f += `,drawbox=x=${X}:y=${y}:w=${W}:h=${H}:color=${color}@0.92:t=fill${enable}`;
    // Right shadow
    f += `,drawbox=x=${X + W - EDGE}:y=${y + 2}:w=${EDGE}:h=${H - 2}:color=black@0.25:t=fill${enable}`;
    // Bottom shadow
    f += `,drawbox=x=${X + 2}:y=${y + H - 4}:w=${W - 2}:h=4:color=black@0.2:t=fill${enable}`;
    // Top highlight
    f += `,drawbox=x=${X + 4}:y=${y + 2}:w=${W - EDGE - 6}:h=5:color=white@0.3:t=fill${enable}`;
    // Left highlight
    f += `,drawbox=x=${X + 1}:y=${y + 2}:w=3:h=${H - 6}:color=white@0.15:t=fill${enable}`;
  }

  // Number above tower
  const numY = BASE_Y - (blockCount * (H + GAP)) - 75;
  const num = blockCount.toString();
  const fc = blockCount === 10 ? 'gold' : 'white';
  f += `,drawtext=text='${num}':fontsize=110:fontcolor=${fc}:borderw=5:bordercolor=black:x=${X + W / 2 - (blockCount >= 10 ? 55 : 28)}:y=${numY}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`;

  return f;
}

// ═══════════════════════════════════════════════════
// ASSEMBLY
// ═══════════════════════════════════════════════════

async function assembleVideo(clipPaths: string[], voicePaths: string[]): Promise<string> {
  console.log('\n🎞️ Assembling: Veo clips + block overlay + TTS + Veo audio...\n');
  const segDir = resolve(OUTPUT_DIR, 'segments');
  await mkdir(segDir, { recursive: true });

  const sfx = await generateSFX();
  const segPaths: string[] = [];
  let totalDuration = 0;

  for (let i = 0; i < STORY_BEATS.length; i++) {
    const beat = STORY_BEATS[i];
    const seg = resolve(segDir, `seg_${i.toString().padStart(2, '0')}_${beat.id}.mp4`);

    // TTS duration determines segment length
    const ttsDur = parseFloat(
      execSync(`ffprobe -i "${voicePaths[i]}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
    );
    const targetDur = ttsDur + 1.0; // padding for pacing
    totalDuration += targetDur;

    const blockFilter = buildBlockFilter(beat.blockCount, targetDur);
    const sfxFile = beat.phase === 'celebrate' ? sfx.celebrate : (beat.phase === 'count' ? sfx.stack : null);

    // Strategy: loop Veo clip to fill TTS duration
    // Keep Veo audio as ambient layer (ducked) + TTS as main voice + optional SFX
    const inputs: string[] = [
      `-stream_loop -1 -i "${clipPaths[i]}"`,  // 0: Veo video+audio
      `-i "${voicePaths[i]}"`,                   // 1: TTS
    ];
    if (sfxFile) inputs.push(`-i "${sfxFile}"`);  // 2: SFX (optional)

    const videoF = `[0:v]scale=1920:1080,setsar=1${blockFilter}[v]`;

    let audioF: string;
    if (sfxFile) {
      // Veo audio ducked to 20% + TTS at 100% + SFX
      audioF = `[0:a]volume=0.20[veo];[1:a]volume=1.0[voice];[2:a]adelay=300|300,volume=0.5[sfx];[veo][voice][sfx]amix=inputs=3:duration=first:dropout_transition=2[a]`;
    } else {
      // Veo audio ducked + TTS
      audioF = `[0:a]volume=0.20[veo];[1:a]volume=1.0[voice];[veo][voice]amix=inputs=2:duration=first:dropout_transition=2[a]`;
    }

    const cmd = `ffmpeg ${inputs.join(' ')} -filter_complex "${videoF};${audioF}" -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -t ${targetDur.toFixed(2)} -pix_fmt yuv420p -y "${seg}" 2>&1`;

    try {
      execSync(cmd);
    } catch (err: any) {
      // Fallback: no Veo audio (clip might not have audio stream)
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
// THUMBNAIL
// ═══════════════════════════════════════════════════

async function generateThumbnail(): Promise<string> {
  const p = resolve(OUTPUT_DIR, 'thumbnail.png');
  if (existsSync(p)) return p;
  console.log('\n🖼️ Generating thumbnail...');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `YouTube thumbnail: cute blue robot Cosmo with big brown eyes next to a tall rainbow tower of 10 colorful building blocks. Bold text "COUNT TO 10!" in playful bubble font. Bright yellow starburst background. Pixar-style 3D, eye-catching, fun, for kids.`,
      n: 1, size: '1792x1024', quality: 'hd', response_format: 'b64_json',
    }),
  });
  const data = await res.json();
  if (!data.data?.[0]?.b64_json) throw new Error('Thumbnail failed');
  await writeFile(p, Buffer.from(data.data[0].b64_json, 'base64'));
  return p;
}

// ═══════════════════════════════════════════════════
// UPLOAD
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
    } catch (e: any) { console.log(`⚠️ Thumbnail: ${e.message}`); }
  }
  return id;
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  KIDSVID-AI V7 — Per-Scene Veo + Block Compositing');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Beats: ${STORY_BEATS.length}`);
  console.log(`  Veo: ${STORY_BEATS.length} separate clips × 8s with reference image`);
  console.log(`  Audio: Veo ambient (ducked) + TTS + SFX + background music`);
  console.log(`  Blocks: FFmpeg drawbox overlay (programmatic, 100% accurate)`);
  console.log(`  Est. time: ~${Math.ceil((STORY_BEATS.length * VEO_DELAY_MS / 1000) / 60)} min`);
  console.log('═══════════════════════════════════════════════════\n');

  await mkdir(OUTPUT_DIR, { recursive: true });

  const compositeOnly = process.argv.includes('--composite-only');
  const skipUpload = process.argv.includes('--no-upload');

  let clipPaths: string[];
  if (compositeOnly) {
    clipPaths = STORY_BEATS.map(b => resolve(OUTPUT_DIR, 'clips', `${b.id}.mp4`));
    const missing = clipPaths.filter(p => !existsSync(p));
    if (missing.length) throw new Error(`Missing clips: ${missing.join(', ')}`);
    console.log('♻️  Using existing Veo clips (--composite-only)');
  } else {
    const refImage = await generateCosmoReference();
    clipPaths = await generateAllVeoClips(refImage);
  }

  const voicePaths = await generateNarration();
  const finalPath = await assembleVideo(clipPaths, voicePaths);

  let thumbnail: string | undefined;
  try { thumbnail = await generateThumbnail(); } catch (e) { console.log('⚠️ Thumbnail skipped'); }

  if (!skipUpload) {
    const id = await uploadToYouTube(finalPath, thumbnail);
    console.log(`\n🎉 V7 COMPLETE! https://studio.youtube.com/video/${id}/edit`);
  } else {
    console.log(`\n🎉 V7 COMPLETE! ${finalPath}`);
  }
}

main().catch(err => { console.error('\n❌ FATAL:', err); process.exit(1); });
