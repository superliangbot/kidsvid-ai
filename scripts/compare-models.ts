#!/usr/bin/env npx tsx
/**
 * Model Comparison Script
 * 
 * Generates the SAME scene across all available Veo models + tests Imagen 4 for thumbnails
 * + tests Gemini TTS — so we can compare quality, cost, and character consistency.
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'model-comparison');
const POLL_INTERVAL = 10_000;
const POLL_MAX = 90; // 15 min max wait

// ═══════════════════════════════════════════════════
// TEST PROMPTS
// ═══════════════════════════════════════════════════

const COSMO = `Cosmo, a small cute blue robot with big round brown eyes, stubby arms, a glowing yellow antenna on his round head, and a warm smile`;

const VIDEO_PROMPT = `${COSMO} stands in a bright colorful workshop with wooden shelves and toys. He picks up a bright red cube with both hands, lifts it up proudly showing it to the camera, then places it down on a wooden platform. He looks at the camera and holds up one finger. Close-up shot, warm lighting, Pixar-style 3D children's animation.`;

const THUMBNAIL_PROMPT = `A cute blue robot named Cosmo with big round brown eyes, a glowing yellow antenna, standing next to a colorful tower of 10 numbered blocks (1-10). Bold text at top reads "Count to 10!" in a fun playful font. Bright colorful children's illustration style, YouTube thumbnail.`;

const TTS_TEXT = `One! One red block. This is where our tower begins!`;

// ═══════════════════════════════════════════════════
// VEO MODELS TO TEST
// ═══════════════════════════════════════════════════

const VEO_MODELS = [
  { id: 'veo-2.0-generate-001', name: 'Veo 2', costPerSec: 0.35, supportsAudio: false },
  { id: 'veo-3.0-fast-generate-001', name: 'Veo 3 Fast', costPerSec: 0.15, supportsAudio: true },
  { id: 'veo-3.0-generate-001', name: 'Veo 3', costPerSec: 0.40, supportsAudio: true },
  { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast', costPerSec: 0.15, supportsAudio: true },
  { id: 'veo-3.1-generate-preview', name: 'Veo 3.1', costPerSec: 0.40, supportsAudio: true },
];

const IMAGEN_MODELS = [
  { id: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast' },
  { id: 'imagen-4.0-generate-001', name: 'Imagen 4' },
  { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra' },
];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════
// VIDEO GENERATION
// ═══════════════════════════════════════════════════

async function testVeoModel(
  client: any, model: typeof VEO_MODELS[0], refBase64: string | null
) {
  const outPath = resolve(OUTPUT_DIR, 'video', `${model.id}.mp4`);
  if (existsSync(outPath)) {
    const size = (await readFile(outPath)).length;
    if (size > 50_000) {
      console.log(`  ♻️  Cached: ${model.name} (${(size / 1024 / 1024).toFixed(1)}MB)`);
      return { model: model.name, status: 'cached', size };
    }
  }

  console.log(`  🎬 Generating with ${model.name} (${model.id})...`);
  const startTime = Date.now();

  try {
    // Build request — Veo 2 may not support referenceImages or generateAudio
    const request: any = {
      model: model.id,
      prompt: VIDEO_PROMPT,
      config: {
        aspectRatio: '16:9',
        durationSeconds: 8,
        personGeneration: 'allow_all',
      },
    };

    // Add reference image for models that support it (Veo 3+)
    if (refBase64 && !model.id.includes('veo-2')) {
      request.referenceImages = [{
        image: { imageBytes: refBase64, mimeType: 'image/png' },
        operation: 'SUBJECT_REFERENCE',
      }];
    }

    // Enable audio for models that support it
    if (model.supportsAudio) {
      request.config.generateAudio = true;
    }

    let operation = await client.models.generateVideos(request);

    let attempts = 0;
    while (!operation.done) {
      if (attempts++ >= POLL_MAX) throw new Error('Timed out after 15 min');
      process.stdout.write('.');
      await sleep(POLL_INTERVAL);
      operation = await client.operations.getVideosOperation({ operation });
    }
    console.log('');

    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) throw new Error('No video in response');

    const uri = typeof video === 'string' ? video : (video as any).uri;
    const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(outPath, buffer);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const cost = (8 * model.costPerSec).toFixed(2);
    console.log(`  ✅ ${model.name}: ${(buffer.length / 1024 / 1024).toFixed(1)}MB, ${elapsed}s, ~$${cost}`);

    return { model: model.name, status: 'success', size: buffer.length, elapsed: +elapsed, cost: +cost };
  } catch (e: any) {
    console.log(`  ❌ ${model.name}: ${e.message}`);
    return { model: model.name, status: 'error', error: e.message };
  }
}

// ═══════════════════════════════════════════════════
// IMAGE GENERATION (THUMBNAILS)
// ═══════════════════════════════════════════════════

async function testImagenModel(client: any, model: typeof IMAGEN_MODELS[0]) {
  const outPath = resolve(OUTPUT_DIR, 'thumbnails', `${model.id}.png`);
  if (existsSync(outPath)) {
    console.log(`  ♻️  Cached: ${model.name}`);
    return { model: model.name, status: 'cached' };
  }

  console.log(`  🖼️  Generating thumbnail with ${model.name}...`);
  try {
    const response = await client.models.generateImages({
      model: model.id,
      prompt: THUMBNAIL_PROMPT,
      config: {
        numberOfImages: 1,
        aspectRatio: '16:9',
      },
    });

    const image = response.generatedImages?.[0];
    if (!image) throw new Error('No image returned');

    // Image could be base64 or have a URI
    if (image.image?.imageBytes) {
      const buffer = Buffer.from(image.image.imageBytes, 'base64');
      await writeFile(outPath, buffer);
      console.log(`  ✅ ${model.name}: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
    } else if (image.image?.uri) {
      const res = await fetch(image.image.uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(outPath, buffer);
      console.log(`  ✅ ${model.name}: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
    } else {
      throw new Error('Unknown image format: ' + JSON.stringify(Object.keys(image)));
    }

    return { model: model.name, status: 'success' };
  } catch (e: any) {
    console.log(`  ❌ ${model.name}: ${e.message}`);
    return { model: model.name, status: 'error', error: e.message };
  }
}

// ═══════════════════════════════════════════════════
// TTS TEST
// ═══════════════════════════════════════════════════

async function testGeminiTTS(client: any) {
  const outPath = resolve(OUTPUT_DIR, 'tts', 'gemini-tts.wav');
  if (existsSync(outPath)) {
    console.log(`  ♻️  Cached: Gemini TTS`);
    return { status: 'cached' };
  }

  console.log(`  🗣️  Testing Gemini 2.5 Flash TTS...`);
  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: TTS_TEXT }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Kore',  // Try a warm/friendly voice
            },
          },
        },
      },
    });

    // Extract audio from response
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!audioData) throw new Error('No audio in response: ' + JSON.stringify(response.candidates?.[0]?.content?.parts?.map((p: any) => Object.keys(p))));

    const buffer = Buffer.from(audioData.data, 'base64');
    await writeFile(outPath, buffer);
    console.log(`  ✅ Gemini TTS: ${(buffer.length / 1024).toFixed(0)}KB`);
    return { status: 'success', size: buffer.length };
  } catch (e: any) {
    console.log(`  ❌ Gemini TTS: ${e.message}`);
    return { status: 'error', error: e.message };
  }
}

// ═══════════════════════════════════════════════════
// REFERENCE IMAGE (generate fresh with Imagen 4)
// ═══════════════════════════════════════════════════

async function generateReferenceImage(client: any): Promise<string> {
  const refPath = resolve(OUTPUT_DIR, 'cosmo_reference.png');
  if (existsSync(refPath)) {
    console.log('♻️  Using cached reference image');
    return (await readFile(refPath)).toString('base64');
  }

  console.log('🎨 Generating Cosmo reference image with Imagen 4...');
  const response = await client.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: `Character reference sheet of ${COSMO}. Full body front view, simple white background. Pixar-style 3D children's animation character design.`,
    config: {
      numberOfImages: 1,
      aspectRatio: '1:1',
    },
  });

  const image = response.generatedImages?.[0];
  if (!image?.image?.imageBytes) {
    // Try URI
    if (image?.image?.uri) {
      const res = await fetch(image.image.uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(refPath, buffer);
      return buffer.toString('base64');
    }
    throw new Error('Could not get reference image');
  }
  
  const buffer = Buffer.from(image.image.imageBytes, 'base64');
  await writeFile(refPath, buffer);
  console.log(`  ✅ Reference: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
  return image.image.imageBytes;
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   KidsVid-AI Model Comparison Test         ║');
  console.log('║   Same prompt → All available models       ║');
  console.log('╚════════════════════════════════════════════╝\n');

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  // Create output dirs
  await mkdir(resolve(OUTPUT_DIR, 'video'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'thumbnails'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'tts'), { recursive: true });

  const results: any = { video: [], thumbnails: [], tts: null };

  // ─── 1. Generate reference image ───
  console.log('━━━ Step 1: Reference Image (Imagen 4) ━━━');
  let refBase64: string | null = null;
  try {
    refBase64 = await generateReferenceImage(client);
  } catch (e: any) {
    console.log(`⚠️  Reference image failed: ${e.message} — will test Veo without ref`);
  }

  // ─── 2. Test all Veo models ───
  console.log('\n━━━ Step 2: Video Generation (5 Veo models) ━━━');
  console.log(`Prompt: "${VIDEO_PROMPT.substring(0, 80)}..."\n`);

  for (const model of VEO_MODELS) {
    const result = await testVeoModel(client, model, refBase64);
    results.video.push(result);

    // Rate limit between Veo calls (2.5 min)
    if (model !== VEO_MODELS[VEO_MODELS.length - 1]) {
      const waitSec = 150;
      console.log(`  ⏳ Waiting ${waitSec}s before next model...\n`);
      await sleep(waitSec * 1000);
    }
  }

  // ─── 3. Test Imagen models for thumbnails ───
  console.log('\n━━━ Step 3: Thumbnail Generation (Imagen 4 variants) ━━━');
  console.log(`Prompt: "${THUMBNAIL_PROMPT.substring(0, 80)}..."\n`);

  for (const model of IMAGEN_MODELS) {
    const result = await testImagenModel(client, model);
    results.thumbnails.push(result);
    await sleep(5000); // brief pause
  }

  // ─── 4. Test Gemini TTS ───
  console.log('\n━━━ Step 4: TTS (Gemini 2.5 Flash) ━━━');
  console.log(`Text: "${TTS_TEXT}"\n`);
  results.tts = await testGeminiTTS(client);

  // ─── 5. Summary ───
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║               RESULTS SUMMARY              ║');
  console.log('╚════════════════════════════════════════════╝\n');

  console.log('VIDEO MODELS:');
  for (const r of results.video) {
    const icon = r.status === 'success' ? '✅' : r.status === 'cached' ? '♻️' : '❌';
    console.log(`  ${icon} ${r.model}: ${r.status}${r.cost ? ` | ~$${r.cost}` : ''}${r.elapsed ? ` | ${r.elapsed}s` : ''}${r.error ? ` | ${r.error}` : ''}`);
  }

  console.log('\nTHUMBNAIL MODELS:');
  for (const r of results.thumbnails) {
    const icon = r.status === 'success' ? '✅' : r.status === 'cached' ? '♻️' : '❌';
    console.log(`  ${icon} ${r.model}: ${r.status}${r.error ? ` | ${r.error}` : ''}`);
  }

  console.log(`\nTTS: ${results.tts?.status}${results.tts?.error ? ` | ${results.tts.error}` : ''}`);

  // Save results
  await writeFile(resolve(OUTPUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\n📁 All outputs saved to: ${OUTPUT_DIR}`);
  console.log('   Review the video/ folder to compare quality side-by-side!');

  // ─── 6. Probe video files ───
  console.log('\n━━━ Video File Details ━━━');
  const { execSync } = await import('child_process');
  const videoDir = resolve(OUTPUT_DIR, 'video');
  for (const model of VEO_MODELS) {
    const path = resolve(videoDir, `${model.id}.mp4`);
    if (existsSync(path)) {
      try {
        const info = execSync(
          `ffprobe -v quiet -print_format json -show_format -show_streams "${path}" 2>/dev/null`
        ).toString();
        const parsed = JSON.parse(info);
        const vs = parsed.streams?.find((s: any) => s.codec_type === 'video');
        const as = parsed.streams?.find((s: any) => s.codec_type === 'audio');
        console.log(`  ${model.name}:`);
        console.log(`    Video: ${vs?.width}x${vs?.height} ${vs?.codec_name} @ ${vs?.r_frame_rate}fps`);
        if (as) console.log(`    Audio: ${as?.codec_name} ${as?.sample_rate}Hz ${as?.channels}ch`);
        else console.log(`    Audio: none`);
        console.log(`    Duration: ${parseFloat(parsed.format?.duration || 0).toFixed(1)}s | Size: ${(parseInt(parsed.format?.size || 0) / 1024 / 1024).toFixed(1)}MB`);
      } catch {}
    }
  }
}

main().catch(e => {
  console.error('\n💥 Fatal:', e.message);
  process.exit(1);
});
