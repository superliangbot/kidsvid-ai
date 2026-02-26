#!/usr/bin/env npx tsx
/**
 * Final pass: regenerate count-9 and count-10 with better prompts,
 * then test Nano Banana 2 for Cosmo reference generation.
 */
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile, mkdir } from 'fs/promises';
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
  console.log(`✅ ${refs.length} references loaded\n`);

  // ─── Part 1: Regenerate count-9 and count-10 ───
  console.log('━━━ Part 1: Regenerate weak clips ━━━\n');

  const scenes = [
    { id: 'count-9', prompt: 'A single small blue robot excitedly adds a gold block to the top of a tall stack of 8 colorful blocks. The robot bounces with anticipation, eyes wide open and sparkling, huge joyful smile. It carefully places the gold block and pumps its little arms in excitement. Eye-level camera, gentle dolly forward. Bright colorful workshop with warm golden lighting, wooden shelves with toys. Only one robot in the entire scene, front-facing. (no subtitles, no text overlays) Audio: exciting block placement, ascending chime, building energy ambient.' },
    { id: 'count-10', prompt: 'A single small blue robot triumphantly places a shimmering silver block on top of a tall tower of 9 colorful stacked blocks, completing the tower of 10. The robot steps back with arms raised high in victory, face fully visible to camera, eyes wide open with pure joy, biggest smile. Camera slowly zooms out to reveal the complete colorful tower. Bright colorful workshop bathed in warm golden light. Only one robot, facing the camera. (no subtitles, no text overlays) Audio: triumphant fanfare, sparkle sounds, celebration.' },
  ];

  for (const scene of scenes) {
    const outPath = resolve(OUTPUT_DIR, 'clips', `${scene.id}.mp4`);
    console.log(`🎬 Regenerating ${scene.id}...`);

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
      await writeFile(outPath, buf);
      console.log(`✅ ${scene.id}: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
    } catch (e: any) {
      console.log(`❌ ${scene.id}: ${e.message?.substring(0, 150)}`);
    }
    await sleep(5000);
  }

  // ─── Part 2: Test Nano Banana 2 for Cosmo ───
  console.log('\n━━━ Part 2: Nano Banana 2 Test ━━━\n');

  const nb2Dir = resolve(__dirname, '..', 'output', 'nano-banana-2-test');
  await mkdir(nb2Dir, { recursive: true });

  // Test 1: Single Cosmo image
  console.log('🍌 Test 1: Single Cosmo image...');
  try {
    const resp = await client.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ role: 'user', parts: [{ text: `Generate an image of ${COSMO_IDENTITY.description}. Full body front view, simple white background, character design reference sheet, centered composition, studio lighting. High quality, 4K.` }] }],
      config: { responseModalities: ['IMAGE'] } as any,
    });
    const imgPart = resp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (imgPart) {
      const buf = Buffer.from((imgPart as any).inlineData.data, 'base64');
      await writeFile(resolve(nb2Dir, 'cosmo-front-nb2.png'), buf);
      console.log(`✅ Cosmo front: ${(buf.length / 1024).toFixed(0)}KB`);
    }
  } catch (e: any) {
    console.log(`❌ ${e.message?.substring(0, 150)}`);
  }

  await sleep(3000);

  // Test 2: Multi-angle consistency (one conversation)
  console.log('\n🍌 Test 2: Multi-angle in one conversation...');
  try {
    const resp = await client.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ role: 'user', parts: [{ text: `Generate a character reference sheet showing the same character from 3 angles (front view, side view, 3/4 view). The character is: ${COSMO_IDENTITY.description}. All three views should show the EXACT same character with consistent colors, proportions, and details. Simple white background, studio lighting, character design sheet layout. High quality.` }] }],
      config: { responseModalities: ['IMAGE'] } as any,
    });
    const imgPart = resp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (imgPart) {
      const buf = Buffer.from((imgPart as any).inlineData.data, 'base64');
      await writeFile(resolve(nb2Dir, 'cosmo-turnaround-nb2.png'), buf);
      console.log(`✅ Cosmo turnaround: ${(buf.length / 1024).toFixed(0)}KB`);
    }
  } catch (e: any) {
    console.log(`❌ ${e.message?.substring(0, 150)}`);
  }

  await sleep(3000);

  // Test 3: Scene starting frame
  console.log('\n🍌 Test 3: Scene starting frame...');
  try {
    const resp = await client.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ role: 'user', parts: [{ text: `Generate an image of ${COSMO_IDENTITY.description} standing in a bright colorful workshop with wooden shelves and toys, holding up a red block proudly. Warm lighting, Pixar-style 3D animation, 16:9 aspect ratio composition. High quality, vibrant colors.` }] }],
      config: { responseModalities: ['IMAGE'] } as any,
    });
    const imgPart = resp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (imgPart) {
      const buf = Buffer.from((imgPart as any).inlineData.data, 'base64');
      await writeFile(resolve(nb2Dir, 'cosmo-scene-nb2.png'), buf);
      console.log(`✅ Scene frame: ${(buf.length / 1024).toFixed(0)}KB`);
    }
  } catch (e: any) {
    console.log(`❌ ${e.message?.substring(0, 150)}`);
  }

  // ─── Part 3: Re-assemble episode ───
  console.log('\n━━━ Part 3: Re-assembling episode ━━━');

  const clipOrder = ['intro', 'count-1', 'count-2', 'count-3', 'count-4', 'count-5',
    'count-6', 'count-7', 'count-8', 'count-9', 'count-10', 'celebration'];
  const clipPaths = clipOrder.map(id => resolve(OUTPUT_DIR, 'clips', `${id}.mp4`)).filter(p => existsSync(p));
  const narPaths = clipOrder.map(id => resolve(OUTPUT_DIR, 'audio', `${id}.wav`)).filter(p => existsSync(p));

  console.log(`Clips: ${clipPaths.length}/12 | Narrations: ${narPaths.length}/12`);

  await writeFile(resolve(OUTPUT_DIR, 'concat.txt'), clipPaths.map(p => `file '${p}'`).join('\n'));
  const concatVideo = resolve(OUTPUT_DIR, 'concat-video.mp4');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'concat.txt')}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -ar 44100 -ac 2 -r 24 -s 1280x720 "${concatVideo}" 2>/dev/null`);

  await writeFile(resolve(OUTPUT_DIR, 'nar-concat.txt'), narPaths.map(p => `file '${p}'`).join('\n'));
  const narFull = resolve(OUTPUT_DIR, 'narration-full.wav');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'nar-concat.txt')}" "${narFull}" 2>/dev/null`);

  const durStr = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${concatVideo}"`).toString().trim();
  const bgMusic = resolve(OUTPUT_DIR, 'bg-music.wav');
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=261:duration=${parseFloat(durStr)}" -af "volume=0.05,atempo=0.5" -ar 44100 -ac 1 "${bgMusic}" 2>/dev/null`);

  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  try {
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -i "${bgMusic}" -filter_complex "[1:a]volume=1.0[nar];[2:a]volume=0.15[bg];[nar][bg]amix=inputs=2:duration=shortest[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${finalPath}" 2>/dev/null`);
  } catch {
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFull}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" 2>/dev/null`);
  }

  const info = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_format "${finalPath}"`).toString());
  console.log(`\n🎬 Episode: ${parseFloat(info.format.duration).toFixed(1)}s | ${(parseInt(info.format.size) / 1048576).toFixed(1)}MB | ${clipPaths.length} clips`);

  try { execSync(`openclaw system event --text "Done: Final episode pass complete — ${clipPaths.length}/12 clips, NB2 tested" --mode now 2>/dev/null`); } catch {}
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
