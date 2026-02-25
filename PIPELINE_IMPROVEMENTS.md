# KidsVid-AI Pipeline Improvements Task

## Context
This is an AI-powered kids educational YouTube video pipeline. Current state: 10 videos uploaded (all private), 321 tests passing, Veo video generation working but with character consistency issues.

## Research Summary (from deep research on Feb 25, 2026)
Full research docs at: ~/.openclaw/workspace/knowledge/references/veo-pipeline-research-2026-02.md

## Critical Bugs to Fix First

### 1. Fix Gemini API calls
The current `pro-video-v7.ts` uses `referenceImages` with `SUBJECT_REFERENCE` and `generateAudio` — these are **Vertex AI only** features. The Gemini API does NOT support them.

**Correct Gemini API usage:**
```typescript
// Image-to-video (use `image` directly, NOT referenceImages)
const operation = await client.models.generateVideos({
  model: 'veo-3.0-generate-001',  // or veo-2.0, veo-3.0-fast
  prompt: 'motion prompt here',
  image: { imageBytes: base64, mimeType: 'image/png' },  // starting frame
  config: {
    aspectRatio: '16:9',
    negativePrompt: 'blurry, distorted, morphing, text overlays, subtitles',
  },
});
```

### 2. Add negativePrompt to all Veo calls
Always include: `"blurry, distorted, inconsistent character, morphing, text overlays, subtitles, watermark"`

## Character Consistency Overhaul (The Big One)

### The "Forensic" Approach (from Google Cloud)
Instead of just passing a reference image to Veo and hoping, we need a multi-stage pipeline:

1. **Create Cosmo's Identity Profile**: Use Gemini to analyze the Cosmo reference image and produce a structured description (adapt the FacialCompositeProfile concept for a robot character):
   - Body: small, round, blue metallic body
   - Head: round head, glowing yellow antenna on top
   - Eyes: big round brown eyes with warm expression
   - Arms: stubby short arms
   - Features: warm smile, friendly posture
   - Style: Pixar-style 3D animation

2. **Generate Natural Language Description**: Convert the profile to a paragraph that gets copy-pasted UNCHANGED into every scene prompt.

3. **Per-Scene Starting Frames with Imagen 4**: For each scene/beat:
   - Use Imagen 4 (`imagen-4.0-generate-001`) to generate a starting frame: Cosmo description + scene setting
   - Have Gemini evaluate/pick the best candidate
   - Expand to 16:9 if needed

4. **Veo Animates from Starting Frame**: Pass the Imagen-generated frame as `image` to Veo, then prompt for MOTION ONLY:
   - "The robot picks up the red block, lifts it proudly, camera slowly zooms in"
   - Don't re-describe the character in the motion prompt — the image already has it

5. **Use same seed**: Pass `seed` parameter to Veo for consistency across scenes.

### Cosmo Character Description Template
Create a file `src/characters/cosmo.ts` with:
```typescript
export const COSMO_IDENTITY = {
  profile: {
    bodyShape: 'small, round, compact torso',
    bodyColor: 'bright sky blue metallic',
    head: 'perfectly round, slightly larger than body',
    antenna: 'single glowing warm yellow antenna on top of head, short and stubby',
    eyes: 'two large perfectly round brown eyes, warm and expressive, slight reflective sheen',
    arms: 'two short stubby arms, same blue as body, rounded ends (no fingers)',
    legs: 'two short stubby legs, rounded feet',
    smile: 'small curved warm smile on lower face',
    style: 'Pixar-style 3D children\'s animation character'
  },
  description: `Cosmo, a small cute blue robot with a perfectly round head slightly larger than his compact round body, bright sky-blue metallic surface, two large round warm brown eyes with a reflective sheen, a single short glowing warm-yellow antenna on top of his round head, a small curved friendly smile, two short stubby arms with rounded ends, and two short stubby legs with rounded feet. Pixar-style 3D children's animation character design.`,
  negativePrompt: 'realistic, photorealistic, scary, dark, horror, distorted, morphing, inconsistent, blurry, text overlays, subtitles, watermark'
};
```

## Prompt Engineering Improvements

### Scene Prompt Template
```
[COSMO_DESCRIPTION (unchanged)]. [SETTING]. [ACTION]. [CAMERA]. Audio: [SPECIFIC_AUDIO].
```

### Use Gemini as Expert Prompter
Before each Veo call, have Gemini refine the prompt:
```typescript
const refinedPrompt = await gemini.generateContent({
  model: 'gemini-2.5-flash',
  contents: `Act as an expert prompter for Veo video generation. 
    Given this scene idea: "${sceneIdea}"
    And this character: "${COSMO_DESCRIPTION}"
    Write a detailed, clear Veo prompt. Focus on one single moment. 
    Include camera movement, lighting, and specific audio.
    Use colon format for any dialogue. Add (no subtitles).
    Keep it under 8 seconds of action.`
});
```

## Quality Pipeline

### Add Gemini-as-Evaluator
After generating each clip, score it:
```typescript
// Extract a frame, send to Gemini for evaluation
const evaluation = await gemini.generateContent({
  model: 'gemini-2.5-flash',
  contents: [
    { text: 'Rate this video frame 1-10 on: character consistency with reference, visual quality, animation style. Is the blue robot Cosmo recognizable? Any artifacts?' },
    { inlineData: { mimeType: 'image/jpeg', data: frameBase64 } },
    { inlineData: { mimeType: 'image/png', data: referenceBase64 } },
  ]
});
```
If score < 7, regenerate with enhanced prompt (Recurser pattern).

### Black Frame Detection
Before concat, check each clip for solid-color frames (the blue intro bug):
```typescript
// Use ffmpeg to detect black/solid frames
// ffprobe -f lavfi -i "movie=clip.mp4,blackdetect=d=0.1:pix_th=0.1" -show_entries tags -of json
```

## Replace DALL-E with Imagen 4

### For Thumbnails
```typescript
const response = await client.models.generateImages({
  model: 'imagen-4.0-generate-001',
  prompt: thumbnailPrompt,
  config: { numberOfImages: 4, aspectRatio: '16:9' },
});
// Pick best, then overlay text programmatically with Sharp/Canvas
```

### For Reference Images
Use Imagen 4 instead of DALL-E for Cosmo reference generation.

## Replace OpenAI TTS with Gemini TTS
```typescript
const response = await client.models.generateContent({
  model: 'gemini-2.5-flash-preview-tts',
  contents: [{ parts: [{ text: narrationText }] }],
  config: {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: 'Kore' },  // test different voices
      },
    },
  },
});
```

## Architecture: Provider Abstraction

Create `src/providers/video-provider.ts`:
```typescript
interface VideoProvider {
  generateClip(opts: {
    prompt: string;
    startingFrame?: Buffer;
    durationSec: number;
    aspectRatio: string;
    negativePrompt?: string;
    seed?: number;
  }): Promise<Buffer>;
}

class VeoProvider implements VideoProvider { ... }
// Future: class KlingProvider, class RunwayProvider
```

## File Structure for New Code
```
src/
  characters/
    cosmo.ts          # Cosmo identity profile + description
  providers/
    video-provider.ts # Abstract interface
    veo.ts            # Veo implementation (fixed API calls)
    imagen.ts         # Imagen 4 for images
  pipeline/
    prompt-engineer.ts  # Gemini prompt refinement
    quality-gate.ts     # Gemini evaluation + retry logic
    frame-check.ts      # Black frame detection
  scripts/
    pro-video-v8.ts     # New pipeline using all improvements
```

## Models Available on Our Gemini API Key
- veo-2.0-generate-001 ($0.35/sec)
- veo-3.0-generate-001 ($0.40/sec, native audio on Vertex only)
- veo-3.0-fast-generate-001 ($0.15/sec)
- veo-3.1-generate-preview ($0.40/sec)
- veo-3.1-fast-generate-preview ($0.15/sec)
- imagen-4.0-generate-001
- imagen-4.0-ultra-generate-001
- imagen-4.0-fast-generate-001
- gemini-2.5-flash (for prompt engineering + evaluation)
- gemini-2.5-flash-preview-tts (for narration)
- gemini-2.5-pro (for complex analysis)

## Priority Order
1. Fix the API calls (remove referenceImages/generateAudio)
2. Create Cosmo identity profile + description
3. Implement Imagen 4 starting frames per scene
4. Implement image-to-video with Veo (motion-only prompts)
5. Add Gemini prompt refinement
6. Add quality gate (Gemini evaluation)
7. Add negativePrompt everywhere
8. Replace DALL-E thumbnails with Imagen 4 + programmatic text
9. Test Gemini TTS as replacement for OpenAI TTS
10. Create the provider abstraction layer
