#!/usr/bin/env npx tsx
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { GoogleGenAI } from '@google/genai';

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  // List all models, filter for new ones
  console.log('=== Searching for Nano Banana 2 / Gemini 3.1 Flash Image ===\n');
  const models = client.models.list();
  const allNames: string[] = [];
  for await (const m of models) {
    const name = (m as any).name || '';
    allNames.push(name);
    if (name.includes('3.1') || name.includes('banana') || name.includes('flash-image')) {
      console.log('📌', name);
    }
  }

  // Direct model ID checks
  console.log('\n=== Direct model ID checks ===');
  const candidates = [
    'gemini-3.1-flash-image-preview',
    'nano-banana-2-preview',
    'gemini-3.1-flash-image',
    'nano-banana-2',
  ];
  for (const id of candidates) {
    try {
      const m = await client.models.get({ model: id });
      console.log(`✅ ${id}: AVAILABLE`);
    } catch (e: any) {
      console.log(`❌ ${id}: ${e.message?.substring(0, 100)}`);
    }
  }

  // Try generating an image with it
  console.log('\n=== Test image generation ===');
  try {
    const resp = await client.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ role: 'user', parts: [{ text: 'Generate an image of a small cute blue robot with brown eyes and a yellow antenna, Pixar style, white background' }] }],
      config: { responseModalities: ['IMAGE'] } as any,
    });
    const parts = (resp as any).candidates?.[0]?.content?.parts;
    if (parts?.some((p: any) => p.inlineData)) {
      console.log('✅ Image generation works! Nano Banana 2 is live on our API key!');
    } else {
      console.log('⚠️ Response but no image:', JSON.stringify(parts?.map((p: any) => Object.keys(p))));
    }
  } catch (e: any) {
    console.log('❌ Generation failed:', e.message?.substring(0, 200));
  }

  // Also try the generateImages endpoint
  console.log('\n=== Test generateImages endpoint ===');
  try {
    const resp = await client.models.generateImages({
      model: 'gemini-3.1-flash-image-preview',
      prompt: 'A small cute blue robot, Pixar style',
      config: { numberOfImages: 1 } as any,
    });
    console.log('✅ generateImages works!');
  } catch (e: any) {
    console.log('❌ generateImages:', e.message?.substring(0, 200));
  }
}

main().catch(e => console.error('Fatal:', e.message));
