#!/usr/bin/env npx tsx
/**
 * Full end-to-end pipeline: Script → Voice → Video → Combine → Upload (dry-run)
 * 
 * Generates a real video file and tests the complete flow.
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { execSync } from 'child_process';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const OUTPUT_DIR = resolve(__dirname, '..', 'output');
const DRY_RUN = process.env.DRY_RUN !== 'false';

// ─── Step 1: Generate Script via Claude ───

async function generateScript(): Promise<{
  title: string;
  description: string;
  tags: string[];
  narration: string;
  scenes: { description: string; narration: string; durationSec: number }[];
}> {
  console.log('\n📝 Step 1: Generating script via Claude...\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Generate a short educational YouTube Kids video script for the channel "Super Builders".

Target: Ages 2-5, counting/math category
Duration: ~60 seconds total
Character: Cosmo (a friendly blue robot who loves building and counting)

Return ONLY valid JSON (no markdown) with this structure:
{
  "title": "emoji-rich YouTube title (max 70 chars)",
  "description": "YouTube description with keywords (max 300 chars)",
  "tags": ["tag1", "tag2", ...],
  "narration": "full narration text for TTS",
  "scenes": [
    { "description": "visual description for video generation", "narration": "what's said during this scene", "durationSec": 8 }
  ]
}

Make it educational, fun, and engaging. Use counting, colors, and building themes. 4-6 scenes.`
      }],
    }),
  });

  const data = await response.json() as any;
  const text = data.content[0].text;
  const script = JSON.parse(text);
  
  console.log(`   ✅ Title: ${script.title}`);
  console.log(`   📊 Scenes: ${script.scenes.length}`);
  console.log(`   ⏱️  Total duration: ${script.scenes.reduce((s: number, sc: any) => s + sc.durationSec, 0)}s`);
  
  return script;
}

// ─── Step 2: Generate Voice via OpenAI TTS ───

async function generateVoice(narration: string, outputPath: string): Promise<void> {
  console.log('\n🎙️ Step 2: Generating voice via OpenAI TTS...\n');

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      input: narration,
      voice: 'nova', // Friendly, upbeat — great for kids
      speed: 0.9, // Slightly slower for young kids
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS error ${response.status}: ${await response.text()}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
  
  // Get duration
  const duration = execSync(`ffprobe -i "${outputPath}" -show_entries format=duration -v quiet -of csv="p=0"`)
    .toString().trim();
  
  console.log(`   ✅ Voice saved: ${outputPath}`);
  console.log(`   ⏱️  Duration: ${parseFloat(duration).toFixed(1)}s`);
}

// ─── Step 3: Generate Video Clips via Veo ───

async function generateVideoClips(
  scenes: { description: string; durationSec: number }[],
  outputDir: string,
): Promise<string[]> {
  console.log('\n🎬 Step 3: Generating video clips via Google Veo...\n');

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
  const clipPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const clipPath = resolve(outputDir, `clip_${i}.mp4`);

    // Delay between Veo requests to avoid rate limits (skip first)
    if (i > 0) {
      console.log(`   ⏳ Waiting 2 minutes before next Veo request...`);
      await new Promise(r => setTimeout(r, 120_000));
    }
    
    console.log(`   🎬 Scene ${i + 1}/${scenes.length}: ${scene.description.slice(0, 60)}...`);

    try {
      let operation = await client.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: `${scene.description}. Style: colorful children's 3D animation, bright and friendly, child-safe content for ages 2-5. Simple shapes, vibrant colors, smooth animation.`,
        config: {
          aspectRatio: '16:9',
          durationSeconds: scene.durationSec <= 5 ? 4 : scene.durationSec <= 7 ? 6 : 8,
          personGeneration: 'allow_all',
        },
      });

      // Poll until done
      let attempts = 0;
      while (!operation.done) {
        if (attempts++ >= 60) throw new Error('Veo timed out');
        console.log(`      ⏳ Generating... (${attempts * 10}s)`);
        await new Promise(r => setTimeout(r, 10_000));
        operation = await client.operations.getVideosOperation({ operation });
      }

      const videos = operation.response?.generatedVideos;
      if (!videos || videos.length === 0) throw new Error('No video returned');

      const video = videos[0].video;
      if (!video) throw new Error('Video object missing');

      // Download video — API key goes in header, not URL
      const videoUri = typeof video === 'string' ? video : (video as any).uri;
      if (videoUri) {
        const videoRes = await fetch(videoUri, {
          headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! },
        });
        if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        await writeFile(clipPath, videoBuffer);
        console.log(`   ✅ Clip ${i + 1} saved (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
      }
      
      clipPaths.push(clipPath);
    } catch (err: any) {
      console.log(`   ⚠️  Veo failed for scene ${i + 1}: ${err.message}`);
      // Create a placeholder colored clip with ffmpeg
      const colors = ['0x3498db', '0xe74c3c', '0x2ecc71', '0xf39c12', '0x9b59b6', '0x1abc9c'];
      const color = colors[i % colors.length];
      execSync(
        `ffmpeg -f lavfi -i color=c=${color}:s=1280x720:d=${scene.durationSec} -vf "drawtext=text='Scene ${i + 1}':fontsize=60:fontcolor=white:x=(w-tw)/2:y=(h-th)/2" -c:v libx264 -pix_fmt yuv420p -y "${clipPath}" 2>/dev/null`
      );
      console.log(`   📦 Placeholder clip ${i + 1} created`);
      clipPaths.push(clipPath);
    }
  }

  return clipPaths;
}

// ─── Step 4: Combine Clips + Audio with FFmpeg ───

async function combineVideo(
  clipPaths: string[],
  audioPath: string,
  outputPath: string,
): Promise<void> {
  console.log('\n🎞️ Step 4: Combining clips + audio with FFmpeg...\n');

  // Create concat file
  const concatFile = resolve(OUTPUT_DIR, 'concat.txt');
  const concatContent = clipPaths.map(p => `file '${p}'`).join('\n');
  await writeFile(concatFile, concatContent);

  // Concatenate video clips
  const tempVideo = resolve(OUTPUT_DIR, 'temp_combined.mp4');
  execSync(
    `ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 -pix_fmt yuv420p -y "${tempVideo}" 2>/dev/null`
  );

  // Get audio duration to trim/loop video
  const audioDur = parseFloat(
    execSync(`ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`)
      .toString().trim()
  );

  // Combine video + audio, trim to audio length
  execSync(
    `ffmpeg -i "${tempVideo}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -shortest -t ${audioDur} -pix_fmt yuv420p -y "${outputPath}" 2>/dev/null`
  );

  const fileSize = (await readFile(outputPath)).length;
  console.log(`   ✅ Final video: ${outputPath}`);
  console.log(`   📦 Size: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);
  console.log(`   ⏱️  Duration: ${audioDur.toFixed(1)}s`);
}

// ─── Step 5: Upload to YouTube ───

async function uploadToYouTube(
  videoPath: string,
  script: { title: string; description: string; tags: string[] },
): Promise<void> {
  console.log('\n📤 Step 5: Uploading to YouTube...\n');

  if (DRY_RUN) {
    console.log(`   🔒 DRY RUN MODE — skipping actual upload`);
    console.log(`   📹 Would upload: ${videoPath}`);
    console.log(`   📝 Title: ${script.title}`);
    console.log(`   🏷️  Tags: ${script.tags.join(', ')}`);
    console.log(`   👶 Made for kids: true`);
    console.log(`   ✅ Upload would succeed`);
    return;
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

  const youtube = google.youtube({ version: 'v3', auth: oauth2 });
  const { createReadStream } = await import('fs');

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: script.title,
        description: script.description + '\n\n#SuperBuilders #KidsLearning #Educational',
        tags: script.tags,
        categoryId: '27', // Education
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: 'private', // Start private, review before publishing
        selfDeclaredMadeForKids: true,
      },
    },
    media: {
      body: createReadStream(videoPath),
    },
  });

  console.log(`   ✅ Uploaded! Video ID: ${res.data.id}`);
  console.log(`   🔗 URL: https://youtube.com/watch?v=${res.data.id}`);
  console.log(`   🔒 Status: private (change to public when ready)`);
}

// ─── Main Pipeline ───

async function main() {
  console.log('🚀 Super Builders — Full Pipeline');
  console.log(`   Mode: ${DRY_RUN ? '🔒 DRY RUN' : '🔴 LIVE'}`);
  console.log(`   Output: ${OUTPUT_DIR}`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Step 1: Script
  const script = await generateScript();
  await writeFile(resolve(OUTPUT_DIR, 'script.json'), JSON.stringify(script, null, 2));

  // Step 2: Voice
  const audioPath = resolve(OUTPUT_DIR, 'narration.mp3');
  await generateVoice(script.narration, audioPath);

  // Step 3: Video clips
  const clipPaths = await generateVideoClips(script.scenes, OUTPUT_DIR);

  // Step 4: Combine
  const finalVideo = resolve(OUTPUT_DIR, 'final.mp4');
  await combineVideo(clipPaths, audioPath, finalVideo);

  // Step 5: Upload
  await uploadToYouTube(finalVideo, script);

  console.log('\n🎉 Pipeline complete!\n');
}

main().catch(err => {
  console.error('\n❌ Pipeline failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
