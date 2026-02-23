#!/usr/bin/env npx tsx
/**
 * Upload V5 final video to YouTube (private)
 * Run this after pro-video-v5.ts completes with --no-upload
 */
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const VIDEO_PATH = resolve(__dirname, '..', 'output', 'v5', 'final.mp4');

async function main() {
  console.log(`📤 Uploading ${VIDEO_PATH} to YouTube (PRIVATE)...\n`);

  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

  const youtube = google.youtube({ version: 'v3', auth: oauth2 });

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: '🧱 Count to 10 with Cosmo! | Building Blocks for Kids | Super Builders',
        description: `Count from 1 to 10 with Cosmo the friendly robot! Watch as Cosmo builds a rainbow tower of blocks, one at a time. Perfect for toddlers and preschoolers learning to count. 🤖🧱✨

🔢 Learn numbers 1-10
🌈 Beautiful colors  
🏗️ Building and counting fun

Subscribe to Super Builders for more educational fun! ⭐`,
        tags: [
          'counting', 'numbers', '1 to 10', 'learn to count', 'kids', 'toddler',
          'preschool', 'educational', 'building blocks', 'robot', 'animation',
          'Super Builders', 'Cosmo', 'math for kids', 'counting song',
        ],
        categoryId: '22',
      },
      status: {
        privacyStatus: 'private',
        selfDeclaredMadeForKids: true,
      },
    },
    media: {
      body: createReadStream(VIDEO_PATH),
    },
  });

  const videoId = res.data.id!;
  console.log(`✅ Uploaded: https://youtube.com/watch?v=${videoId} (PRIVATE)`);
  console.log(`   Review at: https://studio.youtube.com/video/${videoId}/edit`);
}

main().catch(err => {
  console.error('❌ Upload failed:', err);
  process.exit(1);
});
