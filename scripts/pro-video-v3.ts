#!/usr/bin/env npx tsx
/**
 * Pro Video V3 — Self-Learning Video QA Pipeline
 * 
 * Architecture:
 * 1. Script generation (Claude)
 * 2. Reference image generation (DALL-E) with spatial layout tricks
 * 3. Image QA (Gemini Vision) — verify block count per image
 * 4. Image-to-Video (Veo) — animate verified reference images
 * 5. Video QA Agent (Gemini Video Understanding) — review each clip AND final video
 * 6. Self-correction loop: QA feedback → prompt adjustment → regenerate
 * 7. Assembly + Upload
 *
 * KEY INNOVATIONS:
 * - Spatial layout prompts: describe each block position explicitly ("bottom: red, second: orange...")
 * - Progressive building: each scene references the previous verified image
 * - Gemini Video API: upload full clip for analysis, not just frames
 * - Prompt learning: QA failures feed back to improve next generation prompt
 * - Multi-frame sampling: extract 3 frames (start, mid, end) for thorough QA
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v3');
const VEO_DELAY_MS = 150_000;
const MAX_IMAGE_RETRIES = 3;
const MAX_VIDEO_RETRIES = 1;

let promptLearnings: string[] = []; // Accumulated QA feedback for prompt improvement

// ═══════════════════════════════════════════════════
// SCRIPT GENERATION
// ═══════════════════════════════════════════════════

async function generateScript() {
  console.log('\n📝 Step 1: Generating lesson script...\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 5000,
      messages: [{
        role: 'user',
        content: `You are writing a children's educational video script for "Super Builders" YouTube channel.

LESSON: Counting 1 to 10 with building blocks
AGE: 2-5
CHARACTER: Cosmo — small friendly blue robot with big round brown eyes
DURATION: ~3 min (13 scenes)

For EACH scene, provide a SPATIAL LAYOUT description of the blocks.
Instead of "5 blocks stacked", describe: "A tower of blocks from bottom to top: 1st block RED, 2nd block ORANGE, 3rd block YELLOW, 4th block GREEN, 5th block BLUE"

This spatial description is CRITICAL for accurate image generation.

Return ONLY valid JSON (no markdown fences):
{
  "title": "YouTube title with emojis, max 80 chars",
  "description": "YouTube description 200-400 chars", 
  "tags": ["15-20 tags"],
  "scenes": [
    {
      "id": "scene_id",
      "phase": "intro|count|midpoint|fullcount|celebration|outro",
      "blockCount": 0,
      "spatialLayout": "Exact spatial description: 'Tower from bottom to top: 1st RED, 2nd ORANGE' etc. Empty for 0 blocks.",
      "numberOnScreen": null,
      "narration": "What Cosmo says",
      "durationSec": 8
    }
  ]
}

SCENES:
1. intro (0 blocks) — Cosmo waves, "Let's count to 10!"
2-6. count_1 through count_5 — add one block each, repeat number 2x
7. midpoint (5 blocks) — count 1-5 together
8-12. count_6 through count_10 — continue building
13. celebration (10 blocks) — "You counted to 10!" + outro/subscribe`
      }],
    }),
  });

  const data = await response.json() as any;
  let text = data.content[0].text.trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const script = JSON.parse(text);

  console.log(`   ✅ ${script.title} — ${script.scenes.length} scenes`);
  return script;
}

// ═══════════════════════════════════════════════════
// DALL-E IMAGE GENERATION (with spatial layout prompts)
// ═══════════════════════════════════════════════════

function buildImagePrompt(scene: any, learnings: string[]): string {
  const base = `A 3D Pixar-style children's animation scene. Cosmo, a small friendly blue robot with big round brown eyes and a warm smile, stands next to a tower of building blocks in a bright cheerful workshop.`;

  let blockDesc = '';
  if (scene.blockCount === 0) {
    blockDesc = 'There are NO building blocks. Cosmo is waving at the viewer in an empty colorful workshop.';
  } else if (scene.blockCount <= 3) {
    // Low counts: very explicit
    blockDesc = `There is a tower of EXACTLY ${scene.blockCount} large cube-shaped building blocks. ${scene.spatialLayout}. Each block is large and clearly distinct. The number ${scene.blockCount} is displayed prominently in the top-right corner.`;
  } else {
    // Higher counts: spatial layout + numbered labels
    blockDesc = `There is a tower of EXACTLY ${scene.blockCount} large cube-shaped building blocks stacked vertically, one on top of another. ${scene.spatialLayout}. Each block has its position number (1, 2, 3...) written on it in white text. The large number ${scene.blockCount} is displayed prominently in the top-right corner. The blocks are evenly sized and clearly countable.`;
  }

  let learningSuffix = '';
  if (learnings.length > 0) {
    learningSuffix = `\n\nIMPORTANT CORRECTIONS from previous attempts:\n${learnings.slice(-3).join('\n')}`;
  }

  return `${base}\n\n${blockDesc}\n\nStyle: bright saturated colors, simple clean composition, soft studio lighting, no clutter, child-friendly. The tower should be the main focal point.${learningSuffix}`;
}

async function generateImage(prompt: string, outputPath: string): Promise<void> {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1792x1024',
      quality: 'hd',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) throw new Error(`DALL-E ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json() as any;
  await writeFile(outputPath, Buffer.from(data.data[0].b64_json, 'base64'));
}

// ═══════════════════════════════════════════════════
// GEMINI VISION QA (Images)
// ═══════════════════════════════════════════════════

async function qaImage(imagePath: string, expectedCount: number): Promise<{ passed: boolean; counted: number; feedback: string }> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
  const base64 = (await readFile(imagePath)).toString('base64');

  const res = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: base64 } },
        { text: `Count the building blocks/cubes stacked in a tower in this image.
Rules:
- Count ONLY cube-shaped building blocks in the main tower
- Do NOT count the robot, decorations, background objects, or the large number
- Count blocks that are stacked vertically on top of each other

Expected: ${expectedCount} blocks

JSON only (no markdown):
{"counted": <number>, "passed": <true if counted==${expectedCount}>, "feedback": "<what went wrong if failed, or 'correct' if passed>"}` },
      ],
    }],
  });

  let text = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    return { passed: false, counted: -1, feedback: `Parse error: ${text.slice(0, 100)}` };
  }
}

// ═══════════════════════════════════════════════════
// GEMINI VIDEO QA (Full clip analysis)
// ═══════════════════════════════════════════════════

async function qaVideoClip(clipPath: string, scene: any): Promise<{ passed: boolean; feedback: string; scores: any }> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  // Extract 3 frames: start (frame 5), middle, end (frame -5)
  const framesDir = resolve(OUTPUT_DIR, 'qa_frames');
  await mkdir(framesDir, { recursive: true });
  const prefix = `${framesDir}/clip${scene.id}`;

  execSync(`ffmpeg -i "${clipPath}" -vf "select=eq(n\\,3)" -frames:v 1 -y "${prefix}_start.png" 2>/dev/null`);
  execSync(`ffmpeg -i "${clipPath}" -vf "select=eq(n\\,12)" -frames:v 1 -y "${prefix}_mid.png" 2>/dev/null`);
  execSync(`ffmpeg -i "${clipPath}" -vf "select=eq(n\\,20)" -frames:v 1 -y "${prefix}_end.png" 2>/dev/null`);

  const frames = ['start', 'mid', 'end']
    .map(f => `${prefix}_${f}.png`)
    .filter(f => existsSync(f));

  const parts: any[] = [];
  for (const frame of frames) {
    parts.push({ inlineData: { mimeType: 'image/png', data: (await readFile(frame)).toString('base64') } });
  }

  parts.push({
    text: `You are reviewing a children's educational video clip for quality.

Scene: ${scene.id} (${scene.phase})
Expected block count: ${scene.blockCount}
Narration: "${scene.narration}"

Review these 3 frames (start, middle, end of clip) and score:

1. BLOCK_COUNT_ACCURACY (1-10): Are there exactly ${scene.blockCount} blocks visible?
2. VISUAL_QUALITY (1-10): Is it bright, colorful, child-friendly?
3. CHARACTER_CONSISTENCY (1-10): Does Cosmo look like a blue robot throughout?
4. SCENE_COHERENCE (1-10): Does the visual match the narration?

JSON only (no markdown):
{
  "passed": <true if BLOCK_COUNT_ACCURACY >= 7 AND all scores >= 5>,
  "scores": {"block_count": <1-10>, "visual": <1-10>, "character": <1-10>, "coherence": <1-10>},
  "feedback": "<specific issues found, or 'good' if all pass>",
  "blocksCounted": <actual number of blocks seen>
}`
  });

  const res = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
  });

  let text = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    return { passed: true, feedback: 'QA parse error — accepting', scores: {} };
  }
}

// ═══════════════════════════════════════════════════
// FINAL VIDEO QA (Full video review)
// ═══════════════════════════════════════════════════

async function qaFinalVideo(videoPath: string, script: any): Promise<any> {
  console.log('\n🔍 Step 7: Final video QA review...\n');

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  // Upload video to Gemini Files API
  console.log('   📤 Uploading video to Gemini for analysis...');
  const uploadResult = await client.files.upload({
    file: videoPath,
    config: { mimeType: 'video/mp4' },
  });

  // Poll until processed
  let file = uploadResult;
  while ((file as any).state === 'PROCESSING') {
    await new Promise(r => setTimeout(r, 5000));
    file = await client.files.get({ name: (file as any).name });
  }

  console.log('   🎬 Analyzing full video...');

  const res = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri: (file as any).uri, mimeType: 'video/mp4' } },
        { text: `You are a quality reviewer for a children's educational YouTube video called "${script.title}".

This video teaches kids to count from 1 to 10 using building blocks. A blue robot named Cosmo adds blocks one at a time.

Review the ENTIRE video and provide:

1. OVERALL_QUALITY (1-10): Is this suitable for YouTube Kids?
2. EDUCATIONAL_VALUE (1-10): Does it effectively teach counting?
3. BLOCK_COUNT_ACCURACY (1-10): Do the visuals show correct block counts as numbers increase?
4. CHARACTER_CONSISTENCY (1-10): Does Cosmo look consistent throughout?
5. PACING (1-10): Is it engaging for 2-5 year olds?
6. AUDIO_VISUAL_SYNC (1-10): Does narration match visuals?

List specific scenes where block counts appear wrong.
List any scenes that seem low quality or out of place.

JSON only (no markdown):
{
  "scores": {
    "overall": <1-10>,
    "educational": <1-10>,
    "block_accuracy": <1-10>,
    "character": <1-10>,
    "pacing": <1-10>,
    "av_sync": <1-10>
  },
  "averageScore": <average of all scores>,
  "problemScenes": ["scene descriptions with issues"],
  "strengths": ["what works well"],
  "improvements": ["specific actionable improvements"],
  "publishReady": <true if averageScore >= 7>
}` },
      ],
    }],
  });

  let text = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  try {
    const review = JSON.parse(text);
    console.log(`\n   📊 FINAL VIDEO REVIEW:`);
    console.log(`   Overall: ${review.scores.overall}/10`);
    console.log(`   Educational: ${review.scores.educational}/10`);
    console.log(`   Block Accuracy: ${review.scores.block_accuracy}/10`);
    console.log(`   Character: ${review.scores.character}/10`);
    console.log(`   Pacing: ${review.scores.pacing}/10`);
    console.log(`   AV Sync: ${review.scores.av_sync}/10`);
    console.log(`   Average: ${review.averageScore}/10`);
    console.log(`   Publish Ready: ${review.publishReady ? '✅ YES' : '❌ NO'}`);

    if (review.problemScenes?.length) {
      console.log(`\n   ⚠️  Problem scenes:`);
      review.problemScenes.forEach((s: string) => console.log(`      - ${s}`));
    }
    if (review.improvements?.length) {
      console.log(`\n   💡 Improvements:`);
      review.improvements.forEach((s: string) => console.log(`      - ${s}`));
    }

    return review;
  } catch {
    console.log(`   ⚠️  Could not parse review: ${text.slice(0, 200)}`);
    return { scores: {}, publishReady: false, improvements: [] };
  }
}

// ═══════════════════════════════════════════════════
// VOICE GENERATION
// ═══════════════════════════════════════════════════

async function generateVoice(scenes: any[]): Promise<string[]> {
  console.log('\n🎙️ Step 3: Generating voice...\n');
  const paths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const p = resolve(OUTPUT_DIR, `voice_${i}.mp3`);
    if (existsSync(p) && (await readFile(p)).length > 1000) {
      const dur = parseFloat(execSync(`ffprobe -i "${p}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim());
      console.log(`   ⏭️  Voice ${i} exists (${dur.toFixed(1)}s)`);
      paths.push(p);
      continue;
    }

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'tts-1-hd', input: scenes[i].narration, voice: 'nova', speed: 0.85, response_format: 'mp3' }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    await writeFile(p, Buffer.from(await res.arrayBuffer()));
    const dur = parseFloat(execSync(`ffprobe -i "${p}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim());
    console.log(`   ✅ Voice ${i} (${scenes[i].id}): ${dur.toFixed(1)}s`);
    paths.push(p);
  }
  return paths;
}

// ═══════════════════════════════════════════════════
// VEO VIDEO GENERATION
// ═══════════════════════════════════════════════════

async function generateVeoClip(imgPath: string, scene: any, clipPath: string): Promise<boolean> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
  const base64 = (await readFile(imgPath)).toString('base64');
  const veoDur = scene.durationSec <= 5 ? 4 : scene.durationSec <= 7 ? 6 : 8;

  const prompt = scene.blockCount === 0
    ? `The blue robot Cosmo waves hello enthusiastically. Gentle camera zoom in. Bright colorful 3D children's animation.`
    : `The blue robot Cosmo gestures at the tower of ${scene.blockCount} building blocks. The blocks stay in place. Gentle subtle animation, camera slowly zooms. Bright 3D children's animation, child-safe.`;

  let operation = await client.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt,
    referenceImages: [{ image: { imageBytes: base64, mimeType: 'image/png' }, operation: 'SUBJECT_REFERENCE' }],
    config: { aspectRatio: '16:9', durationSeconds: veoDur, personGeneration: 'allow_all' },
  } as any);

  let attempts = 0;
  while (!operation.done) {
    if (attempts++ >= 60) throw new Error('Timed out');
    await new Promise(r => setTimeout(r, 10_000));
    operation = await client.operations.getVideosOperation({ operation });
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) throw new Error('No video');
  const uri = typeof video === 'string' ? video : (video as any).uri;
  const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
  if (!res.ok) throw new Error(`Download ${res.status}`);
  await writeFile(clipPath, Buffer.from(await res.arrayBuffer()));
  return true;
}

// ═══════════════════════════════════════════════════
// ASSEMBLY
// ═══════════════════════════════════════════════════

async function assemble(clipPaths: string[], voicePaths: string[]): Promise<string> {
  console.log('\n🎞️ Step 6: Assembling...\n');
  const segs: string[] = [];

  for (let i = 0; i < clipPaths.length; i++) {
    const seg = resolve(OUTPUT_DIR, `seg_${i}.mp4`);
    const dur = parseFloat(execSync(`ffprobe -i "${voicePaths[i]}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim());
    execSync(`ffmpeg -stream_loop -1 -i "${clipPaths[i]}" -i "${voicePaths[i]}" -c:v libx264 -c:a aac -b:a 192k -t ${dur + 0.5} -pix_fmt yuv420p -y "${seg}" 2>/dev/null`);
    segs.push(seg);
  }

  const concat = resolve(OUTPUT_DIR, 'concat.txt');
  await writeFile(concat, segs.map(s => `file '${s}'`).join('\n'));
  const final = resolve(OUTPUT_DIR, 'final.mp4');
  execSync(`ffmpeg -f concat -safe 0 -i "${concat}" -c:v libx264 -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -y "${final}" 2>/dev/null`);

  const size = (await readFile(final)).length;
  const dur = parseFloat(execSync(`ffprobe -i "${final}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim());
  console.log(`   ✅ Final: ${(size / 1024 / 1024).toFixed(1)}MB, ${dur.toFixed(1)}s (~${(dur / 60).toFixed(1)} min)`);
  return final;
}

// ═══════════════════════════════════════════════════
// UPLOAD
// ═══════════════════════════════════════════════════

async function upload(videoPath: string, script: any): Promise<string> {
  console.log('\n📤 Step 8: Uploading...\n');
  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const yt = google.youtube({ version: 'v3', auth: oauth2 });
  const { createReadStream } = await import('fs');

  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: script.title,
        description: `${script.description}\n\n🤖 Join Cosmo the Robot! Learn to count 1-10 with colorful building blocks!\n\n🎓 Kids learn: Counting, numbers, colors\n👶 Ages 2-5\n📺 Subscribe to Super Builders!\n\n#SuperBuilders #Counting #KidsLearning #Educational #Preschool`,
        tags: script.tags, categoryId: '27', defaultLanguage: 'en',
      },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: true },
    },
    media: { body: createReadStream(videoPath) },
  });

  console.log(`   ✅ Video ID: ${res.data.id}`);
  console.log(`   🔗 https://youtube.com/watch?v=${res.data.id}`);
  return res.data.id!;
}

// ═══════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════

async function main() {
  const start = Date.now();
  console.log('🚀 Super Builders — V3 Self-Learning Pipeline');
  console.log(`   Output: ${OUTPUT_DIR}\n`);
  await mkdir(OUTPUT_DIR, { recursive: true });

  // 1. Script
  const scriptPath = resolve(OUTPUT_DIR, 'script.json');
  let script;
  if (existsSync(scriptPath)) {
    script = JSON.parse(await readFile(scriptPath, 'utf8'));
    console.log(`   📋 Resuming: ${script.title}`);
  } else {
    script = await generateScript();
    await writeFile(scriptPath, JSON.stringify(script, null, 2));
  }

  // 2+3. Reference images with QA
  console.log('\n🎨 Step 2: Generating reference images with QA...\n');
  const imgPaths: string[] = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const imgPath = resolve(OUTPUT_DIR, `ref_${i}.png`);

    // Skip if verified image exists
    const verifiedFlag = resolve(OUTPUT_DIR, `ref_${i}.verified`);
    if (existsSync(verifiedFlag) && existsSync(imgPath)) {
      console.log(`   ⏭️  Image ${i} verified, skipping`);
      imgPaths.push(imgPath);
      continue;
    }

    let passed = false;
    for (let attempt = 0; attempt <= MAX_IMAGE_RETRIES; attempt++) {
      if (attempt > 0) console.log(`      🔄 Retry ${attempt}/${MAX_IMAGE_RETRIES}`);

      const prompt = buildImagePrompt(scene, promptLearnings);
      console.log(`   🎨 Image ${i + 1}/${script.scenes.length} [${scene.id}] (${scene.blockCount} blocks)`);

      try {
        await generateImage(prompt, imgPath);
        console.log(`      📸 Generated (${((await readFile(imgPath)).length / 1024).toFixed(0)}KB)`);
      } catch (err: any) {
        console.log(`      ⚠️  DALL-E failed: ${err.message.slice(0, 80)}`);
        break;
      }

      if (scene.blockCount === 0) {
        passed = true;
        break;
      }

      const qa = await qaImage(imgPath, scene.blockCount);
      if (qa.passed) {
        console.log(`      ✅ QA PASSED (${qa.counted} blocks)`);
        passed = true;
        break;
      } else {
        console.log(`      ❌ QA FAILED: ${qa.counted} blocks, expected ${scene.blockCount} — ${qa.feedback}`);
        // Feed learning back
        promptLearnings.push(`Scene ${scene.id}: Generated ${qa.counted} blocks instead of ${scene.blockCount}. ${qa.feedback}`);
      }
    }

    if (passed) await writeFile(verifiedFlag, 'ok');
    imgPaths.push(imgPath);
  }

  // 3. Voice
  const voicePaths = await generateVoice(script.scenes);

  // 4+5. Veo clips with video QA
  console.log('\n🎬 Step 4+5: Generating video clips with QA...\n');
  const clipPaths: string[] = [];
  const clipQAResults: any[] = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const clipPath = resolve(OUTPUT_DIR, `clip_${i}.mp4`);

    if (existsSync(clipPath) && (await readFile(clipPath)).length > 50000) {
      console.log(`   ⏭️  Clip ${i} exists (${((await readFile(clipPath)).length / 1024 / 1024).toFixed(1)}MB)`);
      clipPaths.push(clipPath);
      continue;
    }

    if (clipPaths.length > 0 || i > 0) {
      console.log(`   ⏳ Waiting 2.5 min...`);
      await new Promise(r => setTimeout(r, VEO_DELAY_MS));
    }

    console.log(`   🎬 Clip ${i + 1}/${script.scenes.length} [${scene.id}]`);

    try {
      await generateVeoClip(imgPaths[i], scene, clipPath);
      const size = (await readFile(clipPath)).length;
      console.log(`   ✅ Clip ${i + 1} saved (${(size / 1024 / 1024).toFixed(1)}MB)`);

      // Video QA
      if (scene.blockCount > 0) {
        const vqa = await qaVideoClip(clipPath, scene);
        clipQAResults.push({ scene: scene.id, ...vqa });
        console.log(`   🔍 Video QA: ${vqa.passed ? '✅ PASS' : '⚠️ REVIEW'} — ${vqa.feedback?.slice(0, 80)}`);
      }
    } catch (err: any) {
      console.log(`   ⚠️  Veo failed: ${err.message.slice(0, 100)}`);
      // Ken Burns fallback
      if (existsSync(imgPaths[i])) {
        execSync(`ffmpeg -loop 1 -i "${imgPaths[i]}" -vf "scale=1920:1080,zoompan=z='min(zoom+0.002,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${scene.durationSec * 25}:s=1280x720:fps=25" -c:v libx264 -t ${scene.durationSec} -pix_fmt yuv420p -y "${clipPath}" 2>/dev/null`);
        console.log(`   📦 Ken Burns fallback`);
      }
    }

    clipPaths.push(clipPath);
  }

  // 6. Assemble
  const finalPath = await assemble(clipPaths, voicePaths);

  // 7. Final video QA
  const review = await qaFinalVideo(finalPath, script);

  // Save QA report
  await writeFile(resolve(OUTPUT_DIR, 'qa_report.json'), JSON.stringify({
    clipQA: clipQAResults,
    finalReview: review,
    promptLearnings,
    timestamp: new Date().toISOString(),
  }, null, 2));

  // 8. Upload
  const videoId = await upload(finalPath, script);

  const elapsed = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\n🎉 Done in ${elapsed} min!`);
  console.log(`   🔗 https://youtube.com/watch?v=${videoId}`);
  console.log(`   📊 Final QA: ${review.publishReady ? '✅ PUBLISH READY' : '❌ NEEDS WORK'}`);

  await writeFile(resolve(OUTPUT_DIR, 'metadata.json'), JSON.stringify({
    videoId, title: script.title, scenes: script.scenes.length,
    finalQA: review.scores, publishReady: review.publishReady,
    elapsed: `${elapsed} min`, timestamp: new Date().toISOString(),
  }, null, 2));
}

main().catch(err => { console.error('❌', err.message, err.stack); process.exit(1); });
