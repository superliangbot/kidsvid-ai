#!/usr/bin/env npx tsx
/**
 * Pro Video V5 — Extend Chain + Compositing Pipeline
 *
 * Strategy: Veo Extend Chain + Audio Replace + FFmpeg Overlay
 * 1. Generate ONE Cosmo reference image (DALL-E) — used for all Veo calls
 * 2. Generate initial 8s Veo clip with reference image + scene prompt
 * 3. EXTEND that clip up to 20 times (7s each) — preserves character/scene
 * 4. Strip Veo audio, replace with TTS narration + SFX + music
 * 5. Overlay block count numbers via FFmpeg drawtext (programmatic accuracy)
 *
 * Result:
 *   ✅ Beautiful Veo 3D animation
 *   ✅ Character consistency (extend chain carries context)
 *   ✅ No black screens (one continuous video)
 *   ✅ Accurate block counts (FFmpeg overlay, not AI-generated)
 *   ✅ Perfect audio (our TTS + SFX, not Veo's random audio)
 *
 * Max duration: 8s + 20×7s = 148s (~2.5 min)
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v5');
const VEO_DELAY_MS = 150_000; // 2.5 min between Veo calls
const VEO_POLL_INTERVAL = 10_000;
const VEO_POLL_MAX = 60;
const MAX_EXTEND_RETRIES = 2;
const STATE_FILE = resolve(OUTPUT_DIR, 'pipeline_state.json');

// ═══════════════════════════════════════════════════
// RESUME STATE
// ═══════════════════════════════════════════════════

interface PipelineState {
  completedBeats: number;
  lastVideoUri: string | null;
  clipPaths: string[];
  startedAt: string;
  updatedAt: string;
}

async function loadState(): Promise<PipelineState | null> {
  if (!existsSync(STATE_FILE)) return null;
  const raw = JSON.parse(await readFile(STATE_FILE, 'utf-8'));
  console.log(`♻️  Resuming from beat ${raw.completedBeats}/${STORY_BEATS.length}`);
  return raw;
}

async function saveState(state: PipelineState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

interface StoryBeat {
  id: string;
  phase: 'intro' | 'count' | 'celebrate' | 'outro';
  blockCount: number;
  /** Prompt fragment describing what happens in this 7s chunk */
  veoPrompt: string;
  /** TTS narration for this beat */
  narration: string;
  /** Overlay text (e.g., "3" for block count) — empty string = no overlay */
  overlayText: string;
  /** Duration hint in seconds (8 for initial, 7 for extensions) */
  durationSec: number;
}

// ═══════════════════════════════════════════════════
// STORY BEATS — Counting 1-10
// ═══════════════════════════════════════════════════

const COSMO_DESC = `Cosmo, a small friendly blue robot with big round brown eyes, stubby arms, and a glowing antenna on top of his head. He stands in a bright colorful workshop with wooden shelves and toys in the background.`;

const STORY_BEATS: StoryBeat[] = [
  {
    id: 'intro',
    phase: 'intro',
    blockCount: 0,
    veoPrompt: `${COSMO_DESC} Cosmo waves hello enthusiastically at the camera with both stubby arms. He bounces excitedly. Bright 3D Pixar-style children's animation, warm lighting.`,
    narration: `Hi friends! I'm Cosmo, and today we're going to count to ten by building the tallest tower ever! Are you ready? Let's go!`,
    overlayText: '',
    durationSec: 8,
  },
  {
    id: 'count_1',
    phase: 'count',
    blockCount: 1,
    veoPrompt: `${COSMO_DESC} Cosmo picks up a bright RED building block and carefully places it on the ground in front of him. He looks proud. Smooth animation, bright 3D children's style.`,
    narration: `One! One red block. This is where our tower begins!`,
    overlayText: '1',
    durationSec: 7,
  },
  {
    id: 'count_2',
    phase: 'count',
    blockCount: 2,
    veoPrompt: `Cosmo picks up an ORANGE building block and stacks it on top of the red block. The small tower of two blocks stands in front of him. He claps his stubby hands. Bright 3D children's animation.`,
    narration: `Two! One, two! An orange block on top. Our tower is growing!`,
    overlayText: '2',
    durationSec: 7,
  },
  {
    id: 'count_3',
    phase: 'count',
    blockCount: 3,
    veoPrompt: `Cosmo adds a YELLOW building block on top of the two-block tower, making three blocks tall. He steps back to admire it. Bright 3D children's animation.`,
    narration: `Three! One, two, three! A yellow block makes three. Can you count with me?`,
    overlayText: '3',
    durationSec: 7,
  },
  {
    id: 'count_4',
    phase: 'count',
    blockCount: 4,
    veoPrompt: `Cosmo carefully places a GREEN building block on top of the three-block tower. Four blocks tall now. He gives a thumbs up. Bright 3D children's animation.`,
    narration: `Four! One, two, three, four! Green makes four. We're almost halfway!`,
    overlayText: '4',
    durationSec: 7,
  },
  {
    id: 'count_5',
    phase: 'count',
    blockCount: 5,
    veoPrompt: `Cosmo adds a BLUE building block to the tower, now five blocks tall reaching up to his chest. He jumps up and down excitedly. Bright 3D children's animation.`,
    narration: `Five! One, two, three, four, five! Wow, five blocks! We're halfway there!`,
    overlayText: '5',
    durationSec: 7,
  },
  {
    id: 'midpoint',
    phase: 'celebrate',
    blockCount: 5,
    veoPrompt: `Cosmo dances happily next to the five-block tower, spinning around. Colorful sparkles appear around him. The tower stands firm. Bright 3D children's animation, celebratory mood.`,
    narration: `Great job counting to five! Let's keep going and build it even taller!`,
    overlayText: '',
    durationSec: 7,
  },
  {
    id: 'count_6',
    phase: 'count',
    blockCount: 6,
    veoPrompt: `Cosmo reaches up to place a PURPLE building block on top of the five-block tower. Six blocks tall now, reaching above his head. He stretches on his tiptoes. Bright 3D children's animation.`,
    narration: `Six! One, two, three, four, five, six! Purple makes six!`,
    overlayText: '6',
    durationSec: 7,
  },
  {
    id: 'count_7',
    phase: 'count',
    blockCount: 7,
    veoPrompt: `Cosmo uses a small step stool to place a PINK building block on the tall tower, now seven blocks high. He wobbles a little but balances. Bright 3D children's animation.`,
    narration: `Seven! One, two, three, four, five, six, seven! Pink makes seven. It's getting so tall!`,
    overlayText: '7',
    durationSec: 7,
  },
  {
    id: 'count_8',
    phase: 'count',
    blockCount: 8,
    veoPrompt: `Cosmo stretches way up from the step stool to add a WHITE building block to the tall tower, now eight blocks high. He looks amazed at how tall it is. Bright 3D children's animation.`,
    narration: `Eight! Count with me — one, two, three, four, five, six, seven, eight! Almost there!`,
    overlayText: '8',
    durationSec: 7,
  },
  {
    id: 'count_9',
    phase: 'count',
    blockCount: 9,
    veoPrompt: `Cosmo carefully balances a CYAN building block on top of the very tall eight-block tower. Nine blocks! The tower sways slightly. He steadies it with his hand. Bright 3D children's animation.`,
    narration: `Nine! One, two, three, four, five, six, seven, eight, nine! Just one more!`,
    overlayText: '9',
    durationSec: 7,
  },
  {
    id: 'count_10',
    phase: 'count',
    blockCount: 10,
    veoPrompt: `Cosmo triumphantly places a shiny GOLD building block on top of the nine-block tower. TEN blocks tall! The gold block glows. Cosmo throws his arms up in celebration. Bright 3D children's animation, dramatic moment.`,
    narration: `TEN! One, two, three, four, five, six, seven, eight, nine, TEN! We did it! The tallest tower EVER!`,
    overlayText: '🔟',
    durationSec: 7,
  },
  {
    id: 'finale',
    phase: 'celebrate',
    blockCount: 10,
    veoPrompt: `Cosmo dances and celebrates next to the magnificent ten-block rainbow tower. Confetti and sparkles rain down. He waves goodbye at the camera. Bright 3D children's animation, joyful celebration.`,
    narration: `You counted all the way to ten! You're a SUPER builder! See you next time, friends! Bye bye!`,
    overlayText: '',
    durationSec: 7,
  },
];

// Total: 8 + 12×7 = 92 seconds (~1.5 min) — well within 148s limit

// ═══════════════════════════════════════════════════
// REFERENCE IMAGE (DALL-E)
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `Full body character design of Cosmo: a small, cute, friendly blue robot with big round brown eyes, stubby little arms, short legs, and a glowing yellow antenna on top of his round head. He has a cheerful expression. He stands in a bright, colorful workshop with wooden shelves and toys in the background. Pixar-style 3D rendered, warm studio lighting, clean background. Character sheet style, front-facing pose.`,
      n: 1,
      size: '1792x1024',
      quality: 'hd',
      response_format: 'b64_json',
    }),
  });

  const data = await res.json();
  if (!data.data?.[0]?.b64_json) throw new Error(`DALL-E failed: ${JSON.stringify(data)}`);
  await writeFile(refPath, Buffer.from(data.data[0].b64_json, 'base64'));
  console.log(`✅ Cosmo reference saved: ${refPath}`);
  return refPath;
}

// ═══════════════════════════════════════════════════
// VEO EXTEND CHAIN
// ═══════════════════════════════════════════════════

async function generateInitialClip(refImagePath: string, beat: StoryBeat): Promise<{ clipPath: string; videoUri: string }> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
  const refBase64 = (await readFile(refImagePath)).toString('base64');

  console.log(`\n🎬 Generating INITIAL clip (8s): ${beat.id}`);
  console.log(`   Prompt: ${beat.veoPrompt.substring(0, 100)}...`);

  let operation = await client.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt: beat.veoPrompt,
    referenceImages: [{
      image: { imageBytes: refBase64, mimeType: 'image/png' },
      operation: 'SUBJECT_REFERENCE',
    }],
    config: {
      aspectRatio: '16:9',
      durationSeconds: 8,
      personGeneration: 'allow_all',
    },
  } as any);

  // Poll until done
  let attempts = 0;
  while (!operation.done) {
    if (attempts++ >= VEO_POLL_MAX) throw new Error('Veo timed out on initial clip');
    await sleep(VEO_POLL_INTERVAL);
    operation = await client.operations.getVideosOperation({ operation });
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) throw new Error('No video returned from initial generation');
  const uri = typeof video === 'string' ? video : (video as any).uri;

  // Download
  const clipPath = resolve(OUTPUT_DIR, 'clips', `${beat.id}.mp4`);
  const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await writeFile(clipPath, Buffer.from(await res.arrayBuffer()));

  const size = (await readFile(clipPath)).length;
  console.log(`✅ Initial clip: ${clipPath} (${(size / 1024 / 1024).toFixed(1)}MB)`);

  return { clipPath, videoUri: uri };
}

async function extendClip(prevVideoUri: string, beat: StoryBeat, index: number): Promise<{ clipPath: string; videoUri: string }> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  console.log(`\n🔗 Extending clip #${index}: ${beat.id}`);
  console.log(`   Prompt: ${beat.veoPrompt.substring(0, 100)}...`);

  // For extend, we pass the previous video URI
  let operation = await client.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt: beat.veoPrompt,
    video: { uri: prevVideoUri },
    config: {
      aspectRatio: '16:9',
      personGeneration: 'allow_all',
    },
  } as any);

  // Poll
  let attempts = 0;
  while (!operation.done) {
    if (attempts++ >= VEO_POLL_MAX) throw new Error(`Veo timed out on extend #${index}`);
    await sleep(VEO_POLL_INTERVAL);
    operation = await client.operations.getVideosOperation({ operation });
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) throw new Error(`No video from extend #${index}`);
  const uri = typeof video === 'string' ? video : (video as any).uri;

  // Download
  const clipPath = resolve(OUTPUT_DIR, 'clips', `${beat.id}.mp4`);
  const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await writeFile(clipPath, Buffer.from(await res.arrayBuffer()));

  const size = (await readFile(clipPath)).length;
  console.log(`✅ Extended clip #${index}: ${clipPath} (${(size / 1024 / 1024).toFixed(1)}MB)`);

  return { clipPath, videoUri: uri };
}

async function extendClipWithRetry(prevVideoUri: string, beat: StoryBeat, index: number): Promise<{ clipPath: string; videoUri: string }> {
  for (let attempt = 1; attempt <= MAX_EXTEND_RETRIES; attempt++) {
    try {
      const result = await extendClip(prevVideoUri, beat, index);
      // Quick black-screen check: if file is suspiciously small (<50KB for 7s), retry
      const size = (await readFile(result.clipPath)).length;
      if (size < 50_000) {
        console.log(`⚠️  Clip #${index} suspiciously small (${(size/1024).toFixed(0)}KB) — possible black screen, retrying...`);
        if (attempt < MAX_EXTEND_RETRIES) {
          await sleep(30_000);
          continue;
        }
      }
      return result;
    } catch (err: any) {
      console.log(`⚠️  Extend #${index} attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_EXTEND_RETRIES) {
        console.log(`   Retrying in 30s...`);
        await sleep(30_000);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Extend #${index} failed after ${MAX_EXTEND_RETRIES} attempts`);
}

async function generateExtendChain(refImagePath: string): Promise<string[]> {
  // Check for resume state
  let state = await loadState();
  let clipPaths: string[] = [];
  let prevUri: string | null = null;
  let startIdx = 0;

  if (state && state.completedBeats > 0 && state.lastVideoUri) {
    clipPaths = state.clipPaths;
    prevUri = state.lastVideoUri;
    startIdx = state.completedBeats;
    console.log(`\n♻️  Resuming extend chain from beat ${startIdx}/${STORY_BEATS.length}`);
  } else {
    state = {
      completedBeats: 0,
      lastVideoUri: null,
      clipPaths: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  if (startIdx === 0) {
    // Generate initial clip
    const initial = await generateInitialClip(refImagePath, STORY_BEATS[0]);
    clipPaths.push(initial.clipPath);
    prevUri = initial.videoUri;
    state.completedBeats = 1;
    state.lastVideoUri = prevUri;
    state.clipPaths = clipPaths;
    await saveState(state);
    startIdx = 1;
  }

  // Extend for each subsequent beat
  for (let i = startIdx; i < STORY_BEATS.length; i++) {
    console.log(`\n⏳ Waiting ${VEO_DELAY_MS / 1000}s before next Veo call... (${i}/${STORY_BEATS.length - 1})`);
    await sleep(VEO_DELAY_MS);

    const result = await extendClipWithRetry(prevUri!, STORY_BEATS[i], i);
    clipPaths.push(result.clipPath);
    prevUri = result.videoUri;

    // Save state after each successful extension
    state.completedBeats = i + 1;
    state.lastVideoUri = prevUri;
    state.clipPaths = clipPaths;
    await saveState(state);
  }

  return clipPaths;
}

// ═══════════════════════════════════════════════════
// TTS NARRATION (OpenAI)
// ═══════════════════════════════════════════════════

async function generateNarration(): Promise<string[]> {
  console.log('\n🎙️ Generating TTS narration for all beats...\n');
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        voice: 'nova', // warm, friendly, gender-neutral
        input: beat.narration,
        speed: 0.9, // slightly slower for kids
      }),
    });

    if (!res.ok) throw new Error(`TTS failed for ${beat.id}: ${res.status}`);
    await writeFile(voicePath, Buffer.from(await res.arrayBuffer()));
    console.log(`✅ Voice: ${beat.id}`);
    paths.push(voicePath);
  }

  return paths;
}

// ═══════════════════════════════════════════════════
// SFX GENERATION
// ═══════════════════════════════════════════════════

async function generateSFX(): Promise<{ stackSound: string; celebrateSound: string }> {
  const sfxDir = resolve(OUTPUT_DIR, 'sfx');
  await mkdir(sfxDir, { recursive: true });

  const stackPath = resolve(sfxDir, 'stack.wav');
  const celebratePath = resolve(sfxDir, 'celebrate.wav');

  // Generate a simple "block stack" click/thud using ffmpeg tone synthesis
  if (!existsSync(stackPath)) {
    // Short percussive pop: sine wave 200Hz decaying over 0.15s
    execSync(`ffmpeg -f lavfi -i "sine=frequency=200:duration=0.15" -af "afade=t=out:st=0.05:d=0.1,volume=0.6" -y "${stackPath}" 2>/dev/null`);
    console.log('✅ SFX: stack sound');
  }

  if (!existsSync(celebratePath)) {
    // Rising celebration jingle: 3 ascending tones
    execSync(`ffmpeg -f lavfi -i "sine=frequency=523:duration=0.15" -f lavfi -i "sine=frequency=659:duration=0.15" -f lavfi -i "sine=frequency=784:duration=0.3" -filter_complex "[0]adelay=0|0[a];[1]adelay=150|150[b];[2]adelay=300|300[c];[a][b][c]amix=inputs=3:duration=longest,afade=t=out:st=0.4:d=0.2,volume=0.5" -y "${celebratePath}" 2>/dev/null`);
    console.log('✅ SFX: celebrate sound');
  }

  return { stackSound: stackPath, celebrateSound: celebratePath };
}

// ═══════════════════════════════════════════════════
// BACKGROUND MUSIC (Gemini / fallback: generated tone)
// ═══════════════════════════════════════════════════

async function generateBackgroundMusic(totalDurationSec: number): Promise<string> {
  const musicPath = resolve(OUTPUT_DIR, 'bg_music.wav');
  if (existsSync(musicPath)) {
    console.log('♻️  Using cached background music');
    return musicPath;
  }

  console.log('\n🎵 Generating background music bed...\n');

  // Generate a gentle children's music loop using layered tones
  // C major arpeggio pattern: C4-E4-G4-C5, looped and soft
  const dur = Math.ceil(totalDurationSec) + 5;
  // Use a gentle pentatonic arpeggio as a music bed
  const notes = [
    { freq: 262, delay: 0 },     // C4
    { freq: 330, delay: 500 },   // E4
    { freq: 392, delay: 1000 },  // G4
    { freq: 523, delay: 1500 },  // C5
    { freq: 392, delay: 2000 },  // G4
    { freq: 330, delay: 2500 },  // E4
  ];

  // Create a 3-second loop of gentle tones
  const noteInputs = notes.map((n, i) => `-f lavfi -i "sine=frequency=${n.freq}:duration=0.4"`).join(' ');
  const noteFilters = notes.map((n, i) => `[${i}]adelay=${n.delay}|${n.delay},afade=t=in:d=0.05,afade=t=out:st=0.3:d=0.1[n${i}]`).join(';');
  const mixInputs = notes.map((_, i) => `[n${i}]`).join('');

  const loopFile = resolve(OUTPUT_DIR, 'sfx', 'music_loop.wav');
  execSync(`ffmpeg ${noteInputs} -filter_complex "${noteFilters};${mixInputs}amix=inputs=${notes.length}:duration=longest,volume=0.15" -t 3 -y "${loopFile}" 2>/dev/null`);

  // Loop to fill total duration
  const loops = Math.ceil(dur / 3);
  execSync(`ffmpeg -stream_loop ${loops} -i "${loopFile}" -t ${dur} -af "afade=t=in:d=2,afade=t=out:st=${dur - 3}:d=3,volume=0.12" -y "${musicPath}" 2>/dev/null`);
  console.log(`✅ Background music: ${dur}s`);

  return musicPath;
}

// ═══════════════════════════════════════════════════
// ASSEMBLY: Strip audio + overlay + SFX + music + compose
// ═══════════════════════════════════════════════════

async function assembleVideo(clipPaths: string[], voicePaths: string[]): Promise<string> {
  console.log('\n🎞️ Assembling final video...\n');
  const segDir = resolve(OUTPUT_DIR, 'segments');
  await mkdir(segDir, { recursive: true });

  const sfx = await generateSFX();
  const segPaths: string[] = [];
  let totalDuration = 0;

  // Phase 1: Build individual segments with video + TTS + overlay + SFX
  for (let i = 0; i < STORY_BEATS.length; i++) {
    const beat = STORY_BEATS[i];
    const seg = resolve(segDir, `seg_${i.toString().padStart(2, '0')}_${beat.id}.mp4`);

    // Get TTS duration
    const ttsDur = parseFloat(
      execSync(`ffprobe -i "${voicePaths[i]}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
    );
    const targetDur = ttsDur + 0.8;
    totalDuration += targetDur;

    // Animated overlay: fade in the number at 0.3s, hold, fade out at end
    let overlayFilter = '';
    const overlayNum = beat.overlayText === '🔟' ? '10' : beat.overlayText;
    if (overlayNum) {
      const fontColor = beat.overlayText === '🔟' ? 'gold' : 'white';
      // Fade in at 0.3s, fade out at targetDur-0.5
      overlayFilter = `,drawtext=text='${overlayNum}':fontsize=140:fontcolor=${fontColor}@%{if\\\\(between(t\\,0.3\\,${(targetDur - 0.5).toFixed(1)})\\,min((t-0.3)*4\\,1)\\,max(1-(t-${(targetDur - 0.5).toFixed(1)})*4\\,0))}:borderw=6:bordercolor=black@%{if\\\\(between(t\\,0.3\\,${(targetDur - 0.5).toFixed(1)})\\,min((t-0.3)*4\\,1)\\,max(1-(t-${(targetDur - 0.5).toFixed(1)})*4\\,0))}:x=w-tw-50:y=h-th-50:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`;
    }

    // Pick SFX: stack sound for counting beats, celebrate for celebrations
    const sfxFile = beat.phase === 'celebrate' ? sfx.celebrateSound : (beat.phase === 'count' ? sfx.stackSound : null);

    if (sfxFile) {
      // Video + TTS + SFX
      const cmd = [
        'ffmpeg',
        '-stream_loop', '-1', '-i', `"${clipPaths[i]}"`,
        '-i', `"${voicePaths[i]}"`,
        '-i', `"${sfxFile}"`,
        '-filter_complex',
        `"[0:v]scale=1920:1080,setsar=1${overlayFilter}[v];[1:a]volume=1.0[voice];[2:a]adelay=300|300,volume=0.4[sfx];[voice][sfx]amix=inputs=2:duration=first[a]"`,
        '-map', '"[v]"', '-map', '"[a]"',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', targetDur.toFixed(2),
        '-pix_fmt', 'yuv420p',
        '-y', `"${seg}"`,
      ].join(' ');
      execSync(`${cmd} 2>/dev/null`);
    } else {
      // Video + TTS only (intro/outro)
      const cmd = [
        'ffmpeg',
        '-stream_loop', '-1', '-i', `"${clipPaths[i]}"`,
        '-i', `"${voicePaths[i]}"`,
        '-filter_complex',
        `"[0:v]scale=1920:1080,setsar=1${overlayFilter}[v]"`,
        '-map', '"[v]"', '-map', '1:a',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', targetDur.toFixed(2),
        '-pix_fmt', 'yuv420p',
        '-y', `"${seg}"`,
      ].join(' ');
      execSync(`${cmd} 2>/dev/null`);
    }

    console.log(`✅ Segment ${i}: ${beat.id} (${targetDur.toFixed(1)}s)${overlayNum ? ' [overlay: ' + overlayNum + ']' : ''}${sfxFile ? ' [+sfx]' : ''}`);
    segPaths.push(seg);
  }

  // Phase 2: Concatenate all segments
  console.log('\n🔗 Concatenating segments...');
  const concatFile = resolve(OUTPUT_DIR, 'concat.txt');
  await writeFile(concatFile, segPaths.map(s => `file '${s}'`).join('\n'));

  const concatPath = resolve(OUTPUT_DIR, 'concat_no_music.mp4');
  execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -pix_fmt yuv420p -y "${concatPath}" 2>/dev/null`);

  // Phase 3: Mix in background music (ducked under narration)
  console.log('🎵 Adding background music...');
  const bgMusic = await generateBackgroundMusic(totalDuration);

  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  // Use sidechaincompress or simple volume mixing — music at low volume under voice
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
// THUMBNAIL GENERATION
// ═══════════════════════════════════════════════════

async function generateThumbnail(refImagePath: string): Promise<string> {
  const thumbPath = resolve(OUTPUT_DIR, 'thumbnail.png');
  if (existsSync(thumbPath)) {
    console.log('♻️  Using cached thumbnail');
    return thumbPath;
  }

  console.log('\n🖼️ Generating thumbnail (DALL-E)...\n');

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `YouTube thumbnail for a children's counting video. A cute small blue robot named Cosmo with big brown eyes stands next to a tall colorful rainbow tower of 10 building blocks (red, orange, yellow, green, blue, purple, pink, white, cyan, gold from bottom to top). Big bold text "COUNT TO 10!" in playful kid-friendly font. Bright, colorful, eye-catching Pixar-style 3D render. Yellow starburst background. Exciting and fun!`,
      n: 1,
      size: '1792x1024',
      quality: 'hd',
      response_format: 'b64_json',
    }),
  });

  const data = await res.json();
  if (!data.data?.[0]?.b64_json) throw new Error(`Thumbnail DALL-E failed: ${JSON.stringify(data)}`);
  await writeFile(thumbPath, Buffer.from(data.data[0].b64_json, 'base64'));
  console.log(`✅ Thumbnail saved: ${thumbPath}`);
  return thumbPath;
}

// ═══════════════════════════════════════════════════
// UPLOAD TO YOUTUBE
// ═══════════════════════════════════════════════════

async function uploadToYouTube(videoPath: string, thumbnailPath?: string): Promise<string> {
  console.log('\n📤 Uploading to YouTube (PRIVATE)...\n');

  const { google } = await import('googleapis');
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

  const youtube = google.youtube({ version: 'v3', auth: oauth2 });
  const { createReadStream } = await import('fs');

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: '🧱 Count to 10 with Cosmo! | Building Blocks for Kids | Super Builders',
        description: `Count from 1 to 10 with Cosmo the friendly robot! Watch as Cosmo builds a rainbow tower of blocks, one at a time. Perfect for toddlers and preschoolers learning to count. 🤖🧱✨

🔢 Learn numbers 1-10
🌈 Beautiful colors
🏗️ Building and counting fun

Subscribe to Super Builders for more educational fun! ⭐`,
        tags: [
          'counting', 'numbers', '1 to 10', 'learn to count', 'kids', 'toddler',
          'preschool', 'educational', 'building blocks', 'robot', 'animation',
          'Super Builders', 'Cosmo', 'math for kids', 'counting song',
        ],
        categoryId: '22', // People & Blogs (safe for kids content)
      },
      status: {
        privacyStatus: 'private', // ALWAYS private first
        selfDeclaredMadeForKids: true,
      },
    },
    media: {
      body: createReadStream(videoPath),
    },
  });

  const videoId = res.data.id!;
  console.log(`✅ Uploaded: https://youtube.com/watch?v=${videoId} (PRIVATE)`);

  // Set custom thumbnail if provided
  if (thumbnailPath && existsSync(thumbnailPath)) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: {
          body: createReadStream(thumbnailPath),
        },
      });
      console.log('✅ Custom thumbnail set');
    } catch (err: any) {
      console.log(`⚠️  Thumbnail upload failed (may need verified account): ${err.message}`);
    }
  }

  return videoId;
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  KIDSVID-AI V5 — Extend Chain + Compositing');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Beats: ${STORY_BEATS.length}`);
  console.log(`  Est. Veo calls: ${STORY_BEATS.length} (1 initial + ${STORY_BEATS.length - 1} extensions)`);
  console.log(`  Est. time: ~${Math.ceil((STORY_BEATS.length * VEO_DELAY_MS / 1000) / 60)} min (Veo rate limiting)`);
  console.log(`  Est. duration: ~${8 + (STORY_BEATS.length - 1) * 7}s raw Veo`);
  console.log('═══════════════════════════════════════════════════\n');

  await mkdir(resolve(OUTPUT_DIR, 'clips'), { recursive: true });

  // Step 1: Cosmo reference image
  const refImage = await generateCosmoReference();

  // Step 2: TTS narration (parallel-safe, do before Veo to save time)
  const voicePaths = await generateNarration();

  // Step 3: Veo extend chain (sequential by nature)
  const clipPaths = await generateExtendChain(refImage);

  // Step 4: Assemble (strip audio, overlay numbers, concat)
  const finalPath = await assembleVideo(clipPaths, voicePaths);

  // Step 5: Thumbnail
  const thumbnail = await generateThumbnail(refImage);

  // Step 6: Upload (private)
  const skipUpload = process.argv.includes('--no-upload');
  if (!skipUpload) {
    const videoId = await uploadToYouTube(finalPath, thumbnail);
    console.log(`\n🎉 V5 COMPLETE! Video ID: ${videoId}`);
    console.log(`   Review at: https://studio.youtube.com/video/${videoId}/edit`);
  } else {
    console.log(`\n🎉 V5 COMPLETE! Video at: ${finalPath}`);
    console.log(`   Thumbnail at: ${thumbnail}`);
    console.log('   (Upload skipped — use without --no-upload to publish)');
  }
}

main().catch(err => {
  console.error('\n❌ FATAL:', err);
  process.exit(1);
});
