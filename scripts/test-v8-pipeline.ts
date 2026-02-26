#!/usr/bin/env npx tsx
/**
 * V8 Pipeline Test — Generate a single "Count to 3" mini-video
 * 
 * Tests the full pipeline:
 * 1. Load multi-angle Cosmo references
 * 2. Generate starting frames with Imagen 4
 * 3. Generate clips with Veo 3.1 + referenceImages + starting frame
 * 4. Generate narration with Gemini TTS
 * 5. FFmpeg composite
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

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v8-test');
const REFS_DIR = resolve(__dirname, '..', 'assets', 'cosmo-refs');
const SEED = 42;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Scene definitions — just 3 beats for a quick test
const SCENES = [
  {
    id: 'scene-1',
    description: 'Cosmo stands in a bright colorful workshop, waves hello at the camera',
    motion: 'The single small blue robot waves his right arm at the camera, his antenna glows brighter momentarily. Slow zoom in. Warm lighting. Only one robot in the scene.',
    narration: 'Hi there! I am Cosmo! Let us count together!',
    audioDesc: 'Audio: cheerful chime, soft workshop ambiance, no music. Only one character visible.',
  },
  {
    id: 'scene-2',
    description: 'Cosmo picks up a bright red block from a wooden table',
    motion: 'The single small blue robot reaches forward and picks up a bright red cube from the wooden table, holds it up proudly. Camera at eye level, gentle dolly forward. Only one robot visible.',
    narration: 'One! One red block!',
    audioDesc: 'Audio: soft block pickup sound, workshop ambiance. Only one character.',
  },
  {
    id: 'scene-3',
    description: 'Cosmo places the red block on a stack and picks up a blue block',
    motion: 'The single small blue robot places a red block down, then picks up a blue block and adds it to the stack. He looks at the camera with excitement. Slight camera pan right. Only one robot in the scene.',
    narration: 'Two! Two blocks stacked up!',
    audioDesc: 'Audio: block stacking click, cheerful ambient. Only one character.',
  },
];

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  KidsVid-AI V8 Pipeline Test                   ║');
  console.log('║  3-scene test: Cosmo counts to 2               ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  await mkdir(resolve(OUTPUT_DIR, 'clips'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'frames'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'audio'), { recursive: true });

  // ─── Load reference images ───
  console.log('━━━ Loading Cosmo references ━━━');
  const refPaths = ['cosmo-ref-front.png', 'cosmo-ref-three-quarter.png', 'cosmo-ref-side.png'];
  const referenceImages: any[] = [];

  for (const filename of refPaths) {
    const p = resolve(REFS_DIR, filename);
    if (!existsSync(p)) {
      console.log(`  ⚠️  Missing: ${filename} — run generate-cosmo-refs.ts first`);
      continue;
    }
    const data = await readFile(p);
    referenceImages.push({
      image: { imageBytes: data.toString('base64'), mimeType: 'image/png' },
      referenceType: 'asset',
    });
    console.log(`  ✅ Loaded ${filename} (${(data.length / 1024).toFixed(0)}KB)`);
  }
  console.log(`  📎 ${referenceImages.length} reference images for Veo\n`);

  // ─── Generate starting frames + video clips ───
  const clipPaths: string[] = [];

  for (const scene of SCENES) {
    console.log(`\n━━━ ${scene.id}: ${scene.description.substring(0, 50)}... ━━━`);

    const clipPath = resolve(OUTPUT_DIR, 'clips', `${scene.id}.mp4`);
    const framePath = resolve(OUTPUT_DIR, 'frames', `${scene.id}.png`);

    // Step 1: Generate starting frame with Imagen 4
    if (!existsSync(framePath)) {
      console.log('  🖼️  Generating starting frame (Imagen 4)...');
      try {
        const framePrompt = `${COSMO_IDENTITY.description}. ${scene.description}. Bright colorful workshop with wooden shelves and toys. Pixar-style 3D children's animation, warm lighting, 16:9 aspect ratio composition.`;
        
        const frameResp = await client.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: framePrompt,
          config: {
            numberOfImages: 1,
            aspectRatio: '16:9',
            personGeneration: 'allow_all',
          } as any,
        });

        const img = (frameResp as any).generatedImages?.[0];
        if (img?.image?.imageBytes) {
          const bytes = typeof img.image.imageBytes === 'string'
            ? Buffer.from(img.image.imageBytes, 'base64')
            : Buffer.from(img.image.imageBytes);
          await writeFile(framePath, bytes);
          console.log(`  ✅ Starting frame: ${(bytes.length / 1024).toFixed(0)}KB`);
        } else {
          console.log('  ❌ No image returned');
        }
      } catch (e: any) {
        console.log(`  ❌ Imagen error: ${e.message}`);
      }
      await sleep(3000);
    } else {
      console.log('  ♻️  Using cached starting frame');
    }

    // Step 2: Refine prompt with Gemini
    console.log('  📝 Refining prompt with Gemini...');
    let refinedPrompt = scene.motion;
    try {
      const refineResp = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [{ text: `You are an expert video generation prompt engineer for Google Veo 3.1.

Given this scene for a kids' educational video about counting:
Scene: ${scene.description}
Motion: ${scene.motion}
Audio: ${scene.audioDesc}

Write a polished Veo prompt that will generate an 8-second clip. Rules:
- Do NOT describe the character's appearance (reference images handle that)
- Focus on MOTION, camera movement, and atmosphere
- Keep it to one single moment/action
- Use colon format for any dialogue (no quotation marks)
- Add (no subtitles, no text overlays)
- CRITICAL: Always include "only one robot" or "single character" to prevent duplicate characters
- Include specific audio direction
- Keep under 100 words

Reply with ONLY the refined prompt, nothing else.` }],
        }],
      });
      refinedPrompt = refineResp.text?.trim() || scene.motion;
      console.log(`  ✅ Refined: "${refinedPrompt.substring(0, 80)}..."`);
    } catch (e: any) {
      console.log(`  ⚠️  Prompt refinement failed: ${e.message}, using original`);
    }

    // Step 3: Generate video with Veo 3.1
    if (!existsSync(clipPath)) {
      console.log('  🎬 Generating video with Veo 3.1...');
      try {
        // NOTE: On Gemini API, referenceImages cannot be combined with:
        //   - negativePrompt
        //   - image (starting frame)
        //   - seed
        // So we use referenceImages for character consistency (primary strategy)
        // and fall back to image-to-video if referenceImages fails.
        
        const veoRequest: any = {
          model: 'veo-3.1-generate-preview',
          prompt: refinedPrompt,
          config: {
            aspectRatio: '16:9',
            personGeneration: 'allow_adult', // required for referenceImages
          },
        };

        // Strategy: use referenceImages for character consistency
        if (referenceImages.length > 0) {
          veoRequest.config.referenceImages = referenceImages;
        } else if (existsSync(framePath)) {
          // Fallback: use starting frame if no reference images
          const frameData = await readFile(framePath);
          veoRequest.image = {
            imageBytes: frameData.toString('base64'),
            mimeType: 'image/png',
          };
          veoRequest.config.negativePrompt = COSMO_IDENTITY.negativePrompt;
        }

        let operation = await client.models.generateVideos(veoRequest);

        let attempts = 0;
        while (!operation.done) {
          if (attempts++ >= 90) throw new Error('Timed out after 15 min');
          process.stdout.write('.');
          await sleep(10000);
          operation = await client.operations.getVideosOperation({ operation });
        }
        console.log('');

        const video = operation.response?.generatedVideos?.[0]?.video;
        if (!video) throw new Error('No video returned');

        // Download
        const uri = typeof video === 'string' ? video : (video as any).uri;
        if (uri) {
          const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
          const buf = Buffer.from(await res.arrayBuffer());
          await writeFile(clipPath, buf);
          console.log(`  ✅ Video: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
        } else {
          // Try video.videoBytes
          const bytes = (video as any).videoBytes;
          if (bytes) {
            const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'base64') : Buffer.from(bytes);
            await writeFile(clipPath, buf);
            console.log(`  ✅ Video: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
          } else {
            throw new Error('No downloadable video');
          }
        }
      } catch (e: any) {
        console.log(`  ❌ Veo error: ${e.message}`);
      }
      // Wait between Veo calls
      await sleep(5000);
    } else {
      console.log('  ♻️  Using cached clip');
    }

    if (existsSync(clipPath)) clipPaths.push(clipPath);
  }

  // ─── Generate narration ───
  console.log('\n━━━ Generating narration (Gemini TTS) ━━━');
  const narrationPaths: string[] = [];

  for (const scene of SCENES) {
    const narPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}-narration.wav`);
    if (existsSync(narPath)) {
      console.log(`  ♻️  Cached: ${scene.id}`);
      narrationPaths.push(narPath);
      continue;
    }

    console.log(`  🗣️  TTS: "${scene.narration}"`);
    try {
      const ttsResp = await client.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: `Say in a cheerful, warm, kid-friendly voice: ${scene.narration}` }] }],
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
        // PCM s16le 24kHz mono → WAV via ffmpeg
        const pcmPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}-raw.pcm`);
        await writeFile(pcmPath, Buffer.from(audioData, 'base64'));
        execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" "${narPath}" 2>/dev/null`);
        console.log(`  ✅ ${scene.id}: narration saved`);
        narrationPaths.push(narPath);
      } else {
        console.log(`  ❌ No audio returned`);
      }
    } catch (e: any) {
      console.log(`  ❌ TTS error: ${e.message}`);
    }
    await sleep(2000);
  }

  // ─── Composite ───
  console.log('\n━━━ Final Composite (FFmpeg) ━━━');

  if (clipPaths.length === 0) {
    console.log('  ❌ No clips generated, cannot composite');
    return;
  }

  // Create concat list
  const concatList = clipPaths.map(p => `file '${p}'`).join('\n');
  const concatPath = resolve(OUTPUT_DIR, 'concat.txt');
  await writeFile(concatPath, concatList);

  // Concat video clips
  const concatVideo = resolve(OUTPUT_DIR, 'concat-video.mp4');
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c copy "${concatVideo}" 2>/dev/null`);
    console.log(`  ✅ Concatenated ${clipPaths.length} clips`);
  } catch {
    // Try re-encoding
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c:v libx264 -c:a aac "${concatVideo}" 2>&1 | tail -2`);
  }

  // Mix narration over video (if we have both)
  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  if (narrationPaths.length > 0 && existsSync(concatVideo)) {
    // Concat narrations
    const narConcatList = narrationPaths.map(p => `file '${p}'`).join('\n');
    const narConcatPath = resolve(OUTPUT_DIR, 'nar-concat.txt');
    await writeFile(narConcatPath, narConcatList);
    const narConcatAudio = resolve(OUTPUT_DIR, 'narration-full.wav');
    try {
      execSync(`ffmpeg -y -f concat -safe 0 -i "${narConcatPath}" "${narConcatAudio}" 2>/dev/null`);
    } catch { /* ignore */ }

    if (existsSync(narConcatAudio)) {
      try {
        execSync(`ffmpeg -y -i "${concatVideo}" -i "${narConcatAudio}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" 2>/dev/null`);
        console.log(`  ✅ Final video with narration`);
      } catch {
        execSync(`cp "${concatVideo}" "${finalPath}"`);
        console.log(`  ⚠️  Narration mix failed, using video-only`);
      }
    } else {
      execSync(`cp "${concatVideo}" "${finalPath}"`);
    }
  } else {
    if (existsSync(concatVideo)) execSync(`cp "${concatVideo}" "${finalPath}"`);
  }

  // ─── Summary ───
  if (existsSync(finalPath)) {
    const info = execSync(`ffprobe -v quiet -print_format json -show_format "${finalPath}"`).toString();
    const parsed = JSON.parse(info);
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║  V8 Test Complete!                              ║`);
    console.log(`╠════════════════════════════════════════════════╣`);
    console.log(`║  Duration: ${parseFloat(parsed.format.duration).toFixed(1)}s`);
    console.log(`║  Size: ${(parseInt(parsed.format.size) / 1024 / 1024).toFixed(1)}MB`);
    console.log(`║  Clips: ${clipPaths.length}/${SCENES.length}`);
    console.log(`║  Narration: ${narrationPaths.length}/${SCENES.length}`);
    console.log(`║  Output: ${finalPath}`);
    console.log(`╚════════════════════════════════════════════════╝`);
  }
}

main().catch(e => {
  console.error('\n💥 Fatal:', e.message);
  process.exit(1);
});
