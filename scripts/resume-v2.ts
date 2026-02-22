#!/usr/bin/env npx tsx
/**
 * Resume V2 pipeline — skip existing images/voice, generate only missing clips, then assemble + upload
 */
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile } from 'fs/promises';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v2');
const VEO_DELAY_MS = 150_000;

async function main() {
  const script = JSON.parse(await readFile(resolve(OUTPUT_DIR, 'script.json'), 'utf8'));
  console.log(`📋 ${script.title} — ${script.scenes.length} scenes\n`);

  // Check status
  const missing: number[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const clipPath = resolve(OUTPUT_DIR, `clip_${i}.mp4`);
    if (existsSync(clipPath)) {
      const size = (await readFile(clipPath)).length;
      if (size > 50000) {
        console.log(`   ✅ Clip ${i} exists (${(size / 1024 / 1024).toFixed(1)}MB)`);
        continue;
      }
    }
    missing.push(i);
    console.log(`   ⬜ Clip ${i} missing — ${script.scenes[i].id}`);
  }

  if (missing.length === 0) {
    console.log('\n   All clips exist! Skipping to assembly.\n');
  } else {
    console.log(`\n🎬 Generating ${missing.length} missing clips...\n`);

    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

    for (let idx = 0; idx < missing.length; idx++) {
      const i = missing[idx];
      const scene = script.scenes[i];
      const clipPath = resolve(OUTPUT_DIR, `clip_${i}.mp4`);
      const imgPath = resolve(OUTPUT_DIR, `ref_${i}.png`);

      if (idx > 0) {
        console.log(`   ⏳ Waiting 2.5 min...`);
        await new Promise(r => setTimeout(r, VEO_DELAY_MS));
      }

      console.log(`   🎬 Clip ${i + 1}/15 [${scene.phase}] ${scene.id}`);

      try {
        const veoDuration = scene.durationSec <= 5 ? 4 : scene.durationSec <= 7 ? 6 : 8;

        // Use image-to-video if reference image exists
        const genConfig: any = {
          model: 'veo-3.1-generate-preview',
          prompt: `${scene.videoPrompt}. Bright colorful 3D children's animation, child-safe, ages 2-5.`,
          config: { aspectRatio: '16:9', durationSeconds: veoDuration, personGeneration: 'allow_all' },
        };

        if (existsSync(imgPath)) {
          const imgData = await readFile(imgPath);
          genConfig.referenceImages = [{
            image: { imageBytes: imgData.toString('base64'), mimeType: 'image/png' },
            operation: 'SUBJECT_REFERENCE',
          }];
        }

        let operation = await client.models.generateVideos(genConfig);

        let attempts = 0;
        while (!operation.done) {
          if (attempts++ >= 60) throw new Error('Timed out');
          await new Promise(r => setTimeout(r, 10_000));
          operation = await client.operations.getVideosOperation({ operation });
        }

        const video = operation.response?.generatedVideos?.[0]?.video;
        if (!video) throw new Error('No video returned');
        const videoUri = typeof video === 'string' ? video : (video as any).uri;
        const videoRes = await fetch(videoUri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
        if (!videoRes.ok) throw new Error(`Download ${videoRes.status}`);
        const buf = Buffer.from(await videoRes.arrayBuffer());
        await writeFile(clipPath, buf);
        console.log(`   ✅ Clip ${i + 1} saved (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
      } catch (err: any) {
        console.log(`   ⚠️  Veo failed: ${err.message.slice(0, 100)}`);
        // Ken Burns fallback on reference image
        if (existsSync(imgPath)) {
          execSync(`ffmpeg -loop 1 -i "${imgPath}" -vf "scale=1920:1080,zoompan=z='min(zoom+0.002,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${scene.durationSec * 25}:s=1280x720:fps=25" -c:v libx264 -t ${scene.durationSec} -pix_fmt yuv420p -y "${clipPath}" 2>/dev/null`);
          console.log(`   📦 Ken Burns fallback used`);
        } else {
          const colors = ['0x3498db', '0xe74c3c', '0x2ecc71', '0xf39c12', '0x9b59b6', '0x1abc9c'];
          execSync(`ffmpeg -f lavfi -i color=c=${colors[i % 6]}:s=1280x720:d=${scene.durationSec} -c:v libx264 -pix_fmt yuv420p -y "${clipPath}" 2>/dev/null`);
        }
      }
    }
  }

  // Assemble
  console.log('\n🎞️ Assembling final video...\n');
  const segPaths: string[] = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const clipPath = resolve(OUTPUT_DIR, `clip_${i}.mp4`);
    const audioPath = resolve(OUTPUT_DIR, `voice_${i}.mp3`);
    const segPath = resolve(OUTPUT_DIR, `segment_${i}.mp4`);

    const audioDur = parseFloat(
      execSync(`ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
    );
    const totalDur = audioDur + 0.5;

    execSync(`ffmpeg -stream_loop -1 -i "${clipPath}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -t ${totalDur} -pix_fmt yuv420p -y "${segPath}" 2>/dev/null`);
    segPaths.push(segPath);
  }

  const concatFile = resolve(OUTPUT_DIR, 'concat.txt');
  await writeFile(concatFile, segPaths.map(p => `file '${p}'`).join('\n'));
  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');

  execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -y "${finalPath}" 2>/dev/null`);

  const fileSize = (await readFile(finalPath)).length;
  const duration = parseFloat(
    execSync(`ffprobe -i "${finalPath}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
  );
  console.log(`   ✅ Final: ${(fileSize / 1024 / 1024).toFixed(1)}MB, ${duration.toFixed(1)}s (~${(duration / 60).toFixed(1)} min)`);

  // Upload
  console.log('\n📤 Uploading...\n');
  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const youtube = google.youtube({ version: 'v3', auth: oauth2 });
  const { createReadStream } = await import('fs');

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: script.title,
        description: `${script.description}\n\n🤖 Join Cosmo the Robot for a fun counting adventure! Build a colorful tower and learn numbers 1-10!\n\n🎓 Kids will learn:\n• Counting 1-10\n• Number recognition\n• Colors\n• Following along\n\n👶 Ages 2-5\n\n📺 Subscribe to Super Builders!\n\n#SuperBuilders #KidsLearning #Counting #Numbers #Educational #Preschool`,
        tags: script.tags,
        categoryId: '27',
        defaultLanguage: 'en',
      },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: true },
    },
    media: { body: createReadStream(finalPath) },
  });

  console.log(`   ✅ Video ID: ${res.data.id}`);
  console.log(`   🔗 https://youtube.com/watch?v=${res.data.id}`);
  console.log('\n🎉 Done!');
}

main().catch(err => { console.error('❌', err.message, err.stack); process.exit(1); });
