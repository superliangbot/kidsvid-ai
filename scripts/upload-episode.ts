#!/usr/bin/env npx tsx
/**
 * Upload "Count to 10 with Cosmo!" to YouTube as private.
 */
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { google } from 'googleapis';

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v8-count-to-10');

async function main() {
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

  const youtube = google.youtube({ version: 'v3', auth: oauth2 });

  console.log('📤 Uploading "Count to 10 with Cosmo!" (private)...\n');

  const videoPath = resolve(OUTPUT_DIR, 'final.mp4');
  const thumbPath = resolve(OUTPUT_DIR, 'thumbnail.png');

  // Upload video
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: 'Count to 10 with Cosmo! 🤖🔢 | Learn Numbers for Kids',
        description: `Join Cosmo the friendly robot as he counts to 10 with colorful blocks! 🧱✨

🔵 Meet Cosmo — a cute little blue robot who loves to learn!
🔢 Count along from 1 to 10
🎨 Beautiful colorful blocks stack up into a tower
🎉 Celebrate when you reach 10!

Perfect for toddlers and preschoolers learning to count. Fun, engaging, and educational!

#counting #learntocount #kidsvideo #educational #preschool #toddler #numbers #cosmo #robot #SuperBuilders`,
        tags: [
          'counting', 'learn to count', 'numbers for kids', 'count to 10',
          'preschool', 'toddler', 'educational', 'kids learning',
          'robot', 'cosmo', 'colorful blocks', 'super builders',
          'counting for toddlers', 'learn numbers', 'kids video',
        ],
        categoryId: '22', // People & Blogs (or 27 for Education)
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en',
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

  const videoId = res.data.id;
  console.log(`✅ Video uploaded!`);
  console.log(`   ID: ${videoId}`);
  console.log(`   URL: https://youtu.be/${videoId}`);
  console.log(`   Status: PRIVATE`);

  // Set thumbnail
  try {
    await youtube.thumbnails.set({
      videoId: videoId!,
      media: {
        body: createReadStream(thumbPath),
      },
    });
    console.log(`   Thumbnail: ✅ set`);
  } catch (e: any) {
    console.log(`   Thumbnail: ⚠️ ${e.message?.substring(0, 100)}`);
  }

  console.log(`\n🔗 Review at: https://studio.youtube.com/video/${videoId}/edit`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
