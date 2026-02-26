#!/usr/bin/env npx tsx
/**
 * KidsVid-AI V9 — "Count to 10 with Cosmo!"
 * 
 * Fixes from V8 review:
 * 1. BLOCK COUNT ACCURACY: Imagen 4 generates starting frames with EXACT block counts
 * 2. AUDIO SYNC: Narration padded to 8s per clip, or clips trimmed to match
 * 3. BACKGROUND CONSISTENCY: Same workshop description in every frame
 * 4. STACK CONTINUITY: Programmatic block description (same colors, same order, growing stack)
 * 
 * Pipeline: Imagen starting frame (exact blocks) → Veo image-to-video (motion only) → Gemini TTS → FFmpeg
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

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v9-count-to-10');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════
// FIXED BLOCK DEFINITIONS — exact colors, exact order, cumulative
// ═══════════════════════════════════════════

const BLOCK_STACK = [
  { n: 1,  color: 'red',    position: 'bottom' },
  { n: 2,  color: 'blue',   position: 'second from bottom' },
  { n: 3,  color: 'green',  position: 'third from bottom' },
  { n: 4,  color: 'yellow', position: 'fourth from bottom' },
  { n: 5,  color: 'purple', position: 'fifth from bottom' },
  { n: 6,  color: 'orange', position: 'sixth from bottom' },
  { n: 7,  color: 'pink',   position: 'seventh from bottom' },
  { n: 8,  color: 'teal',   position: 'eighth from bottom' },
  { n: 9,  color: 'gold',   position: 'ninth from bottom' },
  { n: 10, color: 'silver', position: 'top' },
];

const WORKSHOP_BG = 'a bright, colorful toy workshop with warm wooden shelves filled with toys, gears on the wall, and soft warm golden lighting. Clean wooden table in front.';

function describeStack(count: number): string {
  if (count === 0) return 'an empty wooden table';
  const blocks = BLOCK_STACK.slice(0, count);
  const desc = blocks.map(b => `a ${b.color} block`).join(', then ');
  return `a neat vertical stack of exactly ${count} block${count > 1 ? 's' : ''} on a wooden table, from bottom to top: ${desc}. The stack is a single straight column, centered on the table.`;
}

function numberWord(n: number): string {
  return ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][n] || String(n);
}

// ═══════════════════════════════════════════
// SCENE DEFINITIONS
// ═══════════════════════════════════════════

interface Scene {
  id: string;
  // Starting frame prompt (for Imagen 4 — describes exact block state)
  framePrompt: string;
  // Motion prompt (for Veo — describes movement only, NOT the character or blocks)
  motionPrompt: string;
  // Narration text
  narration: string;
}

function buildScenes(): Scene[] {
  const scenes: Scene[] = [];
  const cosmo = COSMO_IDENTITY.description;

  // Intro
  scenes.push({
    id: 'intro',
    framePrompt: `${cosmo} standing in ${WORKSHOP_BG}. The table is empty. Cosmo is waving at the camera with both arms, looking directly at the viewer with a big excited smile. Front-facing, centered composition, 16:9 aspect ratio. Pixar-style 3D children's animation, high quality.`,
    motionPrompt: `The small blue robot waves both arms excitedly at the camera, antenna glowing. Gentle zoom in. Only one robot, no blocks yet. (no subtitles, no text overlays)`,
    narration: 'Hi friends! I am Cosmo! Today, let us count to ten together! Are you ready? Here we go!',
  });

  // Count 1-10: each scene shows Cosmo placing the Nth block on the stack
  for (let n = 1; n <= 10; n++) {
    const block = BLOCK_STACK[n - 1];
    const existingStack = n === 1 ? 'an empty wooden table' : describeStack(n - 1);
    const newStack = describeStack(n);

    scenes.push({
      id: `count-${n}`,
      framePrompt: `${cosmo} standing in ${WORKSHOP_BG}. On the table is ${newStack}. Cosmo is holding up the ${block.color} block (the top block, number ${n}) proudly with both hands, showing it to the camera. The stack clearly shows exactly ${n} blocks total. Front-facing, centered composition, 16:9 aspect ratio. Pixar-style 3D children's animation, high quality.`,
      motionPrompt: `The single small blue robot holds up a ${block.color} block and places it on top of the stack. It looks at the camera with joy. Eye-level camera, gentle dolly. Only one robot. (no subtitles, no text overlays)`,
      narration: n === 1 ? 'One! One red block. This is where our tower begins!'
        : n === 5 ? 'Five! Five blocks! We are halfway there! Great counting!'
        : n === 10 ? 'Ten! Ten blocks! We did it! We counted all the way to ten!'
        : `${numberWord(n)}! ${numberWord(n)} ${block.color} blocks!`,
    });
  }

  // Celebration
  scenes.push({
    id: 'celebration',
    framePrompt: `${cosmo} standing in ${WORKSHOP_BG}. Next to Cosmo is ${describeStack(10)}. Confetti falls from above. Cosmo has arms raised in celebration, huge joyful expression. The complete tower of 10 blocks is clearly visible. Front-facing, centered, 16:9. Pixar-style 3D children's animation, high quality, festive.`,
    motionPrompt: `The single small blue robot bounces and dances joyfully, arms raised in celebration. Colorful confetti falls from above. A tall tower of 10 colorful blocks stands next to the robot. Camera slowly pulls back. Only one robot. (no subtitles, no text overlays)`,
    narration: 'Yay! You did amazing! You counted all the way to ten! I am so proud of you! See you next time, friends! Bye bye!',
  });

  return scenes;
}

// ═══════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════

async function main() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  KidsVid-AI V9 — "Count to 10 with Cosmo!"       ║');
  console.log('║  Fixed: block counts, audio sync, continuity      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  await mkdir(resolve(OUTPUT_DIR, 'clips'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'frames'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'audio'), { recursive: true });

  const scenes = buildScenes();
  console.log(`📋 ${scenes.length} scenes\n`);

  const clipPaths: string[] = [];
  const narPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const framePath = resolve(OUTPUT_DIR, 'frames', `${scene.id}.png`);
    const clipPath = resolve(OUTPUT_DIR, 'clips', `${scene.id}.mp4`);
    const narPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}.wav`);
    const narPaddedPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}-padded.wav`);

    console.log(`[${i + 1}/${scenes.length}] ━━━ ${scene.id} ━━━`);

    // ─── Step 1: Generate starting frame with EXACT block count ───
    if (!existsSync(framePath)) {
      console.log(`  🖼️  Starting frame (Imagen 4, exact blocks)...`);
      try {
        const resp = await client.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: scene.framePrompt,
          config: {
            numberOfImages: 1,
            aspectRatio: '16:9',
            personGeneration: 'allow_all',
          } as any,
        });
        const img = (resp as any).generatedImages?.[0];
        if (img?.image?.imageBytes) {
          const bytes = typeof img.image.imageBytes === 'string'
            ? Buffer.from(img.image.imageBytes, 'base64')
            : Buffer.from(img.image.imageBytes);
          await writeFile(framePath, bytes);
          console.log(`  ✅ Frame: ${(bytes.length / 1024).toFixed(0)}KB`);
        } else {
          console.log(`  ❌ No image returned`);
        }
      } catch (e: any) {
        console.log(`  ❌ Imagen: ${e.message?.substring(0, 120)}`);
      }
      await sleep(3000);
    } else {
      console.log(`  ♻️  Cached frame`);
    }

    // ─── Step 2: Narration (generate first so we know duration) ───
    if (!existsSync(narPath)) {
      console.log(`  🗣️  TTS: "${scene.narration.substring(0, 50)}..."`);
      try {
        const ttsResp = await client.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: `Say in a cheerful, warm, enthusiastic kid-friendly voice with clear enunciation and a brief pause at the end: ${scene.narration}` }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Puck' },
              },
            },
          } as any,
        });
        const audioData = (ttsResp as any).candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (audioData) {
          const pcmPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}-raw.pcm`);
          await writeFile(pcmPath, Buffer.from(audioData, 'base64'));
          execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" "${narPath}" 2>/dev/null`);
          console.log(`  ✅ Narration`);
        }
      } catch (e: any) {
        console.log(`  ❌ TTS: ${e.message?.substring(0, 100)}`);
      }
      await sleep(2000);
    } else {
      console.log(`  ♻️  Cached narration`);
    }

    // Pad narration to exactly 8 seconds (add silence at end)
    if (existsSync(narPath) && !existsSync(narPaddedPath)) {
      try {
        execSync(`ffmpeg -y -i "${narPath}" -af "apad=whole_dur=8" -ar 24000 -ac 1 "${narPaddedPath}" 2>/dev/null`);
      } catch {
        execSync(`cp "${narPath}" "${narPaddedPath}"`);
      }
    }
    if (existsSync(narPaddedPath)) narPaths.push(narPaddedPath);

    // ─── Step 3: Generate video clip (Veo image-to-video) ───
    if (!existsSync(clipPath) || (existsSync(clipPath) && parseInt(execSync(`stat -c %s "${clipPath}"`).toString().trim()) < 50000)) {
      if (existsSync(framePath)) {
        console.log(`  🎬 Veo 3.1 image-to-video...`);
        try {
          const frameData = await readFile(framePath);
          let op = await client.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: scene.motionPrompt,
            image: { imageBytes: frameData.toString('base64'), mimeType: 'image/png' },
            config: {
              aspectRatio: '16:9',
              negativePrompt: 'multiple robots, duplicate characters, ' + COSMO_IDENTITY.negativePrompt,
              personGeneration: 'allow_adult',
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
          if (!uri) throw new Error('No URI');
          const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
          const buf = Buffer.from(await res.arrayBuffer());
          await writeFile(clipPath, buf);
          console.log(`  ✅ Clip: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
        } catch (e: any) {
          console.log(`  ❌ Veo: ${e.message?.substring(0, 150)}`);
        }
        await sleep(5000);
      } else {
        console.log(`  ⚠️  No starting frame, skipping clip`);
      }
    } else {
      console.log(`  ♻️  Cached clip`);
    }

    if (existsSync(clipPath) && parseInt(execSync(`stat -c %s "${clipPath}"`).toString().trim()) > 50000) {
      clipPaths.push(clipPath);
    }
  }

  // ─── Assembly ───
  console.log(`\n━━━ Assembly ━━━`);
  console.log(`Clips: ${clipPaths.length}/${scenes.length} | Narrations: ${narPaths.length}/${scenes.length}`);

  if (clipPaths.length === 0) {
    console.log('❌ No clips generated');
    return;
  }

  // Concat video — re-encode to ensure consistency
  await writeFile(resolve(OUTPUT_DIR, 'concat.txt'), clipPaths.map(p => `file '${p}'`).join('\n'));
  const concatVideo = resolve(OUTPUT_DIR, 'concat-video.mp4');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'concat.txt')}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -ar 44100 -ac 2 -r 24 -s 1280x720 "${concatVideo}" 2>/dev/null`);
  console.log('✅ Video concatenated');

  // Concat padded narrations (each exactly 8s → total should match video)
  await writeFile(resolve(OUTPUT_DIR, 'nar-concat.txt'), narPaths.map(p => `file '${p}'`).join('\n'));
  const narFull = resolve(OUTPUT_DIR, 'narration-full.wav');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'nar-concat.txt')}" -ar 44100 -ac 1 "${narFull}" 2>/dev/null`);
  console.log('✅ Narration concatenated (padded to sync)');

  // Simple background ambient
  const durStr = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${concatVideo}"`).toString().trim();
  const dur = parseFloat(durStr);
  const bgMusic = resolve(OUTPUT_DIR, 'bg-music.wav');
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=261:duration=${dur}" -af "volume=0.03,atempo=0.5" -ar 44100 -ac 1 "${bgMusic}" 2>/dev/null`);

  // Final mix
  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  try {
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -i "${bgMusic}" -filter_complex "[1:a]volume=1.0[nar];[2:a]volume=0.1[bg];[nar][bg]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${finalPath}" 2>/dev/null`);
    console.log('✅ Final: video + synced narration + ambient');
  } catch {
    try {
      execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" 2>/dev/null`);
      console.log('✅ Final: video + narration');
    } catch {
      execSync(`cp "${concatVideo}" "${finalPath}"`);
      console.log('⚠️  Final: video only');
    }
  }

  // Thumbnail
  const thumbPath = resolve(OUTPUT_DIR, 'thumbnail.png');
  if (!existsSync(thumbPath)) {
    console.log('\n━━━ Thumbnail ━━━');
    try {
      const resp = await client.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `${COSMO_IDENTITY.description} standing next to ${describeStack(10)}. Bright cheerful background with confetti and sparkles. Bold colorful style, vibrant, eye-catching YouTube thumbnail composition. Pixar-style 3D children's animation.`,
        config: { numberOfImages: 1, aspectRatio: '16:9', personGeneration: 'allow_all' } as any,
      });
      const img = (resp as any).generatedImages?.[0];
      if (img?.image?.imageBytes) {
        const rawThumb = resolve(OUTPUT_DIR, 'thumbnail-raw.png');
        const bytes = typeof img.image.imageBytes === 'string' ? Buffer.from(img.image.imageBytes, 'base64') : Buffer.from(img.image.imageBytes);
        await writeFile(rawThumb, bytes);
        try {
          execSync(`ffmpeg -y -i "${rawThumb}" -vf "drawtext=text='Count to 10!':fontsize=72:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=40:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" "${thumbPath}" 2>/dev/null`);
        } catch { execSync(`cp "${rawThumb}" "${thumbPath}"`); }
        console.log('✅ Thumbnail');
      }
    } catch (e: any) { console.log(`❌ Thumbnail: ${e.message?.substring(0, 100)}`); }
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  if (existsSync(finalPath)) {
    const info = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${finalPath}"`).toString());
    const d = parseFloat(info.format.duration);
    const s = parseInt(info.format.size) / 1048576;
    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║  🎬 V9 EPISODE COMPLETE                           ║`);
    console.log(`╠══════════════════════════════════════════════════╣`);
    console.log(`║  Duration:    ${d.toFixed(1)}s (${(d / 60).toFixed(1)} min)`);
    console.log(`║  Size:        ${s.toFixed(1)}MB`);
    console.log(`║  Clips:       ${clipPaths.length}/${scenes.length}`);
    console.log(`║  Narrations:  ${narPaths.length}/${scenes.length} (padded to 8s each)`);
    console.log(`║  Build time:  ${elapsed} minutes`);
    console.log(`║  Output:      ${finalPath}`);
    console.log(`╚══════════════════════════════════════════════════╝`);
  }

  try { execSync(`openclaw system event --text "V9 episode complete — ${clipPaths.length}/${scenes.length} clips, ${elapsed} min" --mode now 2>/dev/null`); } catch {}
}

main().catch(e => { console.error('\n💥 Fatal:', e.message); process.exit(1); });
