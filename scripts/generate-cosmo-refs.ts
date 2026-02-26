#!/usr/bin/env npx tsx
/**
 * Generate Cosmo Multi-Angle Reference Sheet
 * 
 * Uses Imagen 4 to generate Cosmo from multiple angles, then uses Gemini
 * to pick the most consistent candidates across all angles.
 * 
 * Output: assets/cosmo-ref-{front,three-quarter,side}.png (the 3 best for Veo referenceImages)
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { COSMO_IDENTITY, COSMO_REFERENCE_ANGLES } from '../src/characters/cosmo.js';

const ASSETS_DIR = resolve(__dirname, '..', 'assets', 'cosmo-refs');
const CANDIDATES_DIR = resolve(ASSETS_DIR, 'candidates');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Cosmo Multi-Angle Reference Generator     ║');
  console.log('╚════════════════════════════════════════════╝\n');

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  await mkdir(CANDIDATES_DIR, { recursive: true });

  // ─── Step 1: Generate 4 candidates per angle ───
  const angles: Array<{ key: string; name: string; prompt: string }> = [
    { key: 'front', name: 'Front View', prompt: COSMO_REFERENCE_ANGLES.front },
    { key: 'three-quarter', name: '3/4 View', prompt: COSMO_REFERENCE_ANGLES.threeQuarter },
    { key: 'side', name: 'Side Profile', prompt: COSMO_REFERENCE_ANGLES.side },
    { key: 'back', name: 'Back View', prompt: COSMO_REFERENCE_ANGLES.back },
    { key: 'face', name: 'Face Close-up', prompt: COSMO_REFERENCE_ANGLES.faceCloseup },
  ];

  const allCandidates: Record<string, string[]> = {};

  for (const angle of angles) {
    console.log(`\n🎨 Generating ${angle.name}...`);
    
    // Check for cached candidates
    const cachedPaths = [];
    for (let i = 1; i <= 4; i++) {
      const p = resolve(CANDIDATES_DIR, `${angle.key}-${i}.png`);
      if (existsSync(p)) cachedPaths.push(p);
    }
    
    if (cachedPaths.length === 4) {
      console.log(`  ♻️  Using 4 cached candidates`);
      allCandidates[angle.key] = [];
      for (const p of cachedPaths) {
        allCandidates[angle.key].push((await readFile(p)).toString('base64'));
      }
      continue;
    }

    try {
      const response = await client.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: angle.prompt,
        config: {
          numberOfImages: 4,
          aspectRatio: '1:1',
          personGeneration: 'allow_all',
        } as any,
      });

      const images = (response as any).generatedImages;
      if (!images || images.length === 0) {
        console.log(`  ❌ No images returned for ${angle.name}`);
        continue;
      }

      allCandidates[angle.key] = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        let base64: string;
        
        if (img.image?.imageBytes) {
          base64 = typeof img.image.imageBytes === 'string' 
            ? img.image.imageBytes 
            : Buffer.from(img.image.imageBytes).toString('base64');
        } else if (img.image?.uri) {
          const res = await fetch(img.image.uri, { 
            headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } 
          });
          base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
        } else {
          console.log(`  ⚠️  Unknown image format for candidate ${i + 1}`);
          continue;
        }

        const outPath = resolve(CANDIDATES_DIR, `${angle.key}-${i + 1}.png`);
        await writeFile(outPath, Buffer.from(base64, 'base64'));
        allCandidates[angle.key].push(base64);
        console.log(`  ✅ Candidate ${i + 1}: ${(Buffer.from(base64, 'base64').length / 1024).toFixed(0)}KB`);
      }
    } catch (e: any) {
      console.log(`  ❌ Error: ${e.message}`);
    }

    // Rate limit pause between Imagen calls
    if (angle !== angles[angles.length - 1]) {
      console.log(`  ⏳ Waiting 5s...`);
      await sleep(5000);
    }
  }

  // ─── Step 2: Use Gemini to pick the best candidate per angle ───
  console.log('\n━━━ Step 2: Gemini picks best candidates ━━━');

  const bestImages: Record<string, string> = {};

  for (const angle of angles) {
    const candidates = allCandidates[angle.key];
    if (!candidates || candidates.length === 0) {
      console.log(`  ⚠️  No candidates for ${angle.name}, skipping`);
      continue;
    }

    if (candidates.length === 1) {
      bestImages[angle.key] = candidates[0];
      console.log(`  ${angle.name}: only 1 candidate, using it`);
      continue;
    }

    console.log(`  🔍 Evaluating ${angle.name} (${candidates.length} candidates)...`);

    try {
      const parts: any[] = [
        { text: `You are evaluating character design images of a robot named Cosmo. 
The character should match this description: ${COSMO_IDENTITY.description}

I'm showing you ${candidates.length} candidate images for the "${angle.name}" angle.
Pick the ONE candidate (1-${candidates.length}) that:
1. Best matches the character description (blue robot, round head, brown eyes, yellow antenna)
2. Has the cleanest, most consistent design
3. Would work best as a reference image for video generation

Reply with ONLY the number (1-${candidates.length}) of the best candidate.` },
      ];

      for (let i = 0; i < candidates.length; i++) {
        parts.push({ text: `\n\nCandidate ${i + 1}:` });
        parts.push({ inlineData: { mimeType: 'image/png', data: candidates[i] } });
      }

      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
      });

      const text = response.text?.trim() || '1';
      const pick = parseInt(text.match(/\d+/)?.[0] || '1') - 1;
      const idx = Math.min(Math.max(pick, 0), candidates.length - 1);
      bestImages[angle.key] = candidates[idx];
      console.log(`  ✅ ${angle.name}: picked candidate ${idx + 1}`);
    } catch (e: any) {
      console.log(`  ⚠️  Gemini evaluation failed for ${angle.name}: ${e.message}`);
      bestImages[angle.key] = candidates[0]; // fallback to first
    }

    await sleep(2000);
  }

  // ─── Step 3: Save the best images ───
  console.log('\n━━━ Step 3: Saving best references ━━━');

  for (const [key, base64] of Object.entries(bestImages)) {
    const outPath = resolve(ASSETS_DIR, `cosmo-ref-${key}.png`);
    await writeFile(outPath, Buffer.from(base64, 'base64'));
    const size = Buffer.from(base64, 'base64').length;
    console.log(`  📁 ${outPath} (${(size / 1024).toFixed(0)}KB)`);
  }

  // ─── Step 4: Cross-angle consistency check ───
  console.log('\n━━━ Step 4: Cross-angle consistency check ━━━');

  const refKeys = Object.keys(bestImages);
  if (refKeys.length >= 2) {
    try {
      const parts: any[] = [
        { text: `You are evaluating character design consistency across multiple angles of a robot named Cosmo.
Description: ${COSMO_IDENTITY.description}

Rate the overall consistency across these reference images on a scale of 1-10.
Note any inconsistencies in: color, proportions, features, style.
Be specific about what's consistent and what differs.` },
      ];

      for (const key of refKeys) {
        parts.push({ text: `\n\n${key} view:` });
        parts.push({ inlineData: { mimeType: 'image/png', data: bestImages[key] } });
      }

      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
      });

      console.log(`\n${response.text}`);
    } catch (e: any) {
      console.log(`  ⚠️  Consistency check failed: ${e.message}`);
    }
  }

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Reference sheet complete!                  ║');
  console.log(`║  ${Object.keys(bestImages).length} angles saved to assets/cosmo-refs/   ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('\nFor Veo 3.1 referenceImages, use: front + three-quarter + side (max 3)');
}

main().catch(e => {
  console.error('\n💥 Fatal:', e.message);
  process.exit(1);
});
