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

/**
 * Multi-angle reference image prompts for Imagen 4.
 * Generate each angle, then pass up to 3 as referenceImages to Veo 3.1.
 */
export const COSMO_REFERENCE_ANGLES = {
  front: `Full body front view of ${COSMO_IDENTITY.description}, standing in a T-pose with arms outstretched, simple white background, character design reference sheet, centered composition, studio lighting.`,
  threeQuarter: `Three-quarter view of ${COSMO_IDENTITY.description}, standing naturally with a slight turn to the right, simple white background, character design reference sheet, centered composition, studio lighting.`,
  side: `Full body side profile view (left side facing camera) of ${COSMO_IDENTITY.description}, standing upright, simple white background, character design reference sheet, centered composition, studio lighting.`,
  back: `Full body rear view of ${COSMO_IDENTITY.description}, facing away from camera, simple white background, character design reference sheet, centered composition, studio lighting.`,
  faceCloseup: `Close-up face portrait of ${COSMO_IDENTITY.description}, front-facing, warm expression, simple white background, studio lighting, detailed.`,
} as const;
