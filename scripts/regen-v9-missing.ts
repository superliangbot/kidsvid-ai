#!/usr/bin/env npx tsx
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { GoogleGenAI } from '@google/genai';
import { COSMO_IDENTITY } from '../src/characters/cosmo.js';

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v9-count-to-10');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const MISSING = [
  { id: 'count-1', motion: 'The small blue robot holds up a red block proudly, then places it on the empty wooden table. It looks at the camera with excitement. Eye-level, gentle dolly. Only one robot. (no subtitles, no text overlays)' },
  { id: 'count-4', motion: 'The small blue robot holds up a yellow block, then carefully adds it to the top of a small stack of 3 blocks. Eye-level camera, gentle dolly forward. Only one robot visible. (no subtitles, no text overlays)' },
  { id: 'count-6', motion: 'The small blue robot adds an orange block to the top of a stack of 5 colorful blocks. It places the block carefully, then looks at the camera with pride. Eye-level, gentle dolly. Only one robot. (no subtitles, no text overlays)' },
];

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  for (const scene of MISSING) {
    const framePath = resolve(OUTPUT_DIR, 'frames', `${scene.id}.png`);
    const clipPath = resolve(OUTPUT_DIR, 'clips', `${scene.id}.mp4`);

    if (existsSync(clipPath) && parseInt(execSync(`stat -c %s "${clipPath}"`).toString().trim()) > 50000) {
      console.log(`♻️  ${scene.id}: already exists, skipping`);
      continue;
    }

    if (!existsSync(framePath)) {
      console.log(`❌ ${scene.id}: no starting frame`);
      continue;
    }

    console.log(`🎬 Regenerating ${scene.id}...`);
    try {
      const frameData = await readFile(framePath);
      let op = await client.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: scene.motion,
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
      if (!video) throw new Error('No video returned');
      const uri = typeof video === 'string' ? video : (video as any).uri;
      if (!uri) throw new Error('No URI');
      const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 50000) throw new Error('Video too small');
      await writeFile(clipPath, buf);
      console.log(`✅ ${scene.id}: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
    } catch (e: any) {
      console.log(`❌ ${scene.id}: ${e.message?.substring(0, 150)}`);
    }
    await sleep(5000);
  }

  // Re-assemble
  console.log('\n━━━ Re-assembling ━━━');
  const clipOrder = ['intro', 'count-1', 'count-2', 'count-3', 'count-4', 'count-5',
    'count-6', 'count-7', 'count-8', 'count-9', 'count-10', 'celebration'];
  const clipPaths = clipOrder.map(id => resolve(OUTPUT_DIR, 'clips', `${id}.mp4`)).filter(p =>
    existsSync(p) && parseInt(execSync(`stat -c %s "${p}"`).toString().trim()) > 50000);
  const narPaths = clipOrder.map(id => resolve(OUTPUT_DIR, 'audio', `${id}-padded.wav`)).filter(p => existsSync(p));

  console.log(`Clips: ${clipPaths.length}/12 | Narrations: ${narPaths.length}/12`);

  await writeFile(resolve(OUTPUT_DIR, 'concat.txt'), clipPaths.map(p => `file '${p}'`).join('\n'));
  const concatVideo = resolve(OUTPUT_DIR, 'concat-video.mp4');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'concat.txt')}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -ar 44100 -ac 2 -r 24 -s 1280x720 "${concatVideo}" 2>/dev/null`);

  // Only include narrations for clips that exist
  const matchedNarPaths = clipOrder
    .filter(id => clipPaths.some(p => p.includes(`${id}.mp4`)))
    .map(id => resolve(OUTPUT_DIR, 'audio', `${id}-padded.wav`))
    .filter(p => existsSync(p));
  await writeFile(resolve(OUTPUT_DIR, 'nar-concat.txt'), matchedNarPaths.map(p => `file '${p}'`).join('\n'));
  const narFull = resolve(OUTPUT_DIR, 'narration-full.wav');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'nar-concat.txt')}" -ar 44100 -ac 1 "${narFull}" 2>/dev/null`);

  const durStr = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${concatVideo}"`).toString().trim();
  const bgMusic = resolve(OUTPUT_DIR, 'bg-music.wav');
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=261:duration=${parseFloat(durStr)}" -af "volume=0.03,atempo=0.5" -ar 44100 -ac 1 "${bgMusic}" 2>/dev/null`);

  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  try {
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -i "${bgMusic}" -filter_complex "[1:a]volume=1.0[nar];[2:a]volume=0.1[bg];[nar][bg]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${finalPath}" 2>/dev/null`);
  } catch {
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" 2>/dev/null`);
  }

  const info = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_format "${finalPath}"`).toString());
  console.log(`\n🎬 DONE: ${parseFloat(info.format.duration).toFixed(1)}s | ${(parseInt(info.format.size) / 1048576).toFixed(1)}MB | ${clipPaths.length} clips`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
