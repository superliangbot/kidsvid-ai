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
  const refSide = await readFile(resolve(__dirname, '..', 'assets/cosmo-refs/cosmo-ref-side.png'));
  const refTQ = await readFile(resolve(__dirname, '..', 'assets/cosmo-refs/cosmo-ref-three-quarter.png'));

  // Test A: referenceImages WITHOUT negativePrompt  
  console.log('Test A: referenceImages only, no negativePrompt...');
  try {
    const op = await client.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: 'A small blue robot waves at the camera in a bright colorful workshop. Warm lighting, slow zoom in. (no subtitles, no text overlays)',
      config: {
        aspectRatio: '16:9',
        referenceImages: [{
          image: { imageBytes: refFront.toString('base64'), mimeType: 'image/png' },
          referenceType: 'asset',
        }],
      } as any,
    });
    console.log('✅ Test A SUCCESS');
    process.exit(0);
  } catch (e: any) {
    console.log('❌ Test A FAILED:', e.message?.substring(0, 300));
  }

  // Test B: referenceImages with personGeneration
  console.log('\nTest B: referenceImages + personGeneration=allow_adult...');
  try {
    const op = await client.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: 'A small blue robot waves at the camera in a bright colorful workshop.',
      config: {
        aspectRatio: '16:9',
        personGeneration: 'allow_adult',
        referenceImages: [{
          image: { imageBytes: refFront.toString('base64'), mimeType: 'image/png' },
          referenceType: 'asset',
        }],
      } as any,
    });
    console.log('✅ Test B SUCCESS');
    process.exit(0);
  } catch (e: any) {
    console.log('❌ Test B FAILED:', e.message?.substring(0, 300));
  }

  // Test C: 3 referenceImages
  console.log('\nTest C: 3 referenceImages...');
  try {
    const op = await client.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: 'A small blue robot waves at the camera in a bright colorful workshop.',
      config: {
        aspectRatio: '16:9',
        personGeneration: 'allow_adult',
        referenceImages: [
          { image: { imageBytes: refFront.toString('base64'), mimeType: 'image/png' }, referenceType: 'asset' },
          { image: { imageBytes: refSide.toString('base64'), mimeType: 'image/png' }, referenceType: 'asset' },
          { image: { imageBytes: refTQ.toString('base64'), mimeType: 'image/png' }, referenceType: 'asset' },
        ],
      } as any,
    });
    console.log('✅ Test C SUCCESS');
    process.exit(0);
  } catch (e: any) {
    console.log('❌ Test C FAILED:', e.message?.substring(0, 300));
  }
}

main().catch(e => console.error('Fatal:', e.message));
