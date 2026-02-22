#!/usr/bin/env npx tsx
/**
 * Professional full-length educational video for Super Builders
 * Proper lesson structure with intro, teaching, practice, and outro
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { execSync } from 'child_process';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'pro');
const VEO_DELAY_MS = 150_000; // 2.5 min between Veo calls

// ─── Step 1: Generate Professional Script ───

async function generateScript() {
  console.log('\n📝 Step 1: Generating professional lesson script...\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are a children's educational content writer for the YouTube channel "Super Builders". 
Create a FULL professional educational video script.

LESSON: Learning to count from 1 to 10 using building blocks
TARGET AGE: 2-5 years old
CHARACTER: Cosmo — a friendly, enthusiastic blue robot who loves building things
CHANNEL: Super Builders
DURATION: ~3-4 minutes (aim for 12-15 scenes)

STRUCTURE:
1. INTRO (hook + theme song moment) — grab attention in first 3 seconds
2. WARM-UP — Cosmo greets kids, introduces today's lesson
3. TEACHING PHASE — Count 1-5 first, building one block at a time, repeat each number
4. PRACTICE — "Can you count with me?" interactive moment
5. TEACHING PHASE 2 — Count 6-10, building taller
6. FULL COUNT — Count all 10 together with the completed tower
7. REVIEW GAME — Quick "how many blocks?" quiz moments
8. CELEBRATION — Cosmo celebrates, tower complete
9. OUTRO — Subscribe reminder, preview next episode, wave goodbye

STYLE GUIDELINES:
- Repetition is KEY for toddlers — repeat each number 2-3 times
- Use call-and-response: "Can you say THREE? Threeee! Great job!"
- Bright, simple language. Short sentences.
- Sound effects and excitement at milestones (5 blocks! 10 blocks!)
- Make it feel like Cosmo is talking directly to the child
- Educational but FUN — never boring or lecture-y

Return ONLY valid JSON:
{
  "title": "YouTube title with emojis, max 80 chars, SEO optimized",
  "description": "Full YouTube description (200-400 chars) with keywords",
  "tags": ["15-20 relevant tags"],
  "scenes": [
    {
      "id": "intro_1",
      "phase": "intro|warmup|teach|practice|review|celebration|outro",
      "visual": "detailed visual description for AI video generation (what we SEE)",
      "narration": "exactly what Cosmo SAYS in this scene",
      "durationSec": 8,
      "notes": "production notes: sound effects, pacing, etc."
    }
  ]
}`
      }],
    }),
  });

  const data = await response.json() as any;
  let text = data.content[0].text.trim();
  // Strip markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  const script = JSON.parse(text);
  
  const totalDur = script.scenes.reduce((s: number, sc: any) => s + sc.durationSec, 0);
  console.log(`   ✅ Title: ${script.title}`);
  console.log(`   📊 Scenes: ${script.scenes.length}`);
  console.log(`   ⏱️  Total duration: ${totalDur}s (~${(totalDur / 60).toFixed(1)} min)`);
  console.log(`   📖 Phases: ${[...new Set(script.scenes.map((s: any) => s.phase))].join(', ')}`);
  
  return script;
}

// ─── Step 2: Generate Voice for Each Scene ───

async function generateVoiceSegments(
  scenes: { id: string; narration: string }[],
  outputDir: string,
): Promise<string[]> {
  console.log('\n🎙️ Step 2: Generating voice narration for each scene...\n');
  
  const audioPaths: string[] = [];
  
  // Generate full narration as one file for natural flow
  const fullNarration = scenes.map(s => s.narration).join(' ... ');
  const fullAudioPath = resolve(outputDir, 'full_narration.mp3');
  
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      input: fullNarration,
      voice: 'nova',
      speed: 0.85, // Slower for toddlers
      response_format: 'mp3',
    }),
  });

  if (!response.ok) throw new Error(`TTS error: ${response.status}`);
  await writeFile(fullAudioPath, Buffer.from(await response.arrayBuffer()));

  const duration = parseFloat(
    execSync(`ffprobe -i "${fullAudioPath}" -show_entries format=duration -v quiet -of csv="p=0"`)
      .toString().trim()
  );
  console.log(`   ✅ Full narration: ${duration.toFixed(1)}s`);

  // Also generate per-scene audio for precise timing
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
    audioPaths.push(audioPath);
    
    const dur = parseFloat(
      execSync(`ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`)
        .toString().trim()
    );
    console.log(`   ✅ Scene ${i + 1} (${scene.id}): ${dur.toFixed(1)}s`);
  }
  
  return audioPaths;
}

// ─── Step 3: Generate Video Clips ───

async function generateVideoClips(
  scenes: { id: string; visual: string; durationSec: number; phase: string }[],
  outputDir: string,
): Promise<string[]> {
  console.log('\n🎬 Step 3: Generating video clips via Veo (with delays)...\n');

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
  const clipPaths: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const clipPath = resolve(outputDir, `clip_${i}.mp4`);

    if (i > 0) {
      const delaySec = Math.round(VEO_DELAY_MS / 1000);
      console.log(`   ⏳ Waiting ${delaySec}s before next Veo request...`);
      await new Promise(r => setTimeout(r, VEO_DELAY_MS));
    }

    console.log(`   🎬 Scene ${i + 1}/${scenes.length} [${scene.phase}] ${scene.id}: ${scene.visual.slice(0, 55)}...`);

    try {
      const veoDuration = scene.durationSec <= 5 ? 4 : scene.durationSec <= 7 ? 6 : 8;
      
      let operation = await client.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: `${scene.visual}. Style: bright colorful 3D children's animation, child-safe, ages 2-5. Simple rounded shapes, saturated colors, smooth gentle animation. The character Cosmo is a friendly small blue robot with big round eyes and a warm smile.`,
        config: {
          aspectRatio: '16:9',
          durationSeconds: veoDuration,
          personGeneration: 'allow_all',
        },
      });

      let attempts = 0;
      while (!operation.done) {
        if (attempts++ >= 60) throw new Error('Timed out');
        process.stdout.write(`      ⏳ ${attempts * 10}s\r`);
        await new Promise(r => setTimeout(r, 10_000));
        operation = await client.operations.getVideosOperation({ operation });
      }
      console.log(`      ⏳ Done after ${attempts * 10}s`);

      const video = operation.response?.generatedVideos?.[0]?.video;
      if (!video) throw new Error('No video returned');

      const videoUri = typeof video === 'string' ? video : (video as any).uri;
      const videoRes = await fetch(videoUri, {
        headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! },
      });
      if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
      
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      await writeFile(clipPath, videoBuffer);
      console.log(`   ✅ Clip ${i + 1} saved (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
      clipPaths.push(clipPath);
    } catch (err: any) {
      console.log(`   ⚠️  Veo failed: ${err.message.slice(0, 100)}`);
      // Colored placeholder with scene label
      const colors = ['0x3498db', '0xe74c3c', '0x2ecc71', '0xf39c12', '0x9b59b6', '0x1abc9c'];
      const color = colors[i % colors.length];
      execSync(
        `ffmpeg -f lavfi -i color=c=${color}:s=1280x720:d=${scene.durationSec} -vf "drawtext=text='${scene.phase.toUpperCase()} - Scene ${i + 1}':fontsize=48:fontcolor=white:x=(w-tw)/2:y=(h-th)/2" -c:v libx264 -pix_fmt yuv420p -y "${clipPath}" 2>/dev/null`
      );
      clipPaths.push(clipPath);
    }
  }

  return clipPaths;
}

// ─── Step 4: Assemble Final Video ───

async function assembleVideo(
  clipPaths: string[],
  audioPaths: string[],
  outputDir: string,
): Promise<string> {
  console.log('\n🎞️ Step 4: Assembling final video...\n');

  const finalPath = resolve(outputDir, 'final.mp4');

  // Strategy: pair each clip with its voice audio, then concatenate all segments
  const segmentPaths: string[] = [];

  for (let i = 0; i < clipPaths.length; i++) {
    const segPath = resolve(outputDir, `segment_${i}.mp4`);
    const audioPath = audioPaths[i];
    const clipPath = clipPaths[i];

    // Get audio duration for this scene
    const audioDur = parseFloat(
      execSync(`ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`)
        .toString().trim()
    );

    // Combine clip (looped/trimmed to audio length) + audio
    // Use -stream_loop to loop short clips to match audio
    execSync(
      `ffmpeg -stream_loop -1 -i "${clipPath}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -t ${audioDur} -pix_fmt yuv420p -shortest -y "${segPath}" 2>/dev/null`
    );
    segmentPaths.push(segPath);
  }

  // Concatenate all segments
  const concatFile = resolve(outputDir, 'concat.txt');
  await writeFile(concatFile, segmentPaths.map(p => `file '${p}'`).join('\n'));

  execSync(
    `ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -y "${finalPath}" 2>/dev/null`
  );

  const fileSize = (await readFile(finalPath)).length;
  const duration = parseFloat(
    execSync(`ffprobe -i "${finalPath}" -show_entries format=duration -v quiet -of csv="p=0"`)
      .toString().trim()
  );

  console.log(`   ✅ Final video: ${finalPath}`);
  console.log(`   📦 Size: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);
  console.log(`   ⏱️  Duration: ${duration.toFixed(1)}s (~${(duration / 60).toFixed(1)} min)`);

  return finalPath;
}

// ─── Step 5: Upload ───

async function upload(videoPath: string, script: any): Promise<string> {
  console.log('\n📤 Step 5: Uploading to YouTube...\n');

  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const youtube = google.youtube({ version: 'v3', auth: oauth2 });
  const { createReadStream } = await import('fs');

  const description = `${script.description}

🤖 Meet Cosmo the Robot! Join Cosmo on a fun counting adventure as we build colorful towers and learn numbers 1-10!

🎓 What kids will learn:
• Counting from 1 to 10
• Number recognition
• Colors and building
• Following along and participation

👶 Perfect for ages 2-5

📺 Subscribe to Super Builders for more educational adventures!

#SuperBuilders #KidsLearning #Counting #Numbers #Educational #Preschool #Toddler #LearnToCount`;

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: script.title,
        description,
        tags: script.tags,
        categoryId: '27', // Education
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: 'private',
        selfDeclaredMadeForKids: true,
      },
    },
    media: {
      body: createReadStream(videoPath),
    },
  });

  const videoId = res.data.id!;
  console.log(`   ✅ Uploaded! Video ID: ${videoId}`);
  console.log(`   🔗 URL: https://youtube.com/watch?v=${videoId}`);
  console.log(`   🔒 Status: private`);
  return videoId;
}

// ─── Main ───

async function main() {
  const start = Date.now();
  console.log('🚀 Super Builders — Professional Video Pipeline');
  console.log(`   Output: ${OUTPUT_DIR}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const script = await generateScript();
  await writeFile(resolve(OUTPUT_DIR, 'script.json'), JSON.stringify(script, null, 2));

  const audioPaths = await generateVoiceSegments(script.scenes, OUTPUT_DIR);
  const clipPaths = await generateVideoClips(script.scenes, OUTPUT_DIR);
  const finalPath = await assembleVideo(clipPaths, audioPaths, OUTPUT_DIR);
  const videoId = await upload(finalPath, script);

  const elapsed = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\n🎉 Done in ${elapsed} minutes!`);
  console.log(`   🔗 https://youtube.com/watch?v=${videoId}`);

  // Save metadata
  await writeFile(resolve(OUTPUT_DIR, 'metadata.json'), JSON.stringify({
    videoId,
    title: script.title,
    scenes: script.scenes.length,
    elapsed: `${elapsed} min`,
    timestamp: new Date().toISOString(),
  }, null, 2));
}

main().catch(err => {
  console.error('\n❌ Pipeline failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
