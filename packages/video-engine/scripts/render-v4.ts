import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";

const OUTPUT_DIR = path.resolve(__dirname, "../../../output/v4");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "final.mp4");

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("Bundling Remotion project...");
  const bundleLocation = await bundle({
    entryPoint: path.resolve(__dirname, "../src/index.ts"),
    publicDir: path.resolve(__dirname, "../public"),
  });

  console.log("Selecting composition...");
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "CountingVideo",
  });

  console.log(`Rendering ${composition.durationInFrames} frames at ${composition.fps}fps (${(composition.durationInFrames / composition.fps).toFixed(1)}s)...`);

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: OUTPUT_FILE,
    onProgress: ({ progress }) => {
      if (Math.round(progress * 100) % 10 === 0) {
        process.stdout.write(`\rProgress: ${Math.round(progress * 100)}%`);
      }
    },
  });

  console.log(`\n\nRendered to: ${OUTPUT_FILE}`);
  const stat = fs.statSync(OUTPUT_FILE);
  console.log(`File size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Duration: ${(composition.durationInFrames / composition.fps).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
