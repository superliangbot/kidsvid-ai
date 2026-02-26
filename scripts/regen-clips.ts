#!/usr/bin/env npx tsx
/**
 * Regenerate count-5, count-7, count-9 (weak consistency) + count-10 (missing)
 * Then re-assemble the full episode.
 */
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

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v8-count-to-10');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  // Load references
  const refs: any[] = [];
  for (const f of ['cosmo-ref-front.png', 'cosmo-ref-three-quarter.png', 'cosmo-ref-side.png']) {
    const data = await readFile(resolve(__dirname, '..', 'assets/cosmo-refs', f));
    refs.push({ image: { imageBytes: data.toString('base64'), mimeType: 'image/png' }, referenceType: 'asset' });
  }
  console.log(`✅ Loaded ${refs.length} reference images\n`);

  // Clips to regenerate — fixed prompts emphasizing open eyes, consistent expression
  const scenes = [
    { id: 'count-5', prompt: 'A single small blue robot proudly holds up a purple block, then carefully adds it to the top of a stack of 4 colorful blocks on a wooden platform. Eye-level camera, gentle dolly forward. Warm workshop lighting with wooden shelves and toys. Only one robot in the scene, eyes wide open, excited joyful expression. (no subtitles, no text overlays) Audio: soft block placement click, gentle cheerful ambient.' },
    { id: 'count-7', prompt: 'A single small blue robot adds a pink block to the top of a stack of 6 colorful blocks on a wooden platform. It holds the block carefully and places it with pride. Eye-level camera, slow gentle dolly. Bright colorful workshop with warm lighting. Only one robot, eyes wide open and perfectly round, joyful expression. (no subtitles, no text overlays) Audio: soft block click, warm ambient.' },
    { id: 'count-9', prompt: 'A single small blue robot adds a gold block to the top of a tall stack of 8 colorful blocks. It reaches up high to place the block carefully, then looks at the camera with excitement. Eye-level camera, gentle dolly forward. Bright colorful workshop, warm lighting. Only one robot, eyes wide open, thrilled expression. (no subtitles, no text overlays) Audio: block stacking click, building excitement ambient.' },
    { id: 'count-10', prompt: 'A single small blue robot carefully adds a shimmering silver block to the very top of a tall tower of 9 colorful stacked blocks. It steps back and looks at the camera with pure joy, arms raised in triumph. Eye-level camera, slow zoom out to reveal the full tower. Bright colorful workshop, warm golden lighting. Only one robot in the scene, eyes wide open. (no subtitles, no text overlays) Audio: triumphant block placement, sparkle sound, gentle celebration.' },
  ];

  // Also generate count-10 narration if missing
  const nar10Path = resolve(OUTPUT_DIR, 'audio', 'count-10.wav');
  if (!existsSync(nar10Path)) {
    console.log('🗣️  Generating count-10 narration...');
    try {
      const ttsResp = await client.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: 'Say in a cheerful, warm, enthusiastic kid-friendly voice with clear enunciation: Ten! Ten blocks! We did it! We counted all the way to ten!' }] }],
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
        const pcmPath = resolve(OUTPUT_DIR, 'audio', 'count-10-raw.pcm');
        await writeFile(pcmPath, Buffer.from(audioData, 'base64'));
        execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" "${nar10Path}" 2>/dev/null`);
        console.log('✅ count-10 narration saved\n');
      }
    } catch (e: any) {
      console.log(`❌ TTS error: ${e.message}\n`);
    }
  }

  // Generate clips
  for (const scene of scenes) {
    const outPath = resolve(OUTPUT_DIR, 'clips', `${scene.id}.mp4`);
    console.log(`🎬 Generating ${scene.id}...`);

    try {
      let op = await client.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: scene.prompt,
        config: {
          aspectRatio: '16:9',
          personGeneration: 'allow_adult',
          referenceImages: refs,
        } as any,
      });

      let attempts = 0;
      while (!op.done) {
        if (attempts++ >= 90) throw new Error('Timed out after 15 min');
        process.stdout.write('.');
        await sleep(10000);
        op = await client.operations.getVideosOperation({ operation: op });
      }
      console.log('');

      const video = op.response?.generatedVideos?.[0]?.video;
      if (!video) throw new Error('No video returned');

      const uri = typeof video === 'string' ? video : (video as any).uri;
      if (!uri) throw new Error('No video URI');

      const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(outPath, buf);
      console.log(`✅ ${scene.id}: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
    } catch (e: any) {
      console.log(`❌ ${scene.id}: ${e.message?.substring(0, 150)}`);
    }
    await sleep(5000);
  }

  // ─── Re-assemble episode ───
  console.log('\n━━━ Re-assembling Episode ━━━');

  const clipOrder = ['intro', 'count-1', 'count-2', 'count-3', 'count-4', 'count-5',
    'count-6', 'count-7', 'count-8', 'count-9', 'count-10', 'celebration'];
  const narOrder = clipOrder;

  const clipPaths = clipOrder
    .map(id => resolve(OUTPUT_DIR, 'clips', `${id}.mp4`))
    .filter(p => existsSync(p));
  const narPaths = narOrder
    .map(id => resolve(OUTPUT_DIR, 'audio', `${id}.wav`))
    .filter(p => existsSync(p));

  console.log(`Clips: ${clipPaths.length}/12 | Narrations: ${narPaths.length}/12`);

  // Concat video
  await writeFile(resolve(OUTPUT_DIR, 'concat.txt'), clipPaths.map(p => `file '${p}'`).join('\n'));
  const concatVideo = resolve(OUTPUT_DIR, 'concat-video.mp4');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'concat.txt')}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -ar 44100 -ac 2 -r 24 -s 1280x720 "${concatVideo}" 2>/dev/null`);
  console.log('✅ Video concatenated');

  // Concat narrations
  await writeFile(resolve(OUTPUT_DIR, 'nar-concat.txt'), narPaths.map(p => `file '${p}'`).join('\n'));
  const narFull = resolve(OUTPUT_DIR, 'narration-full.wav');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'nar-concat.txt')}" "${narFull}" 2>/dev/null`);

  // Get duration for bg music
  const durStr = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${concatVideo}"`).toString().trim();
  const dur = parseFloat(durStr) || 120;

  // Generate bg ambient
  const bgMusic = resolve(OUTPUT_DIR, 'bg-music.wav');
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=261:duration=${dur}" -af "volume=0.05,atempo=0.5" -ar 44100 -ac 1 "${bgMusic}" 2>/dev/null`);

  // Final mix
  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  try {
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -i "${bgMusic}" -filter_complex "[1:a]volume=1.0[nar];[2:a]volume=0.15[bg];[nar][bg]amix=inputs=2:duration=shortest[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${finalPath}" 2>/dev/null`);
    console.log('✅ Final episode assembled with narration + music');
  } catch {
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" 2>/dev/null`);
    console.log('✅ Final episode assembled with narration (no bg music)');
  }

  // Stats
  const info = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_format "${finalPath}"`).toString());
  console.log(`\n🎬 DONE: ${parseFloat(info.format.duration).toFixed(1)}s | ${(parseInt(info.format.size) / 1048576).toFixed(1)}MB | ${clipPaths.length} clips`);

  try {
    execSync(`openclaw system event --text "Done: Count to 10 episode re-assembled with ${clipPaths.length}/12 clips, ${parseFloat(info.format.duration).toFixed(0)}s" --mode now 2>/dev/null`);
  } catch {}
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
