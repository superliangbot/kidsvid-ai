import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSETS_DIR = path.resolve(__dirname, "../public/assets");

fs.mkdirSync(ASSETS_DIR, { recursive: true });

async function downloadImage(url: string, filepath: string) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filepath, buf);
  console.log(`Saved: ${filepath} (${(buf.length / 1024).toFixed(0)}KB)`);
}

async function generateDalle(prompt: string, filename: string, size: "1024x1024" | "1792x1024" = "1024x1024") {
  const filepath = path.join(ASSETS_DIR, filename);
  if (fs.existsSync(filepath)) {
    console.log(`Skip (exists): ${filename}`);
    return;
  }
  console.log(`Generating: ${filename}...`);
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size,
    quality: "standard",
  });
  await downloadImage(response.data[0].url!, filepath);
}

async function generateTTS(text: string, filename: string) {
  const filepath = path.join(ASSETS_DIR, filename);
  if (fs.existsSync(filepath)) {
    console.log(`Skip (exists): ${filename}`);
    return;
  }
  console.log(`TTS: ${filename}...`);
  const response = await openai.audio.speech.create({
    model: "tts-1-hd",
    voice: "nova",
    speed: 0.85,
    input: text,
  });
  const buf = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filepath, buf);
  console.log(`Saved: ${filename} (${(buf.length / 1024).toFixed(0)}KB)`);
}

function generateSFX() {
  // Pop sound
  const pop = path.join(ASSETS_DIR, "sfx_pop.mp3");
  if (!fs.existsSync(pop)) {
    execSync(`ffmpeg -f lavfi -i "sine=frequency=800:duration=0.1" -af "afade=t=out:st=0.05:d=0.05" -y "${pop}" 2>/dev/null`);
    console.log("Generated sfx_pop.mp3");
  }
  // Ding sound
  const ding = path.join(ASSETS_DIR, "sfx_ding.mp3");
  if (!fs.existsSync(ding)) {
    execSync(`ffmpeg -f lavfi -i "sine=frequency=1200:duration=0.3" -af "afade=t=out:st=0.1:d=0.2" -y "${ding}" 2>/dev/null`);
    console.log("Generated sfx_ding.mp3");
  }
  // Fanfare
  const fanfare = path.join(ASSETS_DIR, "sfx_fanfare.mp3");
  if (!fs.existsSync(fanfare)) {
    execSync(`ffmpeg -f lavfi -i "sine=frequency=523:duration=0.2" -f lavfi -i "sine=frequency=659:duration=0.2" -f lavfi -i "sine=frequency=784:duration=0.4" -filter_complex "[0][1][2]concat=n=3:v=0:a=1,afade=t=out:st=0.6:d=0.2" -y "${fanfare}" 2>/dev/null`);
    console.log("Generated sfx_fanfare.mp3");
  }
  // BGM - simple upbeat loop
  const bgm = path.join(ASSETS_DIR, "bgm.mp3");
  if (!fs.existsSync(bgm)) {
    // Create a cheerful repeating melody pattern
    execSync(`ffmpeg -f lavfi -i "sine=frequency=523:duration=0.25" -f lavfi -i "sine=frequency=659:duration=0.25" -f lavfi -i "sine=frequency=784:duration=0.25" -f lavfi -i "sine=frequency=659:duration=0.25" -filter_complex "[0][1][2][3]concat=n=4:v=0:a=1[mel];[mel]aloop=loop=60:size=44100,volume=0.15,afade=t=in:st=0:d=1,afade=t=out:st=58:d=2" -t 60 -y "${bgm}" 2>/dev/null`);
    console.log("Generated bgm.mp3");
  }
}

async function main() {
  console.log("=== Generating AI Assets ===\n");

  // Step 1: Cosmo character
  await generateDalle(
    "A friendly small blue robot character named Cosmo with big round brown eyes, a warm smile, small antenna on head, round body, short arms and legs. 3D Pixar-style children's animation. Transparent/white background. Front-facing pose, waving.",
    "cosmo.png"
  );

  // Step 2: Background
  await generateDalle(
    "A bright cheerful children's construction workshop background. Colorful walls, soft lighting, simple and clean. 3D Pixar style. No characters or objects in foreground. 1920x1080.",
    "background.png",
    "1792x1024"
  );

  // Step 3: 10 colored blocks
  const blockColors = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "cyan", "white", "gold"];
  for (let i = 0; i < blockColors.length; i++) {
    await generateDalle(
      `A single large 3D cube building block, solid ${blockColors[i]} color, slight rounded corners. Clean white/transparent background. Children's toy style, Pixar quality. Simple, centered.`,
      `block_${i + 1}_${blockColors[i]}.png`
    );
  }

  // Step 4: Number graphics 1-10
  for (let i = 1; i <= 10; i++) {
    await generateDalle(
      `The number ${i} as a big, colorful, kid-friendly 3D number with sparkles and a slight glow. Pixar style. White/transparent background. Centered.`,
      `num_${i}.png`
    );
  }

  // Step 5: Sound effects & BGM
  console.log("\n=== Generating Sound Effects ===\n");
  generateSFX();

  // Step 6: Voice narration
  console.log("\n=== Generating Voice Narration ===\n");
  const voiceScripts: Record<string, string> = {
    voice_intro: "Hi super builders! I'm Cosmo! Today we're going to count to TEN with building blocks! Are you ready? Let's go!",
    voice_1: "Here's our first block! ONE! Can you say ONE? ... ONE! Great job!",
    voice_2: "Now let's add another! TWO! Can you say TWO? ... TWO! Amazing!",
    voice_3: "Here comes number THREE! Can you say THREE? ... THREE! You're so smart!",
    voice_4: "Look! FOUR blocks! Can you say FOUR? ... FOUR! Awesome!",
    voice_5: "FIVE! High five! We made it to FIVE! Let's count them all — one, two, three, four, FIVE! Woohoo!",
    voice_6: "Keep going! SIX! Can you say SIX? ... SIX! Our tower is getting tall!",
    voice_7: "SEVEN blocks high! Can you say SEVEN? ... SEVEN! Wow!",
    voice_8: "EIGHT! Can you say EIGHT? ... EIGHT! Almost there!",
    voice_9: "NINE! Just one more! Can you say NINE? ... NINE!",
    voice_10: "TEN! We did it! TEN blocks! Let's count them all — one, two, three, four, five, six, seven, eight, nine, TEN! AMAZING!",
    voice_outro: "Great counting, super builders! You counted all the way to ten! Subscribe for more fun! See you next time! Bye bye!",
  };

  for (const [name, text] of Object.entries(voiceScripts)) {
    await generateTTS(text, `${name}.mp3`);
  }

  // Get voice durations
  console.log("\n=== Voice Durations ===\n");
  const durations: Record<string, number> = {};
  for (const name of Object.keys(voiceScripts)) {
    const filepath = path.join(ASSETS_DIR, `${name}.mp3`);
    try {
      const result = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filepath}"`).toString().trim();
      durations[name] = parseFloat(result);
      console.log(`${name}: ${durations[name].toFixed(2)}s`);
    } catch { }
  }

  // Write durations file for Remotion to use
  fs.writeFileSync(
    path.join(ASSETS_DIR, "durations.json"),
    JSON.stringify(durations, null, 2)
  );
  console.log("\nSaved durations.json");
  console.log("\n=== Done! ===");
}

main().catch(console.error);
