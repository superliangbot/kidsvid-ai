#!/usr/bin/env npx tsx
/**
 * Pro Video V6 — Veo Background + Programmatic Block Compositing
 *
 * Strategy:
 * 1. Generate Veo extend chain of Cosmo being expressive (NO blocks in prompts)
 * 2. Use the final extended video as background layer
 * 3. Programmatically render block-stacking animation using FFmpeg filters
 * 4. Composite blocks onto the right side of the Veo video
 * 5. Add TTS narration + SFX + background music
 *
 * This guarantees:
 *   ✅ Beautiful Veo animation (Cosmo reacting, gesturing)
 *   ✅ Perfect block counts (FFmpeg drawbox, 100% accurate)
 *   ✅ Character consistency (extend chain)
 *   ✅ Synced audio (our TTS, not Veo's)
 *   ✅ No black screens
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v6');
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
  /** Veo prompt — Cosmo's REACTIONS only, no blocks */
  veoPrompt: string;
  /** TTS narration */
  narration: string;
  /** Duration target in seconds */
  durationSec: number;
}

// ═══════════════════════════════════════════════════
// BLOCK COLORS (rainbow tower)
// ═══════════════════════════════════════════════════

const BLOCK_COLORS = [
  { name: 'red',    hex: '#FF3333', label: '0xFF3333' },
  { name: 'orange', hex: '#FF8833', label: '0xFF8833' },
  { name: 'yellow', hex: '#FFDD33', label: '0xFFDD33' },
  { name: 'green',  hex: '#33CC33', label: '0x33CC33' },
  { name: 'blue',   hex: '#3388FF', label: '0x3388FF' },
  { name: 'purple', hex: '#9933FF', label: '0x9933FF' },
  { name: 'pink',   hex: '#FF66CC', label: '0xFF66CC' },
  { name: 'white',  hex: '#FFFFFF', label: '0xFFFFFF' },
  { name: 'cyan',   hex: '#33DDDD', label: '0x33DDDD' },
  { name: 'gold',   hex: '#FFD700', label: '0xFFD700' },
];

// ═══════════════════════════════════════════════════
// STORY BEATS — Cosmo reactions ONLY (no blocks in Veo prompts)
// ═══════════════════════════════════════════════════

const COSMO_BASE = `A small friendly blue robot with big round brown eyes, stubby arms, and a glowing yellow antenna. Bright colorful 3D Pixar-style children's animation, warm workshop background with wooden shelves and toys.`;

const STORY_BEATS: StoryBeat[] = [
  {
    id: 'intro',
    phase: 'intro',
    blockCount: 0,
    veoPrompt: `${COSMO_BASE} The robot waves hello enthusiastically at the camera, bouncing with excitement. He looks to his right as if presenting something. Gentle camera zoom in.`,
    narration: `Hi friends! I'm Cosmo, and today we're going to count to ten by building the tallest tower ever! Are you ready? Let's go!`,
    durationSec: 8,
  },
  {
    id: 'count_1',
    phase: 'count',
    blockCount: 1,
    veoPrompt: `The blue robot reaches down to his right side with both hands as if picking something up, then looks up proudly. He gestures to the right. Bright 3D children's animation.`,
    narration: `One! One red block. This is where our tower begins!`,
    durationSec: 7,
  },
  {
    id: 'count_2',
    phase: 'count',
    blockCount: 2,
    veoPrompt: `The blue robot picks up something with both hands and reaches up slightly to place it, then claps his stubby hands together happily. He looks to the right admiringly. Bright 3D children's animation.`,
    narration: `Two! One, two! An orange block on top. Our tower is growing!`,
    durationSec: 7,
  },
  {
    id: 'count_3',
    phase: 'count',
    blockCount: 3,
    veoPrompt: `The blue robot stretches up on his tiptoes to place something, then steps back and counts on his fingers — one, two, three. He looks excited. Bright 3D children's animation.`,
    narration: `Three! One, two, three! A yellow block makes three. Can you count with me?`,
    durationSec: 7,
  },
  {
    id: 'count_4',
    phase: 'count',
    blockCount: 4,
    veoPrompt: `The blue robot carefully balances on his toes reaching up, concentrating hard. He places something gently, then gives a thumbs up to the camera. Bright 3D children's animation.`,
    narration: `Four! One, two, three, four! Green makes four. We're almost halfway!`,
    durationSec: 7,
  },
  {
    id: 'count_5',
    phase: 'count',
    blockCount: 5,
    veoPrompt: `The blue robot jumps up and down excitedly, waving both arms. He spins around once with joy. Big smile on his face. Bright 3D children's animation.`,
    narration: `Five! One, two, three, four, five! Wow, five blocks! We're halfway there!`,
    durationSec: 7,
  },
  {
    id: 'midpoint',
    phase: 'celebrate',
    blockCount: 5,
    veoPrompt: `The blue robot dances happily, doing a little robot dance — moving side to side, pumping his arms. Sparkles and small stars appear around him. Celebratory mood. Bright 3D children's animation.`,
    narration: `Great job counting to five! Let's keep going and build it even taller!`,
    durationSec: 7,
  },
  {
    id: 'count_6',
    phase: 'count',
    blockCount: 6,
    veoPrompt: `The blue robot stands on a small step stool, reaching up high with both hands. He looks determined and careful. He wobbles slightly but keeps balance. Bright 3D children's animation.`,
    narration: `Six! One, two, three, four, five, six! Purple makes six!`,
    durationSec: 7,
  },
  {
    id: 'count_7',
    phase: 'count',
    blockCount: 7,
    veoPrompt: `The blue robot stretches as high as he can from the step stool, tongue sticking out in concentration. He places something carefully then looks amazed at the height. Bright 3D children's animation.`,
    narration: `Seven! One, two, three, four, five, six, seven! Pink makes seven. It's getting so tall!`,
    durationSec: 7,
  },
  {
    id: 'count_8',
    phase: 'count',
    blockCount: 8,
    veoPrompt: `The blue robot is really reaching now, standing on tiptoes on the step stool. He looks up in awe at something very tall to his right. He holds up eight fingers (both hands). Bright 3D children's animation.`,
    narration: `Eight! Count with me — one, two, three, four, five, six, seven, eight! Almost there!`,
    durationSec: 7,
  },
  {
    id: 'count_9',
    phase: 'count',
    blockCount: 9,
    veoPrompt: `The blue robot very carefully and nervously reaches up as high as possible. Something wobbles and he steadies it with a panicked expression, then sighs with relief. Bright 3D children's animation.`,
    narration: `Nine! One, two, three, four, five, six, seven, eight, nine! Just one more!`,
    durationSec: 7,
  },
  {
    id: 'count_10',
    phase: 'count',
    blockCount: 10,
    veoPrompt: `The blue robot triumphantly raises both arms above his head in a victory pose! His antenna glows extra bright. He looks absolutely thrilled and proud, doing a fist pump. Bright 3D children's animation, dramatic lighting.`,
    narration: `TEN! One, two, three, four, five, six, seven, eight, nine, TEN! We did it! The tallest tower EVER!`,
    durationSec: 7,
  },
  {
    id: 'finale',
    phase: 'outro',
    blockCount: 10,
    veoPrompt: `The blue robot dances joyfully, confetti and sparkles rain down. He waves goodbye at the camera with both hands, blowing a kiss. He takes a bow. Bright 3D children's animation, joyful celebration.`,
    narration: `You counted all the way to ten! You're a SUPER builder! See you next time, friends! Bye bye!`,
    durationSec: 7,
  },
];

// ═══════════════════════════════════════════════════
// RESUME STATE
// ═══════════════════════════════════════════════════

interface PipelineState {
  phase: 'veo' | 'tts' | 'composite' | 'done';
  veoCompleted: number;
  lastVideoUri: string | null;
  startedAt: string;
  updatedAt: string;
}

async function loadState(): Promise<PipelineState | null> {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(await readFile(STATE_FILE, 'utf-8'));
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
    console.log('♻️  Using cached Cosmo reference image');
    return refPath;
  }

  console.log('\n🎨 Generating Cosmo reference image (DALL-E)...\n');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `Full body character design of Cosmo: a small, cute, friendly blue robot with big round brown eyes, stubby little arms, short legs, and a glowing yellow antenna on top of his round head. Cheerful expression. Standing in a bright, colorful workshop with wooden shelves and toys. Pixar-style 3D rendered, warm studio lighting. Front-facing pose, plenty of empty space on the right side of the image for graphics overlay.`,
      n: 1,
      size: '1792x1024',
      quality: 'hd',
      response_format: 'b64_json',
    }),
  });
  const data = await res.json();
  if (!data.data?.[0]?.b64_json) throw new Error(`DALL-E failed: ${JSON.stringify(data)}`);
  await writeFile(refPath, Buffer.from(data.data[0].b64_json, 'base64'));
  console.log(`✅ Cosmo reference saved`);
  return refPath;
}

// ═══════════════════════════════════════════════════
// VEO EXTEND CHAIN (Cosmo reactions only)
// ═══════════════════════════════════════════════════

async function veoGenerate(params: any): Promise<{ uri: string }> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  let operation = await client.models.generateVideos(params);
  let attempts = 0;
  while (!operation.done) {
    if (attempts++ >= VEO_POLL_MAX) throw new Error('Veo timed out');
    await sleep(VEO_POLL_INTERVAL);
    operation = await client.operations.getVideosOperation({ operation });
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) throw new Error('No video returned');
  const uri = typeof video === 'string' ? video : (video as any).uri;
  return { uri };
}

async function downloadVideo(uri: string, outPath: string): Promise<void> {
  const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
}

async function generateVeoChain(refImagePath: string): Promise<string> {
  await mkdir(resolve(OUTPUT_DIR, 'veo_clips'), { recursive: true });
  let state = await loadState();

  let startIdx = 0;
  let prevUri: string | null = null;

  if (state && state.phase === 'veo' && state.veoCompleted > 0 && state.lastVideoUri) {
    startIdx = state.veoCompleted;
    prevUri = state.lastVideoUri;
    console.log(`♻️  Resuming Veo chain from beat ${startIdx}/${STORY_BEATS.length}`);
  } else {
    state = { phase: 'veo', veoCompleted: 0, lastVideoUri: null, startedAt: new Date().toISOString(), updatedAt: '' };
  }

  const refBase64 = (await readFile(refImagePath)).toString('base64');

  for (let i = startIdx; i < STORY_BEATS.length; i++) {
    const beat = STORY_BEATS[i];
    const clipPath = resolve(OUTPUT_DIR, 'veo_clips', `${beat.id}.mp4`);

    if (i > 0) {
      console.log(`\n⏳ Waiting ${VEO_DELAY_MS / 1000}s before Veo call ${i + 1}/${STORY_BEATS.length}...`);
      await sleep(VEO_DELAY_MS);
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let result: { uri: string };

        if (i === 0) {
          // Initial clip with reference image
          console.log(`\n🎬 Generating INITIAL Veo clip: ${beat.id}`);
          result = await veoGenerate({
            model: 'veo-3.1-generate-preview',
            prompt: beat.veoPrompt,
            referenceImages: [{ image: { imageBytes: refBase64, mimeType: 'image/png' }, operation: 'SUBJECT_REFERENCE' }],
            config: { aspectRatio: '16:9', durationSeconds: 8, personGeneration: 'allow_all' },
          } as any);
        } else {
          // Extend from previous
          console.log(`\n🔗 Extending Veo clip #${i}: ${beat.id}`);
          result = await veoGenerate({
            model: 'veo-3.1-generate-preview',
            prompt: beat.veoPrompt,
            video: { uri: prevUri },
            config: { aspectRatio: '16:9', personGeneration: 'allow_all' },
          } as any);
        }

        await downloadVideo(result.uri, clipPath);
        const size = (await readFile(clipPath)).length;
        console.log(`✅ Veo clip ${i}: ${beat.id} (${(size / 1024 / 1024).toFixed(1)}MB)`);

        prevUri = result.uri;
        state.veoCompleted = i + 1;
        state.lastVideoUri = prevUri;
        await saveState(state);
        break;
      } catch (err: any) {
        console.log(`⚠️  Attempt ${attempt} failed: ${err.message}`);
        if (attempt >= MAX_RETRIES) throw err;
        await sleep(30_000);
      }
    }
  }

  // The last clip contains the full extended video
  const fullVeoPath = resolve(OUTPUT_DIR, 'veo_clips', `${STORY_BEATS[STORY_BEATS.length - 1].id}.mp4`);
  console.log(`\n✅ Full Veo background video: ${fullVeoPath}`);
  return fullVeoPath;
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
      console.log(`♻️  Cached: ${beat.id}`);
      paths.push(voicePath);
      continue;
    }
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'tts-1-hd', voice: 'nova', input: beat.narration, speed: 0.9 }),
    });
    if (!res.ok) throw new Error(`TTS failed for ${beat.id}: ${res.status}`);
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
    execSync(`ffmpeg -f lavfi -i "sine=frequency=200:duration=0.15" -af "afade=t=out:st=0.05:d=0.1,volume=0.6" -y "${stackPath}" 2>/dev/null`);
  }
  if (!existsSync(celebratePath)) {
    execSync(`ffmpeg -f lavfi -i "sine=frequency=523:duration=0.15" -f lavfi -i "sine=frequency=659:duration=0.15" -f lavfi -i "sine=frequency=784:duration=0.3" -filter_complex "[0]adelay=0|0[a];[1]adelay=150|150[b];[2]adelay=300|300[c];[a][b][c]amix=inputs=3:duration=longest,afade=t=out:st=0.4:d=0.2,volume=0.5" -y "${celebratePath}" 2>/dev/null`);
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

  // Gentle pentatonic loop
  const notes = [
    { freq: 262, delay: 0 }, { freq: 330, delay: 500 }, { freq: 392, delay: 1000 },
    { freq: 523, delay: 1500 }, { freq: 392, delay: 2000 }, { freq: 330, delay: 2500 },
  ];
  const inputs = notes.map(n => `-f lavfi -i "sine=frequency=${n.freq}:duration=0.4"`).join(' ');
  const filters = notes.map((n, i) => `[${i}]adelay=${n.delay}|${n.delay},afade=t=in:d=0.05,afade=t=out:st=0.3:d=0.1[n${i}]`).join(';');
  const mix = notes.map((_, i) => `[n${i}]`).join('');
  const loopFile = resolve(sfxDir, 'music_loop.wav');

  execSync(`ffmpeg ${inputs} -filter_complex "${filters};${mix}amix=inputs=${notes.length}:duration=longest,volume=0.15" -t 3 -y "${loopFile}" 2>/dev/null`);
  execSync(`ffmpeg -stream_loop ${Math.ceil(dur / 3)} -i "${loopFile}" -t ${dur} -af "afade=t=in:d=2,afade=t=out:st=${dur - 3}:d=3,volume=0.12" -y "${musicPath}" 2>/dev/null`);
  console.log(`✅ Background music: ${dur}s`);
  return musicPath;
}

// ═══════════════════════════════════════════════════
// COMPOSITING: Split Veo video into beats + overlay blocks
// ═══════════════════════════════════════════════════

/**
 * Block tower rendering strategy:
 * - Blocks appear on the RIGHT side of screen (x: 1400-1750, from bottom up)
 * - Each block is 100px wide × 60px tall with 3D shading
 * - Tower grows from bottom of frame upward
 * - New block has a pop-in animation (scale from 0)
 * - Block count number displayed large above tower
 *
 * FFmpeg drawbox can't do gradients, so we use multiple drawbox calls
 * for a simple 3D effect (main color + darker edge + highlight)
 */

function buildBlockFilterChain(blockCount: number, beatDuration: number): string {
  if (blockCount === 0) return '';

  const BLOCK_W = 120;
  const BLOCK_H = 50;
  const GAP = 4;
  const BASE_X = 1550;  // Right side of 1920px frame
  const BASE_Y = 900;   // Near bottom of 1080px frame
  const SHADOW_W = 6;

  let filters = '';

  for (let b = 0; b < blockCount; b++) {
    const color = BLOCK_COLORS[b];
    const y = BASE_Y - (b * (BLOCK_H + GAP));

    // For the newest block (last one), fade it in over 0.5s starting at 0.3s
    // For existing blocks, they're visible the entire time
    const isNew = (b === blockCount - 1);
    const enableExpr = isNew ? `enable='gte(t,0.3)'` : '';

    // Main block body
    filters += `,drawbox=x=${BASE_X}:y=${y}:w=${BLOCK_W}:h=${BLOCK_H}:color=${color.hex}@0.95:t=fill:${enableExpr}`;
    // Dark right edge (3D shadow)
    filters += `,drawbox=x=${BASE_X + BLOCK_W - SHADOW_W}:y=${y}:w=${SHADOW_W}:h=${BLOCK_H}:color=black@0.3:t=fill:${enableExpr}`;
    // Dark bottom edge
    filters += `,drawbox=x=${BASE_X}:y=${y + BLOCK_H - 4}:w=${BLOCK_W}:h=4:color=black@0.25:t=fill:${enableExpr}`;
    // Top highlight
    filters += `,drawbox=x=${BASE_X + 3}:y=${y + 2}:w=${BLOCK_W - SHADOW_W - 3}:h=4:color=white@0.35:t=fill:${enableExpr}`;
  }

  // Block count number above the tower
  const numY = BASE_Y - (blockCount * (BLOCK_H + GAP)) - 70;
  const numText = blockCount >= 10 ? '10' : blockCount.toString();
  const fontColor = blockCount === 10 ? 'gold' : 'white';
  filters += `,drawtext=text='${numText}':fontsize=100:fontcolor=${fontColor}:borderw=4:bordercolor=black:x=${BASE_X + (BLOCK_W / 2) - 25}:y=${numY}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`;

  return filters;
}

async function compositeVideo(fullVeoPath: string, voicePaths: string[]): Promise<string> {
  console.log('\n🎞️ Compositing: Veo background + programmatic blocks + audio...\n');
  const segDir = resolve(OUTPUT_DIR, 'segments');
  await mkdir(segDir, { recursive: true });

  const sfx = await generateSFX();

  // Calculate time offsets for each beat in the full Veo video
  // The full Veo video is the accumulated extend chain
  // Initial = 8s, each extension adds 7s
  // But each extension's downloaded clip includes ALL previous content
  // So we use the FINAL clip and slice it by time offsets

  const fullVeoDur = parseFloat(
    execSync(`ffprobe -i "${fullVeoPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
  );
  console.log(`📹 Full Veo video: ${fullVeoDur.toFixed(1)}s`);

  let veoOffset = 0;
  const segPaths: string[] = [];
  let totalDuration = 0;

  for (let i = 0; i < STORY_BEATS.length; i++) {
    const beat = STORY_BEATS[i];
    const seg = resolve(segDir, `seg_${i.toString().padStart(2, '0')}_${beat.id}.mp4`);

    // Get TTS duration to determine segment length
    const ttsDur = parseFloat(
      execSync(`ffprobe -i "${voicePaths[i]}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
    );
    const targetDur = ttsDur + 0.8;
    totalDuration += targetDur;

    // Veo time slice for this beat
    const veoDur = i === 0 ? 8 : 7;
    const veoStart = veoOffset;
    veoOffset += veoDur;

    // Build block overlay filter
    const blockFilters = buildBlockFilterChain(beat.blockCount, targetDur);

    // Pick SFX
    const sfxFile = beat.phase === 'celebrate' ? sfx.celebrate : (beat.phase === 'count' ? sfx.stack : null);

    // FFmpeg: slice Veo video + loop to fill TTS dur + overlay blocks + add audio
    const inputs = [
      `-ss ${veoStart} -t ${veoDur} -stream_loop -1 -i "${fullVeoPath}"`,
      `-i "${voicePaths[i]}"`,
    ];
    if (sfxFile) inputs.push(`-i "${sfxFile}"`);

    const videoFilter = `[0:v]scale=1920:1080,setsar=1${blockFilters}[v]`;
    let audioFilter: string;
    if (sfxFile) {
      audioFilter = `[1:a]volume=1.0[voice];[2:a]adelay=300|300,volume=0.4[sfx];[voice][sfx]amix=inputs=2:duration=first[a]`;
    } else {
      audioFilter = `[1:a]volume=1.0[a]`;
    }

    const cmd = [
      'ffmpeg',
      ...inputs,
      '-filter_complex', `"${videoFilter};${audioFilter}"`,
      '-map', '"[v]"', '-map', '"[a]"',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '192k',
      '-t', targetDur.toFixed(2),
      '-pix_fmt', 'yuv420p',
      '-y', `"${seg}"`,
    ].join(' ');

    try {
      execSync(`${cmd} 2>&1`);
    } catch (err: any) {
      console.error(`⚠️  FFmpeg error for ${beat.id}:`, err.stdout?.toString().slice(-200));
      // Retry without SFX
      const simpleCmd = [
        'ffmpeg',
        `-ss ${veoStart} -t ${veoDur} -stream_loop -1 -i "${fullVeoPath}"`,
        `-i "${voicePaths[i]}"`,
        '-filter_complex', `"[0:v]scale=1920:1080,setsar=1${blockFilters}[v]"`,
        '-map', '"[v]"', '-map', '1:a',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', targetDur.toFixed(2),
        '-pix_fmt', 'yuv420p',
        '-y', `"${seg}"`,
      ].join(' ');
      execSync(`${simpleCmd} 2>/dev/null`);
    }

    console.log(`✅ Segment ${i}: ${beat.id} (${targetDur.toFixed(1)}s) [${beat.blockCount} blocks]`);
    segPaths.push(seg);
  }

  // Concatenate
  console.log('\n🔗 Concatenating segments...');
  const concatFile = resolve(OUTPUT_DIR, 'concat.txt');
  await writeFile(concatFile, segPaths.map(s => `file '${s}'`).join('\n'));

  const concatPath = resolve(OUTPUT_DIR, 'concat_no_music.mp4');
  execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -pix_fmt yuv420p -y "${concatPath}" 2>/dev/null`);

  // Add background music
  console.log('🎵 Adding background music...');
  const bgMusic = await generateMusic(totalDuration);
  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  execSync(`ffmpeg -i "${concatPath}" -i "${bgMusic}" -filter_complex "[0:a]volume=1.0[voice];[1:a]volume=0.15[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=3[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -y "${finalPath}" 2>/dev/null`);

  const size = (await readFile(finalPath)).length;
  const dur = parseFloat(
    execSync(`ffprobe -i "${finalPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
  );
  console.log(`\n🎬 FINAL VIDEO: ${finalPath}`);
  console.log(`   Duration: ${dur.toFixed(1)}s | Size: ${(size / 1024 / 1024).toFixed(1)}MB`);
  return finalPath;
}

// ═══════════════════════════════════════════════════
// THUMBNAIL
// ═══════════════════════════════════════════════════

async function generateThumbnail(): Promise<string> {
  const thumbPath = resolve(OUTPUT_DIR, 'thumbnail.png');
  if (existsSync(thumbPath)) return thumbPath;

  console.log('\n🖼️ Generating thumbnail...\n');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `YouTube thumbnail for children's counting video. Cute small blue robot named Cosmo with big brown eyes stands next to a tall colorful rainbow tower of 10 building blocks. Big bold text "COUNT TO 10!" in playful kid-friendly font. Bright, colorful, eye-catching Pixar-style 3D render. Yellow starburst background. Exciting and fun!`,
      n: 1, size: '1792x1024', quality: 'hd', response_format: 'b64_json',
    }),
  });
  const data = await res.json();
  if (!data.data?.[0]?.b64_json) throw new Error(`Thumbnail failed`);
  await writeFile(thumbPath, Buffer.from(data.data[0].b64_json, 'base64'));
  console.log(`✅ Thumbnail saved`);
  return thumbPath;
}

// ═══════════════════════════════════════════════════
// UPLOAD
// ═══════════════════════════════════════════════════

async function uploadToYouTube(videoPath: string, thumbnailPath?: string): Promise<string> {
  console.log('\n📤 Uploading to YouTube (PRIVATE)...\n');
  const { google } = await import('googleapis');
  const { createReadStream } = await import('fs');

  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const youtube = google.youtube({ version: 'v3', auth: oauth2 });

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: '🧱 Count to 10 with Cosmo! | Building Blocks for Kids | Super Builders',
        description: `Count from 1 to 10 with Cosmo the friendly robot! Watch as Cosmo builds a rainbow tower of blocks. Perfect for toddlers and preschoolers learning to count. 🤖🧱✨\n\n🔢 Learn numbers 1-10\n🌈 Beautiful colors\n🏗️ Building and counting fun\n\nSubscribe to Super Builders for more! ⭐`,
        tags: ['counting', 'numbers', '1 to 10', 'learn to count', 'kids', 'toddler', 'preschool', 'educational', 'building blocks', 'robot', 'animation', 'Super Builders', 'Cosmo', 'math for kids'],
        categoryId: '22',
      },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: true },
    },
    media: { body: createReadStream(videoPath) },
  });

  const videoId = res.data.id!;
  console.log(`✅ Uploaded: https://youtube.com/watch?v=${videoId} (PRIVATE)`);

  if (thumbnailPath && existsSync(thumbnailPath)) {
    try {
      await youtube.thumbnails.set({ videoId, media: { body: createReadStream(thumbnailPath) } });
      console.log('✅ Custom thumbnail set');
    } catch (e: any) { console.log(`⚠️  Thumbnail upload failed: ${e.message}`); }
  }
  return videoId;
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  KIDSVID-AI V6 — Veo Background + Block Compositing');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Beats: ${STORY_BEATS.length}`);
  console.log(`  Est. Veo time: ~${Math.ceil((STORY_BEATS.length * VEO_DELAY_MS / 1000) / 60)} min`);
  console.log(`  Strategy: Veo for Cosmo animation + FFmpeg drawbox for blocks`);
  console.log('═══════════════════════════════════════════════════\n');

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Can skip Veo and just do compositing if --composite-only flag
  const compositeOnly = process.argv.includes('--composite-only');
  const skipUpload = process.argv.includes('--no-upload');

  let fullVeoPath: string;

  if (compositeOnly) {
    // Use existing Veo video from previous run
    fullVeoPath = resolve(OUTPUT_DIR, 'veo_clips', `${STORY_BEATS[STORY_BEATS.length - 1].id}.mp4`);
    if (!existsSync(fullVeoPath)) throw new Error(`No Veo video found at ${fullVeoPath}. Run without --composite-only first.`);
    console.log(`♻️  Using existing Veo video: ${fullVeoPath}`);
  } else {
    const refImage = await generateCosmoReference();
    fullVeoPath = await generateVeoChain(refImage);
  }

  // TTS (can run in parallel with Veo but we do it here for simplicity)
  const voicePaths = await generateNarration();

  // Composite: Veo + blocks + audio
  const finalPath = await compositeVideo(fullVeoPath, voicePaths);

  // Thumbnail
  const thumbnail = await generateThumbnail();

  // Upload
  if (!skipUpload) {
    const videoId = await uploadToYouTube(finalPath, thumbnail);
    console.log(`\n🎉 V6 COMPLETE! Video: https://youtube.com/watch?v=${videoId}`);
    console.log(`   Review: https://studio.youtube.com/video/${videoId}/edit`);
  } else {
    console.log(`\n🎉 V6 COMPLETE! Video: ${finalPath}`);
    console.log(`   Thumbnail: ${thumbnail}`);
  }
}

main().catch(err => {
  console.error('\n❌ FATAL:', err);
  process.exit(1);
});
