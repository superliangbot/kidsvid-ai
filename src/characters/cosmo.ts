/**
 * Cosmo Character Identity Profile
 *
 * The "forensic" approach to character consistency:
 * 1. Structured profile breaks the character into discrete, describable parts
 * 2. Natural language description is copy-pasted UNCHANGED into every prompt
 * 3. Negative prompt prevents common failure modes
 *
 * IMPORTANT: The `description` string must be identical across all Imagen
 * and Veo calls to maintain consistency. Never modify it per-scene.
 */

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
    style: "Pixar-style 3D children's animation character",
  },

  /** Frozen description paragraph — used verbatim in every scene prompt. */
  description:
    'Cosmo, a small cute blue robot with a perfectly round head slightly larger than his compact round body, bright sky-blue metallic surface, two large round warm brown eyes with a reflective sheen, a single short glowing warm-yellow antenna on top of his round head, a small curved friendly smile, two short stubby arms with rounded ends, and two short stubby legs with rounded feet. Pixar-style 3D children\'s animation character design.',

  /** Standard negative prompt — appended to all Veo and Imagen calls. */
  negativePrompt:
    'realistic, photorealistic, scary, dark, horror, distorted, morphing, inconsistent, blurry, text overlays, subtitles, watermark',
} as const;

export type CosmoIdentity = typeof COSMO_IDENTITY;
