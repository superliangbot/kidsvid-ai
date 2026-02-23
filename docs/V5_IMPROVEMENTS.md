# V5 Improvements Roadmap

## Current V5 (pro-video-v5.ts)
- Veo extend chain (1 initial + N extensions)
- DALL-E reference image for character consistency
- OpenAI TTS narration (Nova, 0.9x speed)
- FFmpeg drawtext overlay for block counts
- YouTube upload (private)

## Planned Improvements

### P0 — Critical for Quality
- [ ] **Background music layer** — Gentle children's music bed under narration
- [ ] **Sound effects** — Block stacking sounds, celebration sounds, sparkle SFX
- [ ] **Animated number overlay** — Fade in/out the count number instead of static
- [ ] **Retry logic for extend failures** — If an extension fails/returns black, retry that one step
- [ ] **Resume support** — If pipeline crashes mid-chain, resume from last good clip

### P1 — Polish
- [ ] **Intro/outro cards** — "Super Builders" branded title card + end screen
- [ ] **Thumbnail generation** — DALL-E thumbnail with Cosmo + "Count to 10!" text
- [ ] **Music ducking** — Lower music volume when narration plays
- [ ] **Subtitle track** — Burn in or add SRT for accessibility
- [ ] **Multiple voice options** — Test different TTS voices for kids appeal

### P2 — Scale
- [ ] **Template system** — Parameterize the story (count to 5, count to 20, colors, shapes)
- [ ] **Series generation** — Auto-generate episode variants from templates
- [ ] **A/B thumbnails** — Generate 2-3 thumbnail variants
- [ ] **Performance tracking** — After publish, track views/retention via YouTube API
- [ ] **Cost tracking** — Log API costs per video (Veo, DALL-E, TTS)

### P3 — Quality Assurance
- [ ] **Gemini video QA** — Review final video before upload, score quality
- [ ] **Frame sampling** — Extract frames from extend chain to verify no black screens
- [ ] **Audio level check** — Ensure TTS volume is consistent across segments
