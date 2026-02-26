#!/usr/bin/env npx tsx
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { GoogleGenAI } from '@google/genai';

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
  const refFront = await readFile(resolve(__dirname, '..', 'assets/cosmo-refs/cosmo-ref-front.png'));
  const frame = await readFile(resolve(__dirname, '..', 'output/v8-test/frames/scene-1.png'));

  // Test 1: referenceImages ONLY
  console.log('Test 1: referenceImages only (no starting frame)...');
  try {
    const op = await client.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: 'A small blue robot waves at the camera in a bright colorful workshop. Warm lighting, slow zoom in. (no subtitles)',
      config: {
        aspectRatio: '16:9',
        negativePrompt: 'blurry, distorted, morphing',
        referenceImages: [{
          image: { imageBytes: refFront.toString('base64'), mimeType: 'image/png' },
          referenceType: 'asset',
        }],
      } as any,
    });
    console.log('✅ Test 1 SUCCESS — request accepted');
    // Cancel/don't wait
    process.exit(0);
  } catch (e: any) {
    console.log('❌ Test 1 FAILED:', e.message?.substring(0, 300));
  }

  // Test 2: image only (starting frame)
  console.log('\nTest 2: image only (starting frame, no referenceImages)...');
  try {
    const op = await client.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: 'The robot waves its right arm at the camera. Slow zoom in. Warm lighting. (no subtitles)',
      image: { imageBytes: frame.toString('base64'), mimeType: 'image/png' },
      config: {
        aspectRatio: '16:9',
        negativePrompt: 'blurry, distorted',
      } as any,
    });
    console.log('✅ Test 2 SUCCESS — request accepted');
    process.exit(0);
  } catch (e: any) {
    console.log('❌ Test 2 FAILED:', e.message?.substring(0, 300));
  }

  // Test 3: bare text-to-video
  console.log('\nTest 3: text-to-video only...');
  try {
    const op = await client.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: 'A small blue robot waves at the camera in a colorful workshop.',
    });
    console.log('✅ Test 3 SUCCESS — request accepted');
    process.exit(0);
  } catch (e: any) {
    console.log('❌ Test 3 FAILED:', e.message?.substring(0, 300));
  }

  // Test 4: personGeneration = allow_adult with image
  console.log('\nTest 4: image + personGeneration=allow_adult...');
  try {
    const op = await client.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: 'The robot waves its right arm at the camera. Slow zoom in. (no subtitles)',
      image: { imageBytes: frame.toString('base64'), mimeType: 'image/png' },
      config: {
        aspectRatio: '16:9',
        personGeneration: 'allow_adult',
      } as any,
    });
    console.log('✅ Test 4 SUCCESS');
    process.exit(0);
  } catch (e: any) {
    console.log('❌ Test 4 FAILED:', e.message?.substring(0, 300));
  }
}

main().catch(e => console.error('Fatal:', e.message));
