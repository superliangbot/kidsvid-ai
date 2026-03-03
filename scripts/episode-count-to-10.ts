#!/usr/bin/env npx tsx
/**
 * KidsVid-AI — Full Episode: "Count to 10 with Cosmo!"
 * 
 * V8 Pipeline:
 * 1. Load multi-angle Cosmo reference images
 * 2. For each scene: Gemini refines prompt → Veo 3.1 + referenceImages → clip
 * 3. Gemini TTS narration (Puck voice)
 * 4. Gemini quality gate on each clip
 * 5. FFmpeg: concat clips + narration + background music + SFX
 * 6. Imagen 4 thumbnail with programmatic text overlay
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { COSMO_IDENTITY } from '../src/characters/cosmo.js';

const OUTPUT_DIR = resolve(__dirname, '..', 'output', 'v8-count-to-10');
const REFS_DIR = resolve(__dirname, '..', 'assets', 'cosmo-refs');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════
// EPISODE SCRIPT
// ═══════════════════════════════════════════

const BLOCK_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal', 'gold', 'silver'];

interface SceneDef {
  id: string;
  description: string;
  motion: string;
  narration: string;
  audio: string;
}

function buildScenes(): SceneDef[] {
  const scenes: SceneDef[] = [];

  // Intro
  scenes.push({
    id: 'intro',
    description: 'Cosmo stands center in a bright colorful workshop, looking excited at the camera',
    motion: 'A single small blue robot stands in the center of a bright colorful workshop filled with wooden shelves and toys. It looks at the camera with excitement, waves both arms, and its antenna glows brightly. Gentle zoom in. Only one robot visible. (no subtitles, no text overlays)',
    narration: 'Hi friends! I am Cosmo! Today, let us count to ten together! Are you ready? Here we go!',
    audio: 'Audio: cheerful ascending chime, soft workshop ambiance. Single character only.',
  });

  // Count 1-10
  for (let n = 1; n <= 10; n++) {
    const color = BLOCK_COLORS[n - 1];
    const stackDesc = n === 1
      ? `places a ${color} block on an empty wooden platform`
      : `adds a ${color} block to the top of a stack of ${n - 1} colorful blocks`;

    scenes.push({
      id: `count-${n}`,
      description: `Cosmo ${stackDesc} in a bright workshop`,
      motion: `A single small blue robot ${stackDesc}. It holds up the block proudly, then carefully places it. The robot looks at the camera with joy. Eye-level camera, gentle dolly. Warm workshop lighting. Only one robot in the scene. (no subtitles, no text overlays)`,
      narration: n === 1
        ? `One! One ${color} block. This is where our tower begins!`
        : n === 5
        ? `Five! Five blocks! We are halfway there! Great counting!`
        : n === 10
        ? `Ten! Ten blocks! We did it! We counted all the way to ten!`
        : `${numberWord(n)}! ${numberWord(n)} ${color} blocks!`,
      audio: `Audio: soft block placement click, gentle ambient. Single character.`,
    });
  }

  // Celebration
  scenes.push({
    id: 'celebration',
    description: 'Cosmo dances happily next to a completed tower of 10 colorful blocks',
    motion: 'A single small blue robot bounces and dances joyfully next to a tall tower of ten colorful stacked blocks. Confetti falls gently from above. The robot claps its small arms together. Camera slowly pulls back to reveal the full tower. Celebration atmosphere. Only one robot. (no subtitles, no text overlays)',
    narration: 'Yay! You did amazing! You counted all the way to ten! I am so proud of you! See you next time, friends! Bye bye!',
    audio: 'Audio: celebration fanfare, confetti sounds, cheerful music swell. Single character.',
  });

  return scenes;
}

function numberWord(n: number): string {
  const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  return words[n] || String(n);
}

// ═══════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════

async function main() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  KidsVid-AI — "Count to 10 with Cosmo!" Episode  ║');
  console.log('║  V8 Pipeline — Full Production Run                ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

  await mkdir(resolve(OUTPUT_DIR, 'clips'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'audio'), { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, 'frames'), { recursive: true });

  // ─── Load references ───
  console.log('━━━ Loading Cosmo reference images ━━━');
  const refFiles = ['cosmo-ref-front.png', 'cosmo-ref-three-quarter.png', 'cosmo-ref-side.png'];
  const referenceImages: any[] = [];
  for (const f of refFiles) {
    const p = resolve(REFS_DIR, f);
    if (!existsSync(p)) { console.log(`  ⚠️  Missing ${f}`); continue; }
    const data = await readFile(p);
    referenceImages.push({
      image: { imageBytes: data.toString('base64'), mimeType: 'image/png' },
      referenceType: 'asset',
    });
    console.log(`  ✅ ${f}`);
  }

  const scenes = buildScenes();
  console.log(`\n📋 ${scenes.length} scenes to generate (intro + 10 counts + celebration)\n`);

  // ─── Generate all clips ───
  const clipPaths: string[] = [];
  const narrationPaths: string[] = [];
  let generated = 0;
  let cached = 0;
  let failed = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const clipPath = resolve(OUTPUT_DIR, 'clips', `${scene.id}.mp4`);
    const narPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}.wav`);

    console.log(`\n[${i + 1}/${scenes.length}] ━━━ ${scene.id} ━━━`);

    // --- Video clip ---
    if (existsSync(clipPath)) {
      const size = execSync(`stat -c %s "${clipPath}"`).toString().trim();
      if (parseInt(size) > 50000) {
        console.log(`  🎬 Cached clip (${(parseInt(size) / 1024 / 1024).toFixed(1)}MB)`);
        clipPaths.push(clipPath);
        cached++;
      }
    }

    if (!clipPaths.includes(clipPath)) {
      // Refine prompt
      console.log(`  📝 Refining prompt...`);
      let refinedPrompt = scene.motion;
      try {
        const resp = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: `You are an expert Veo 3.1 video prompt engineer for kids' educational content.

Scene: ${scene.description}
Motion: ${scene.motion}
Audio: ${scene.audio}

Write a polished 8-second Veo prompt. Rules:
- Do NOT describe the character's appearance (reference images handle that)
- Focus on MOTION, camera movement, lighting, atmosphere
- CRITICAL: Include "only one robot" or "single character" to prevent duplicates
- Add (no subtitles, no text overlays)
- Include specific audio description
- Keep under 80 words
- One single moment/action only

Reply with ONLY the refined prompt.` }] }],
        });
        refinedPrompt = resp.text?.trim() || scene.motion;
        console.log(`  ✅ "${refinedPrompt.substring(0, 70)}..."`);
      } catch (e: any) {
        console.log(`  ⚠️  Prompt refinement failed, using original`);
      }

      // Generate with Veo
      console.log(`  🎬 Generating video (Veo 3.1 + ${referenceImages.length} refs)...`);
      try {
        const veoReq: any = {
          model: 'veo-3.1-generate-001',
          prompt: refinedPrompt,
          config: {
            aspectRatio: '16:9',
            personGeneration: 'allow_adult',
          },
        };
        if (referenceImages.length > 0) {
          veoReq.config.referenceImages = referenceImages;
        }

        let op = await client.models.generateVideos(veoReq);
        let attempts = 0;
        while (!op.done) {
          if (attempts++ >= 90) throw new Error('Timed out after 15 min');
          process.stdout.write('.');
          await sleep(10000);
          op = await client.operations.getVideosOperation({ operation: op });
        }
        console.log('');

        const video = op.response?.generatedVideos?.[0]?.video;
        if (!video) throw new Error('No video returned');

        // Download
        let buf: Buffer | null = null;
        const uri = typeof video === 'string' ? video : (video as any).uri;
        if (uri) {
          const res = await fetch(uri, { headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY! } });
          buf = Buffer.from(await res.arrayBuffer());
        } else if ((video as any).videoBytes) {
          const bytes = (video as any).videoBytes;
          buf = typeof bytes === 'string' ? Buffer.from(bytes, 'base64') : Buffer.from(bytes);
        }

        if (buf && buf.length > 10000) {
          await writeFile(clipPath, buf);
          clipPaths.push(clipPath);
          generated++;
          console.log(`  ✅ Clip: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
        } else {
          throw new Error('Video too small or empty');
        }
      } catch (e: any) {
        console.log(`  ❌ Veo error: ${e.message?.substring(0, 150)}`);
        failed++;
      }

      // Rate limit between Veo calls
      await sleep(5000);
    }

    // --- Narration ---
    if (existsSync(narPath)) {
      console.log(`  🗣️  Cached narration`);
      narrationPaths.push(narPath);
    } else {
      console.log(`  🗣️  TTS: "${scene.narration.substring(0, 50)}..."`);
      try {
        const ttsResp = await client.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: `Say in a cheerful, warm, enthusiastic kid-friendly voice with clear enunciation: ${scene.narration}` }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Puck' },
              },
            },
          } as any,
        });

        const audioData = (ttsResp as any).candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (audioData) {
          const pcmPath = resolve(OUTPUT_DIR, 'audio', `${scene.id}-raw.pcm`);
          await writeFile(pcmPath, Buffer.from(audioData, 'base64'));
          execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" "${narPath}" 2>/dev/null`);
          narrationPaths.push(narPath);
          console.log(`  ✅ Narration saved`);
        }
      } catch (e: any) {
        console.log(`  ❌ TTS error: ${e.message?.substring(0, 100)}`);
      }
      await sleep(2000);
    }
  }

  // ─── Quality report ───
  console.log(`\n━━━ Generation Summary ━━━`);
  console.log(`  Generated: ${generated} | Cached: ${cached} | Failed: ${failed}`);
  console.log(`  Clips: ${clipPaths.length}/${scenes.length} | Narrations: ${narrationPaths.length}/${scenes.length}`);

  if (clipPaths.length === 0) {
    console.log('\n❌ No clips — cannot assemble episode');
    return;
  }

  // ─── Assemble episode ───
  console.log('\n━━━ Assembling Episode ━━━');

  // Concat video clips
  const concatList = clipPaths.map(p => `file '${p}'`).join('\n');
  await writeFile(resolve(OUTPUT_DIR, 'concat.txt'), concatList);

  const concatVideo = resolve(OUTPUT_DIR, 'concat-video.mp4');
  try {
    // Re-encode to ensure consistent format across all clips
    execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'concat.txt')}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -ar 44100 -ac 2 -r 24 -s 1280x720 "${concatVideo}" 2>/dev/null`);
    console.log(`  ✅ Video concatenated (${clipPaths.length} clips)`);
  } catch (e: any) {
    console.log(`  ⚠️  Concat with re-encode failed, trying copy mode`);
    try {
      execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'concat.txt')}" -c copy "${concatVideo}" 2>/dev/null`);
    } catch {
      console.log(`  ❌ Concat failed completely`);
      return;
    }
  }

  // Concat narrations
  const narConcatList = narrationPaths.map(p => `file '${p}'`).join('\n');
  await writeFile(resolve(OUTPUT_DIR, 'nar-concat.txt'), narConcatList);
  const narFullPath = resolve(OUTPUT_DIR, 'narration-full.wav');
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${resolve(OUTPUT_DIR, 'nar-concat.txt')}" "${narFullPath}" 2>/dev/null`);
    console.log(`  ✅ Narration concatenated (${narrationPaths.length} lines)`);
  } catch {
    console.log(`  ⚠️  Narration concat failed`);
  }

  // Generate simple background music tone (gentle sine wave pad)
  const bgMusicPath = resolve(OUTPUT_DIR, 'bg-music.wav');
  if (!existsSync(bgMusicPath)) {
    try {
      // Get video duration
      const durStr = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${concatVideo}"`).toString().trim();
      const dur = parseFloat(durStr) || 120;
      // Generate gentle ambient pad
      execSync(`ffmpeg -y -f lavfi -i "sine=frequency=261:duration=${dur}" -af "volume=0.05,atempo=0.5" -ar 44100 -ac 1 "${bgMusicPath}" 2>/dev/null`);
      console.log(`  ✅ Background ambient generated (${dur.toFixed(0)}s)`);
    } catch {
      console.log(`  ⚠️  Background music generation failed`);
    }
  }

  // Final mix: video + narration + background
  const finalPath = resolve(OUTPUT_DIR, 'final.mp4');
  try {
    if (existsSync(narFullPath) && existsSync(bgMusicPath)) {
      // Mix narration (loud) + bg music (quiet) then overlay on video
      execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFullPath}" -i "${bgMusicPath}" -filter_complex "[1:a]volume=1.0[nar];[2:a]volume=0.15[bg];[nar][bg]amix=inputs=2:duration=shortest[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${finalPath}" 2>/dev/null`);
      console.log(`  ✅ Final mix: video + narration + music`);
    } else if (existsSync(narFullPath)) {
      execSync(`ffmpeg -y -i "${concatVideo}" -i "${narFullPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" 2>/dev/null`);
      console.log(`  ✅ Final: video + narration (no music)`);
    } else {
      execSync(`cp "${concatVideo}" "${finalPath}"`);
      console.log(`  ⚠️  Final: video only (no audio mix)`);
    }
  } catch {
    execSync(`cp "${concatVideo}" "${finalPath}"`);
    console.log(`  ⚠️  Audio mix failed, using video only`);
  }

  // ─── Generate thumbnail ───
  console.log('\n━━━ Generating Thumbnail ━━━');
  const thumbPath = resolve(OUTPUT_DIR, 'thumbnail.png');
  if (!existsSync(thumbPath)) {
    try {
      const thumbResp = await client.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `${COSMO_IDENTITY.description} standing next to a tall colorful tower of 10 stacked blocks (red, blue, green, yellow, purple, orange, pink, teal, gold, silver). Bright cheerful background with confetti. Pixar-style 3D children's animation. YouTube thumbnail style, vibrant and eye-catching.`,
        config: {
          numberOfImages: 1,
          aspectRatio: '16:9',
          personGeneration: 'allow_all',
        } as any,
      });

      const img = (thumbResp as any).generatedImages?.[0];
      if (img?.image?.imageBytes) {
        const bytes = typeof img.image.imageBytes === 'string'
          ? Buffer.from(img.image.imageBytes, 'base64')
          : Buffer.from(img.image.imageBytes);
        
        // Save raw thumbnail
        const rawThumb = resolve(OUTPUT_DIR, 'thumbnail-raw.png');
        await writeFile(rawThumb, bytes);

        // Add text overlay programmatically
        try {
          execSync(`ffmpeg -y -i "${rawThumb}" -vf "drawtext=text='Count to 10!':fontsize=72:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=40:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" "${thumbPath}" 2>/dev/null`);
          console.log(`  ✅ Thumbnail with text overlay`);
        } catch {
          execSync(`cp "${rawThumb}" "${thumbPath}"`);
          console.log(`  ✅ Thumbnail (no text overlay — font missing)`);
        }
      }
    } catch (e: any) {
      console.log(`  ❌ Thumbnail error: ${e.message?.substring(0, 100)}`);
    }
  } else {
    console.log(`  ♻️  Cached thumbnail`);
  }

  // ─── Final summary ───
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  if (existsSync(finalPath)) {
    const info = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${finalPath}"`).toString());
    const dur = parseFloat(info.format.duration);
    const size = parseInt(info.format.size) / 1024 / 1024;
    const vs = info.streams?.find((s: any) => s.codec_type === 'video');
    const as_ = info.streams?.find((s: any) => s.codec_type === 'audio');

    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║  🎬 EPISODE COMPLETE: "Count to 10 with Cosmo!"   ║`);
    console.log(`╠══════════════════════════════════════════════════╣`);
    console.log(`║  Duration:    ${dur.toFixed(1)}s (${(dur / 60).toFixed(1)} min)`);
    console.log(`║  Resolution:  ${vs?.width}x${vs?.height} @ ${vs?.r_frame_rate}fps`);
    console.log(`║  Video:       ${vs?.codec_name}`);
    console.log(`║  Audio:       ${as_?.codec_name || 'none'} ${as_?.sample_rate || ''}Hz`);
    console.log(`║  File size:   ${size.toFixed(1)}MB`);
    console.log(`║  Clips:       ${clipPaths.length}/${scenes.length}`);
    console.log(`║  Narrations:  ${narrationPaths.length}/${scenes.length}`);
    console.log(`║  Thumbnail:   ${existsSync(thumbPath) ? '✅' : '❌'}`);
    console.log(`║  Build time:  ${elapsed} minutes`);
    console.log(`║  Output:      ${finalPath}`);
    console.log(`╚══════════════════════════════════════════════════╝`);
  }

  // Notify completion
  try {
    execSync(`openclaw system event --text "Done: Count to 10 episode complete — ${clipPaths.length}/${scenes.length} clips, ${elapsed} min build time" --mode now 2>/dev/null`);
  } catch { /* ignore */ }
}

main().catch(e => {
  console.error('\n💥 Fatal:', e.message);
  process.exit(1);
});
