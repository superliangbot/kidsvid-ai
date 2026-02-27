#!/usr/bin/env npx tsx
/**
 * KidsVid-AI V10 — Hybrid Pipeline
 * 
 * Approach: Veo generates Cosmo animation clips (NO blocks in scene),
 * then we overlay programmatic block stacks + count numbers with FFmpeg.
 * 
 * This gives us:
 * - 100% accurate block counts (programmatic, not AI-generated)
 * - Exact color sequence (red→blue→green→yellow→purple→orange→pink→teal→gold→silver)
 * - Consistent block style across all scenes
 * - Beautiful Veo character animation underneath
 * - Synced narration
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { COSMO_IDENTITY } from '../src/characters/cosmo.js';
import { GoogleGenAI } from '@google/genai';

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v10-count-to-10');
const REFS_DIR = resolve(__dirname, '..', 'assets', 'cosmo-refs');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Block colors — exact, programmatic
const BLOCK_COLORS = [
  { name: 'red',    hex: '#E53935' },
  { name: 'blue',   hex: '#1E88E5' },
  { name: 'green',  hex: '#43A047' },
  { name: 'yellow', hex: '#FDD835' },
  { name: 'purple', hex: '#8E24AA' },
  { name: 'orange', hex: '#FB8C00' },
  { name: 'pink',   hex: '#EC407A' },
  { name: 'teal',   hex: '#00897B' },
  { name: 'gold',   hex: '#FFB300' },
  { name: 'silver', hex: '#B0BEC5' },
];

// Block dimensions for overlay
const BLOCK_W = 60;
const BLOCK_H = 40;
const BLOCK_GAP = 2;
const STACK_X = 960; // Right side of frame
const STACK_BOTTOM = 620; // Bottom of stack area
const NUM_X = 1100; // Number display position
const NUM_Y = 80;

/**
 * Generate a block stack overlay image (transparent PNG) using FFmpeg.
 * Shows N blocks stacked vertically with a big number.
 */
function generateBlockOverlay(count: number, outPath: string): void {
  if (count === 0) {
    // Empty transparent image
    execSync(`ffmpeg -y -f lavfi -i "color=c=black@0:s=1280x720" -frames:v 1 -pix_fmt argb "${outPath}" 2>/dev/null`);
    return;
  }

  // Build FFmpeg drawbox filter chain for blocks + drawtext for number
  const filters: string[] = [];

  for (let i = 0; i < count; i++) {
    const color = BLOCK_COLORS[i].hex;
    const y = STACK_BOTTOM - (i + 1) * (BLOCK_H + BLOCK_GAP);
    // Main block
    filters.push(`drawbox=x=${STACK_X}:y=${y}:w=${BLOCK_W}:h=${BLOCK_H}:color=${color}:t=fill`);
    // Highlight (lighter top edge)
    filters.push(`drawbox=x=${STACK_X}:y=${y}:w=${BLOCK_W}:h=4:color=white@0.3:t=fill`);
    // Shadow (darker bottom edge)
    filters.push(`drawbox=x=${STACK_X}:y=${y + BLOCK_H - 4}:w=${BLOCK_W}:h=4:color=black@0.2:t=fill`);
  }

  // Big number display
  const fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  filters.push(`drawtext=text='${count}':fontsize=120:fontcolor=white:borderw=4:bordercolor=black:x=${NUM_X}:y=${NUM_Y}:fontfile=${fontFile}`);

  // Small label
  filters.push(`drawtext=text='blocks':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=${NUM_X + 10}:y=${NUM_Y + 130}:fontfile=${fontFile}`);

  const filterChain = filters.join(',');
  execSync(`ffmpeg -y -f lavfi -i "color=c=black@0:s=1280x720:d=1" -vf "${filterChain}" -frames:v 1 -pix_fmt argb "${outPath}" 2>/dev/null`);
}

/**
 * Overlay a static block image onto a video clip.
 * The block overlay fades in at the start.
 */
function compositeOverlay(clipPath: string, overlayPath: string, outPath: string): void {
  // Overlay the block stack on the right side of the video
  execSync(`ffmpeg -y -i "${clipPath}" -i "${overlayPath}" -filter_complex "[1:v]format=argba,fade=in:st=0.5:d=0.5[ovr];[0:v][ovr]overlay=0:0:shortest=1" -c:v libx264 -preset fast -crf 23 -c:a copy "${outPath}" 2>/dev/null`);
}

interface Scene {
  id: string;
  blockCount: number;
  motionPrompt: string;
  narration: string;
}

function buildScenes(): Scene[] {
  const scenes: Scene[] = [];

  scenes.push({
    id: 'intro',
    blockCount: 0,
    motionPrompt: 'A single small blue robot stands in a bright colorful toy workshop with wooden shelves. It waves both arms excitedly at the camera, antenna glowing. Gentle zoom in. Warm lighting. Only one robot, no blocks, empty table. (no subtitles, no text overlays)',
    narration: 'Hi friends! I am Cosmo! Today, let us count to ten together! Are you ready? Here we go!',
  });

  for (let n = 1; n <= 10; n++) {
    const color = BLOCK_COLORS[n - 1].name;
    scenes.push({
      id: `count-${n}`,
      blockCount: n,
      motionPrompt: `A single small blue robot in a bright colorful toy workshop picks up a small ${color} object and holds it up proudly, looking at the camera with joy. Eye-level camera, gentle movement. Warm lighting. Only one robot. The robot's workspace is on the left side of frame. (no subtitles, no text overlays)`,
      narration: n === 1 ? 'One! One red block. This is where our tower begins!'
        : n === 5 ? 'Five! Five blocks! We are halfway there! Great counting!'
        : n === 10 ? 'Ten! Ten blocks! We did it! We counted all the way to ten!'
        : `${['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten'][n]}! ${['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten'][n]} ${color} blocks!`,
    });
  }

  scenes.push({
    id: 'celebration',
    blockCount: 10,
    motionPrompt: 'A single small blue robot bounces and dances joyfully in a bright colorful toy workshop, arms raised in celebration. Colorful confetti falls from above. Camera slowly pulls back. Only one robot. Festive atmosphere. (no subtitles, no text overlays)',
    narration: 'Yay! You did amazing! You counted all the way to ten! I am so proud of you! See you next time, friends! Bye bye!',
  });

  return scenes;
}

async function main() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  KidsVid-AI V10 — Hybrid: Veo + Programmatic     ║');
  console.log('║  Veo animation + FFmpeg block overlay             ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  await mkdir(resolve(OUTPUT_DIR, 'clips-raw'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'clips'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'overlays'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'audio'), { recursive: true });

  // Load character references
  const refs: any[] = [];
  for (const f of ['cosmo-ref-front.png', 'cosmo-ref-three-quarter.png', 'cosmo-ref-side.png']) {
    const p = resolve(REFS_DIR, f);
    if (existsSync(p)) {
      const data = await readFile(p);
      refs.push({ image: { imageBytes: data.toString('base64'), mimeType: 'image/png' }, referenceType: 'asset' });
    }
  }
  console.log(`✅ ${refs.length} character references loaded`);

  // Generate all block overlays first (instant, programmatic)
  console.log('\n━━━ Generating block overlays (programmatic) ━━━');
  const scenes = buildScenes();
  for (const scene of scenes) {
    const overlayPath = resolve(OUTPUT_DIR, 'overlays', `${scene.id}.png`);
    if (!existsSync(overlayPath)) {
      generateBlockOverlay(scene.blockCount, overlayPath);
      console.log(`  ✅ ${scene.id}: ${scene.blockCount} blocks`);
    }
  }
  console.log('  All overlays generated (pixel-perfect)\n');

  // Generate clips + narration
  const clipPaths: string[] = [];
  const narPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const rawClipPath = resolve(OUTPUT_DIR, 'clips-raw', `${scene.id}.mp4`);
    const clipPath = resolve(OUTPUT_DIR, 'clips', `${scene.id}.mp4`);
    const overlayPath = resolve(OUTPUT_DIR, 'overlays', `${scene.id}.png`);
    const narPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}.wav`);
    const narPaddedPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}-padded.wav`);

    console.log(`[${i + 1}/${scenes.length}] ━━━ ${scene.id} (${scene.blockCount} blocks) ━━━`);

    // Narration
    if (!existsSync(narPath)) {
      console.log(`  🗣️  TTS...`);
      try {
        const ttsResp = await client.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: `Say in a cheerful, warm, enthusiastic kid-friendly voice: ${scene.narration}` }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          } as any,
        });
        const audioData = (ttsResp as any).candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (audioData) {
          const pcmPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}-raw.pcm`);
          await writeFile(pcmPath, Buffer.from(audioData, 'base64'));
          execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" "${narPath}" 2>/dev/null`);
          console.log(`  ✅ Narration`);
        }
      } catch (e: any) { console.log(`  ❌ TTS: ${e.message?.substring(0, 100)}`); }
      await sleep(2000);
    } else { console.log(`  ♻️  Cached narration`); }

    // Pad narration to 8s
    if (existsSync(narPath) && !existsSync(narPaddedPath)) {
      execSync(`ffmpeg -y -i "${narPath}" -af "apad=whole_dur=8" -ar 24000 -ac 1 "${narPaddedPath}" 2>/dev/null`);
    }
    if (existsSync(narPaddedPath)) narPaths.push(narPaddedPath);

    // Raw Veo clip (Cosmo animation, no blocks)
    if (!existsSync(rawClipPath) || parseInt(execSync(`stat -c %s "${rawClipPath}"`).toString().trim()) < 50000) {
      console.log(`  🎬 Veo 3.1 + referenceImages...`);
      try {
        let op = await client.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt: scene.motionPrompt,
          config: {
            aspectRatio: '16:9',
            personGeneration: 'allow_adult',
            referenceImages: refs,
          } as any,
        });
        let attempts = 0;
        while (!op.done) {
          if (attempts++ >= 90) throw new Error('Timed out');
          process.stdout.write('.');
          await sleep(10000);
          op = await client.operations.getVideosOperation({ operation: op });
        }
        console.log('');
        const video = op.response?.generatedVideos?.[0]?.video;
        if (!video) throw new Error('No video');
        const uri = typeof video === 'string' ? video : (video as any).uri;
        const res = await fetch(uri!, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(rawClipPath, buf);
        console.log(`  ✅ Raw clip: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
      } catch (e: any) {
        console.log(`  ❌ Veo: ${e.message?.substring(0, 150)}`);
      }
      await sleep(5000);
    } else { console.log(`  ♻️  Cached raw clip`); }

    // Composite: raw clip + block overlay
    if (existsSync(rawClipPath) && parseInt(execSync(`stat -c %s "${rawClipPath}"`).toString().trim()) > 50000) {
      if (!existsSync(clipPath)) {
        console.log(`  🎨 Compositing overlay (${scene.blockCount} blocks)...`);
        try {
          compositeOverlay(rawClipPath, overlayPath, clipPath);
          console.log(`  ✅ Composited`);
        } catch (e: any) {
          // Fallback: use raw clip
          execSync(`cp "${rawClipPath}" "${clipPath}"`);
          console.log(`  ⚠️  Overlay failed, using raw: ${e.message?.substring(0, 80)}`);
        }
      }
      clipPaths.push(clipPath);
    }
  }

  // Assembly
  console.log(`\n━━━ Assembly ━━━`);
  console.log(`Clips: ${clipPaths.length}/${scenes.length} | Narrations: ${narPaths.length}/${scenes.length}`);

  if (clipPaths.length === 0) { console.log('❌ No clips'); return; }

  await writeFile(resolve(OUTPUT_DIR, 'concat.txt'), clipPaths.map(p => `file '${p}'`).join('\n'));
  const concatVideo = resolve(OUTPUT_DIR, 'concat-video.mp4');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'concat.txt')}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -ar 44100 -ac 2 -r 24 -s 1280x720 "${concatVideo}" 2>/dev/null`);

  // Match narrations to existing clips only
  const clipIds = clipPaths.map(p => p.match(/([^/]+)\.mp4$/)?.[1] || '');
  const matchedNars = clipIds.map(id => resolve(OUTPUT_DIR, 'audio', `${id}-padded.wav`)).filter(p => existsSync(p));
  await writeFile(resolve(OUTPUT_DIR, 'nar-concat.txt'), matchedNars.map(p => `file '${p}'`).join('\n'));
  const narFull = resolve(OUTPUT_DIR, 'narration-full.wav');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'nar-concat.txt')}" -ar 44100 -ac 1 "${narFull}" 2>/dev/null`);

  const dur = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${concatVideo}"`).toString().trim());
  const bgMusic = resolve(OUTPUT_DIR, 'bg-music.wav');
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=261:duration=${dur}" -af "volume=0.03,atempo=0.5" -ar 44100 -ac 1 "${bgMusic}" 2>/dev/null`);

  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  try {
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -i "${bgMusic}" -filter_complex "[1:a]volume=1.0[nar];[2:a]volume=0.1[bg];[nar][bg]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${finalPath}" 2>/dev/null`);
  } catch {
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" 2>/dev/null`);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const info = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_format "${finalPath}"`).toString());
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  🎬 V10 HYBRID EPISODE COMPLETE                   ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  Duration:    ${parseFloat(info.format.duration).toFixed(1)}s`);
  console.log(`║  Size:        ${(parseInt(info.format.size) / 1048576).toFixed(1)}MB`);
  console.log(`║  Clips:       ${clipPaths.length}/${scenes.length}`);
  console.log(`║  Block overlay: Programmatic (100% accurate)`);
  console.log(`║  Build time:  ${elapsed} min`);
  console.log(`║  Output:      ${finalPath}`);
  console.log(`╚══════════════════════════════════════════════════╝`);

  try { execSync(`openclaw system event --text "V10 hybrid episode complete — ${clipPaths.length}/${scenes.length} clips, programmatic blocks, ${elapsed} min" --mode now 2>/dev/null`); } catch {}
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
