#!/usr/bin/env npx tsx
/**
 * Pro Video V2 — Reference Image + Veo Image-to-Video + QA Pipeline
 * 
 * 1. Claude generates structured lesson script
 * 2. DALL-E generates reference images (exact block counts)
 * 3. Gemini Vision QA checks each image
 * 4. Veo image-to-video animates from verified reference images
 * 5. Gemini Vision QA checks video frames
 * 6. FFmpeg assembles final video with per-scene voice
 * 7. Upload to YouTube
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

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v2');
const VEO_DELAY_MS = 150_000;
const MAX_RETRIES = 2;

// ═══════════════════════════════════════════════════
// Step 1: Generate Script
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
        content: `You are writing a children's educational YouTube video script for "Super Builders".

LESSON: Counting 1 to 10 with building blocks
AGE: 2-5 years old
CHARACTER: Cosmo — friendly blue robot with big round eyes, loves building
DURATION: ~3 minutes (12-14 scenes)

STRUCTURE:
1. INTRO — Cosmo waves hello, exciting music, "Today we're counting to 10!"
2. COUNT 1-5 — Add one block per scene, repeat each number 2-3x
3. MIDPOINT — "Let's count them all! 1, 2, 3, 4, 5!"
4. COUNT 6-10 — Continue building tower
5. FULL COUNT — Count all 10 together
6. CELEBRATION — Tower complete, confetti, "You did it!"
7. OUTRO — Subscribe, wave goodbye

CRITICAL: For each scene, specify the EXACT visual state:
- How many blocks are in the tower
- What color each block is (from bottom: red, orange, yellow, green, blue, purple, pink, cyan, white, gold)
- What number should appear on screen
- What Cosmo is doing

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
      "blockColors": [],
      "numberOnScreen": null,
      "imagePrompt": "DALL-E prompt: exact visual description of the STILL IMAGE for this scene. Include Cosmo (blue robot), exact block arrangement, number displayed, background. Be very specific about count.",
      "videoPrompt": "Veo prompt: describe the MOTION/ANIMATION to add to the still image. Camera moves, character animation, particle effects.",
      "narration": "What Cosmo says",
      "durationSec": 8
    }
  ]
}`
      }],
    }),
  });

  const data = await response.json() as any;
  let text = data.content[0].text.trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const script = JSON.parse(text);

  const totalDur = script.scenes.reduce((s: number, sc: any) => s + sc.durationSec, 0);
  console.log(`   ✅ Title: ${script.title}`);
  console.log(`   📊 Scenes: ${script.scenes.length}, ~${(totalDur / 60).toFixed(1)} min`);
  for (const s of script.scenes) {
    console.log(`   ${s.id}: ${s.blockCount} blocks [${s.blockColors?.join(',')}] — "${s.narration.slice(0, 50)}..."`);
  }

  return script;
}

// ═══════════════════════════════════════════════════
// Step 2: Generate Reference Images (DALL-E)
// ═══════════════════════════════════════════════════

async function generateReferenceImage(scene: any, outputPath: string): Promise<void> {
  const prompt = `${scene.imagePrompt}

CRITICAL REQUIREMENTS:
- There must be EXACTLY ${scene.blockCount} blocks stacked in a tower
- The number "${scene.numberOnScreen || scene.blockCount}" should be clearly visible on screen
- Cosmo is a small friendly blue robot with big round brown eyes and a warm smile
- Style: bright colorful 3D Pixar-quality children's animation
- Background: cheerful construction workshop with soft lighting
- Resolution: 1280x720, landscape orientation
- Clean, simple composition suitable for toddlers`;

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

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DALL-E error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const imageBuffer = Buffer.from(data.data[0].b64_json, 'base64');
  await writeFile(outputPath, imageBuffer);
}

// ═══════════════════════════════════════════════════
// Step 3: QA Check Image (Gemini Vision)
// ═══════════════════════════════════════════════════

async function qaCheckImage(imagePath: string, expectedCount: number, sceneId: string): Promise<{ passed: boolean; actualCount: number; notes: string }> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  const imageData = await readFile(imagePath);
  const base64 = imageData.toString('base64');

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64,
          },
        },
        {
          text: `You are a quality checker for children's educational content.

Look at this image carefully. Count the number of building blocks/cubes stacked in a tower.

IMPORTANT: Count ONLY distinct building blocks/cubes in the tower structure. Do not count the robot character, background objects, or decorations.

The expected number of blocks is: ${expectedCount}

Respond with ONLY valid JSON (no markdown):
{
  "actualBlockCount": <number you counted>,
  "passed": <true if actualBlockCount matches ${expectedCount}, false otherwise>,
  "notes": "<brief description of what you see>"
}`,
        },
      ],
    }],
  });

  let text = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  try {
    const result = JSON.parse(text);
    return {
      passed: result.passed,
      actualCount: result.actualBlockCount,
      notes: result.notes,
    };
  } catch {
    return { passed: false, actualCount: -1, notes: `QA parse error: ${text.slice(0, 100)}` };
  }
}

// ═══════════════════════════════════════════════════
// Step 4: Generate + QA Reference Images (with retry)
// ═══════════════════════════════════════════════════

async function generateAndVerifyImages(scenes: any[], outputDir: string): Promise<string[]> {
  console.log('\n🎨 Step 2+3: Generating & verifying reference images...\n');
  const imagePaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const imgPath = resolve(outputDir, `ref_${i}.png`);

    // Skip scenes with 0 blocks (intro/outro) — no count QA needed
    const needsQA = scene.blockCount > 0;

    let passed = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) console.log(`      🔄 Retry ${attempt}/${MAX_RETRIES}...`);

      console.log(`   🎨 Scene ${i + 1}/${scenes.length} [${scene.phase}] ${scene.id} (${scene.blockCount} blocks)`);

      try {
        await generateReferenceImage(scene, imgPath);
        const size = (await readFile(imgPath)).length;
        console.log(`      📸 Image generated (${(size / 1024).toFixed(0)}KB)`);
      } catch (err: any) {
        console.log(`      ⚠️  DALL-E failed: ${err.message.slice(0, 80)}`);
        // Create a placeholder
        execSync(`ffmpeg -f lavfi -i color=c=0x87CEEB:s=1792x1024:d=1 -frames:v 1 -y "${imgPath}" 2>/dev/null`);
        break;
      }

      if (!needsQA) {
        console.log(`      ✅ No block count QA needed (${scene.phase})`);
        passed = true;
        break;
      }

      // QA check
      const qa = await qaCheckImage(imgPath, scene.blockCount, scene.id);
      if (qa.passed) {
        console.log(`      ✅ QA PASSED: ${qa.actualCount} blocks (expected ${scene.blockCount})`);
        passed = true;
        break;
      } else {
        console.log(`      ❌ QA FAILED: counted ${qa.actualCount}, expected ${scene.blockCount} — ${qa.notes}`);
      }
    }

    if (!passed && needsQA) {
      console.log(`      ⚠️  Using best attempt after ${MAX_RETRIES + 1} tries`);
    }

    imagePaths.push(imgPath);
  }

  return imagePaths;
}

// ═══════════════════════════════════════════════════
// Step 5: Generate Voice
// ═══════════════════════════════════════════════════

async function generateVoice(scenes: any[], outputDir: string): Promise<string[]> {
  console.log('\n🎙️ Step 4: Generating voice narration...\n');
  const audioPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const audioPath = resolve(outputDir, `voice_${i}.mp3`);

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: scene.narration,
        voice: 'nova',
        speed: 0.85,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) throw new Error(`TTS error scene ${i}: ${res.status}`);
    await writeFile(audioPath, Buffer.from(await res.arrayBuffer()));

    const dur = parseFloat(
      execSync(`ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
    );
    console.log(`   ✅ Scene ${i + 1} (${scene.id}): ${dur.toFixed(1)}s`);
    audioPaths.push(audioPath);
  }

  return audioPaths;
}

// ═══════════════════════════════════════════════════
// Step 6: Veo Image-to-Video
// ═══════════════════════════════════════════════════

async function generateVideoFromImage(
  imagePath: string,
  scene: any,
  clipPath: string,
): Promise<boolean> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  const imageData = await readFile(imagePath);
  const base64 = imageData.toString('base64');

  const veoDuration = scene.durationSec <= 5 ? 4 : scene.durationSec <= 7 ? 6 : 8;

  let operation = await client.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt: `${scene.videoPrompt}. Bright colorful 3D children's animation, child-safe, ages 2-5.`,
    referenceImages: [{
      image: {
        imageBytes: base64,
        mimeType: 'image/png',
      },
      operation: 'SUBJECT_REFERENCE',
    }],
    config: {
      aspectRatio: '16:9',
      durationSeconds: veoDuration,
      personGeneration: 'allow_all',
    },
  } as any);

  let attempts = 0;
  while (!operation.done) {
    if (attempts++ >= 60) throw new Error('Timed out');
    process.stdout.write(`      ⏳ ${attempts * 10}s\r`);
    await new Promise(r => setTimeout(r, 10_000));
    operation = await client.operations.getVideosOperation({ operation });
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) throw new Error('No video returned');

  const videoUri = typeof video === 'string' ? video : (video as any).uri;
  const videoRes = await fetch(videoUri, {
    headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! },
  });
  if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);

  const buf = Buffer.from(await videoRes.arrayBuffer());
  await writeFile(clipPath, buf);
  return true;
}

async function generateVideos(
  imagePaths: string[],
  scenes: any[],
  outputDir: string,
): Promise<string[]> {
  console.log('\n🎬 Step 5: Generating Veo image-to-video clips...\n');
  const clipPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const clipPath = resolve(outputDir, `clip_${i}.mp4`);
    const imgPath = imagePaths[i];

    // Check if clip already exists (resume support)
    if (existsSync(clipPath)) {
      const size = (await readFile(clipPath)).length;
      if (size > 50000) {
        console.log(`   ⏭️  Clip ${i + 1} already exists (${(size / 1024 / 1024).toFixed(1)}MB), skipping`);
        clipPaths.push(clipPath);
        continue;
      }
    }

    if (i > 0 && !existsSync(clipPath)) {
      console.log(`   ⏳ Waiting 2.5 min before next Veo request...`);
      await new Promise(r => setTimeout(r, VEO_DELAY_MS));
    }

    console.log(`   🎬 Clip ${i + 1}/${scenes.length} [${scene.phase}] ${scene.id}`);

    try {
      await generateVideoFromImage(imgPath, scene, clipPath);
      const size = (await readFile(clipPath)).length;
      console.log(`   ✅ Clip ${i + 1} saved (${(size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (err: any) {
      console.log(`   ⚠️  Veo failed: ${err.message.slice(0, 100)}`);
      // Fallback: Ken Burns effect on the reference image
      console.log(`   📦 Using Ken Burns fallback on reference image`);
      const dur = scene.durationSec;
      execSync(
        `ffmpeg -loop 1 -i "${imgPath}" -vf "scale=1920:1080,zoompan=z='min(zoom+0.002,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${dur * 25}:s=1280x720:fps=25" -c:v libx264 -t ${dur} -pix_fmt yuv420p -y "${clipPath}" 2>/dev/null`
      );
    }

    clipPaths.push(clipPath);
  }

  return clipPaths;
}

// ═══════════════════════════════════════════════════
// Step 7: QA Check Video Frames
// ═══════════════════════════════════════════════════

async function qaCheckVideo(clipPath: string, expectedCount: number, sceneId: string): Promise<boolean> {
  if (expectedCount === 0) return true;

  // Extract middle frame
  const framePath = clipPath.replace('.mp4', '_qa_frame.png');
  execSync(`ffmpeg -i "${clipPath}" -vf "select=eq(n\\,12)" -frames:v 1 -y "${framePath}" 2>/dev/null`);

  const qa = await qaCheckImage(framePath, expectedCount, sceneId);
  return qa.passed;
}

// ═══════════════════════════════════════════════════
// Step 8: Assemble Final Video
// ═══════════════════════════════════════════════════

async function assembleVideo(
  clipPaths: string[],
  audioPaths: string[],
  outputDir: string,
): Promise<string> {
  console.log('\n🎞️ Step 7: Assembling final video...\n');
  const finalPath = resolve(outputDir, 'final.mp4');
  const segPaths: string[] = [];

  for (let i = 0; i < clipPaths.length; i++) {
    const segPath = resolve(outputDir, `segment_${i}.mp4`);
    const audioPath = audioPaths[i];
    const clipPath = clipPaths[i];

    const audioDur = parseFloat(
      execSync(`ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
    );

    // Loop clip to match audio, add 0.5s padding after narration
    const totalDur = audioDur + 0.5;
    execSync(
      `ffmpeg -stream_loop -1 -i "${clipPath}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -t ${totalDur} -pix_fmt yuv420p -y "${segPath}" 2>/dev/null`
    );
    segPaths.push(segPath);
  }

  // Concatenate with crossfade transitions
  const concatFile = resolve(outputDir, 'concat.txt');
  await writeFile(concatFile, segPaths.map(p => `file '${p}'`).join('\n'));

  execSync(
    `ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -y "${finalPath}" 2>/dev/null`
  );

  const fileSize = (await readFile(finalPath)).length;
  const duration = parseFloat(
    execSync(`ffprobe -i "${finalPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
  );

  console.log(`   ✅ Final: ${(fileSize / 1024 / 1024).toFixed(1)}MB, ${duration.toFixed(1)}s (~${(duration / 60).toFixed(1)} min)`);
  return finalPath;
}

// ═══════════════════════════════════════════════════
// Step 9: Upload
// ═══════════════════════════════════════════════════

async function upload(videoPath: string, script: any): Promise<string> {
  console.log('\n📤 Step 8: Uploading to YouTube...\n');

  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const youtube = google.youtube({ version: 'v3', auth: oauth2 });
  const { createReadStream } = await import('fs');

  const description = `${script.description}

🤖 Meet Cosmo the Robot! Join Cosmo as we build a colorful counting tower and learn numbers 1-10!

🎓 What kids will learn:
• Counting from 1 to 10
• Number recognition
• Colors and building
• Following along and participation

👶 Perfect for ages 2-5

📺 Subscribe to Super Builders for more educational adventures!

#SuperBuilders #KidsLearning #Counting #Numbers #Educational #Preschool #Toddler`;

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: script.title,
        description,
        tags: script.tags,
        categoryId: '27',
        defaultLanguage: 'en',
      },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: true },
    },
    media: { body: createReadStream(videoPath) },
  });

  const videoId = res.data.id!;
  console.log(`   ✅ Uploaded! Video ID: ${videoId}`);
  console.log(`   🔗 https://youtube.com/watch?v=${videoId}`);
  return videoId;
}

// ═══════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════

async function main() {
  const start = Date.now();
  console.log('🚀 Super Builders — Pro Video V2 (Reference Image Pipeline)');
  console.log(`   Output: ${OUTPUT_DIR}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Check for existing script (resume support)
  let script;
  const scriptPath = resolve(OUTPUT_DIR, 'script.json');
  if (existsSync(scriptPath)) {
    script = JSON.parse(await readFile(scriptPath, 'utf8'));
    console.log(`   📋 Resuming with existing script: ${script.title}`);
  } else {
    script = await generateScript();
    await writeFile(scriptPath, JSON.stringify(script, null, 2));
  }

  // Generate + verify reference images
  const imagePaths = await generateAndVerifyImages(script.scenes, OUTPUT_DIR);

  // Generate voice
  const audioPaths = await generateVoice(script.scenes, OUTPUT_DIR);

  // Generate video from reference images
  const clipPaths = await generateVideos(imagePaths, script.scenes, OUTPUT_DIR);

  // QA check videos
  console.log('\n🔍 Step 6: QA checking video clips...\n');
  let qaPassCount = 0;
  for (let i = 0; i < clipPaths.length; i++) {
    const scene = script.scenes[i];
    if (scene.blockCount === 0) { qaPassCount++; continue; }
    const passed = await qaCheckVideo(clipPaths[i], scene.blockCount, scene.id);
    console.log(`   ${passed ? '✅' : '⚠️'} Clip ${i + 1} (${scene.id}): ${passed ? 'PASS' : 'NEEDS REVIEW'} — expected ${scene.blockCount} blocks`);
    if (passed) qaPassCount++;
  }
  console.log(`   📊 QA: ${qaPassCount}/${script.scenes.length} passed`);

  // Assemble
  const finalPath = await assembleVideo(clipPaths, audioPaths, OUTPUT_DIR);

  // Upload
  const videoId = await upload(finalPath, script);

  const elapsed = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\n🎉 Done in ${elapsed} minutes!`);
  console.log(`   🔗 https://youtube.com/watch?v=${videoId}`);

  await writeFile(resolve(OUTPUT_DIR, 'metadata.json'), JSON.stringify({
    videoId, title: script.title, scenes: script.scenes.length,
    qaPassRate: `${qaPassCount}/${script.scenes.length}`,
    elapsed: `${elapsed} min`, timestamp: new Date().toISOString(),
  }, null, 2));
}

main().catch(err => {
  console.error('\n❌ Pipeline failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
