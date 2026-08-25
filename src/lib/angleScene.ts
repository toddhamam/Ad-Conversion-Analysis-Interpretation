// What each creative ANGLE looks like as a photograph — the single definition of the angle's
// visual meaning, shared by both image engines and the video prompt.
//
// WHY THIS EXISTS. A Blitz grid's angle axis reached copy generation and the Veo video prompt but
// never reached image generation: `regenerateAllImages` took one config for the whole pool, so
// every slot got a byte-identical prompt whose only per-image difference was the sentence "This is
// variation 2 of 4 — create a unique variation while maintaining brand consistency". That is a
// cosmetic diversity instruction, not a semantic one, so a four-angle grid came back as four
// re-lightings of the same scene and the "Pain Point" / "Transformation Promise" captions in the
// review step were labels applied to images that knew nothing about them.
//
// The angle strings that did exist (`visualDirection`, e.g. "Bold statement-driven visuals,
// myth-vs-reality contrasts") were messaging abstractions. An image model cannot place a
// "myth-vs-reality contrast" in a frame; handed one, it falls back on the reference images — which
// are identical across slots, which is exactly the convergence being fixed. So a scene grammar
// replaces the one-liner: SUBJECT, MOMENT, COMPOSITION, LIGHT and — the field that does most of the
// work — AVOID, the explicit anti-pattern that stops every angle drifting back to the same tidy
// hero shot.
//
// WHERE IT SITS IN THE PROMPT. The angle directive is DERIVED DIRECTION in ADR #23's sense: it is
// ConversionIQ™'s prescription for the scene, so an operator brief outranks it. It is emitted
// BEFORE the seam — a `blend` brief wins where the two disagree, and an `override` brief replaces
// it entirely (`generateAdImage` empties `angle` alongside `analysisData`, the same way it empties
// every other derived input). It never touches the contract: the product identity lock, in-image
// text rules, format directive and safety directive all follow it.
//
// The block text lives here and ONLY here. Both engine prompt builders import it, because
// `generateAdImage` fails over between Gemini and gpt-image per image — a directive present on one
// builder is silently dropped for whichever cells the other engine answered, which for an axis
// UNDER TEST means losing the variable being measured.
//
// Pure module — no React, no storage, no network. Unit-tested in angleScene.test.ts.

import type { GridAngle } from './axisTags';

/**
 * One angle rendered as directable photography.
 *
 * Every field is a constraint on the picture, not on the message. `avoid` is not decoration: each
 * angle has a specific failure mode it collapses into when under-specified (pain becomes a calm
 * product shot, urgency becomes a countdown graphic, authority becomes a lab coat holding a
 * certificate), and naming that failure mode is what keeps the slots apart.
 */
export interface AngleScene {
  /**
   * The angle's display name. It lives HERE rather than on `CONCEPT_ANGLES` because this is the
   * pure module both the prompt builders and that table can reach — `angleScene` cannot import
   * from `openaiApi` at runtime without a cycle, so the name has to flow lib → services.
   * `CONCEPT_ANGLES` derives its `name` from this; do not restate it there.
   */
  name: string;
  /** Who or what is in frame. */
  subject: string;
  /** The instant the shutter fired. The field that makes two angles different photographs. */
  moment: string;
  /** Framing, crop and arrangement. */
  composition: string;
  /** Lighting and palette. */
  light: string;
  /** The angle's specific collapse mode, stated so the model can steer off it. */
  avoid: string;
}

export const ANGLE_SCENES: Record<GridAngle, AngleScene> = {
  pain: {
    name: 'Pain Point',
    subject: 'one person alone in the middle of the frustration — or, with nobody in frame, the physical aftermath of the problem',
    moment: 'the instant the problem bites again: the failed attempt, the stalled progress, the same dead end. Nothing is resolving in this frame',
    composition: 'tight crop on the face, the hands, or the thing that is failing. Little breathing room — the frame should feel as constrained as the situation',
    light: 'cool, flat or harshly overhead. Drained rather than flattering',
    avoid: 'Do NOT show relief, a solution, a smile, or the product working. No aspirational styling and no calm, tidy hero shot. The problem is still unsolved at the moment this photograph was taken',
  },
  transformation: {
    name: 'Transformation Promise',
    subject: 'one person visibly living the outcome, at ease in it rather than reaching for it',
    moment: 'after the change, not during it — the first ordinary morning of the new normal, when the difficulty has already stopped being a factor',
    composition: 'wider frame with air and depth. The subject moves through or occupies open space with room around them',
    light: 'warm directional daylight, generous and high in dynamic range',
    avoid: 'Do NOT show the struggle, the before state, visible effort, or a split before/after panel. This is the after only. Do NOT reduce it to a product hero shot',
  },
  social_proof: {
    name: 'Social Proof',
    subject: 'many distinct real people — a group, a crowd, a row of different faces — or the visible residue of many people, such as a wall of handwritten notes or the product in dozens of different hands',
    moment: 'many people doing the same thing at the same time, so the scale reads instantly',
    composition: 'repetition and multiplicity — a grid, a row, a crowd. No single hero subject dominating the frame',
    light: 'bright, even and sociable. Candid documentary feel rather than studio',
    avoid: 'Do NOT render review stars, ratings, testimonial text, logos or any numeric claim as a graphic — proof must read as human scale and presence, never as a graphic asserting a statistic. Do NOT show a single isolated person',
  },
  contrarian_pov: {
    name: 'Contrarian POV',
    subject: 'two opposed things in one frame — what everyone does, set against what actually works',
    moment: 'the pivot: one element deliberately breaking the pattern the rest of the frame has established',
    composition: 'explicit visual opposition — a split frame, a hard diagonal, one odd element out of an otherwise uniform arrangement, or a subject facing against the direction everyone else faces',
    light: 'high contrast and hard-edged, with two distinct lighting zones where the frame is split. Decisive, never soft',
    avoid: 'Do NOT render myth-versus-reality labels, arrows, ticks, crosses or any explanatory graphic — the contradiction must be carried by the picture alone. Do NOT produce a neutral, balanced, agreeable composition',
  },
  cognitive_dissonance: {
    name: 'Cognitive Dissonance',
    subject: 'one person caught between two incompatible states — what they know and what they are actually doing',
    moment: 'hesitation. Mid-decision, hand hovering, caught looking at the thing they have been avoiding',
    composition: 'the subject and the contradicting element both in frame but separated — by distance, a doorway, a screen, or a reflection. Mirrors and reflections work well',
    light: 'mixed colour temperature, two sources that do not agree — one warm, one cool',
    avoid: 'Do NOT resolve the tension inside the frame. No decision reached, no relief, no clean before/after pairing',
  },
  fear_elimination: {
    name: 'Fear Elimination',
    subject: 'the risk visibly neutralised — someone supported, covered, caught, or stepping forward with the hazard already handled',
    moment: 'the moment safety is confirmed: the leap that lands, the cover that holds, the hand that catches',
    composition: 'the subject enclosed or supported by something solid, with a clear boundary between them and what was threatening',
    light: 'soft, warm and enveloping. Shadow present in the frame but never falling on the subject',
    avoid: 'Do NOT render shields, locks, padlocks, badges, guarantee seals or checkmarks — safety must be shown physically, not as an icon. Do NOT depict the threat itself as graphic peril',
  },
  product_benefits: {
    name: 'Product Benefits',
    subject: 'the product in genuine use, with the specific outcome it produces visible in the same frame',
    moment: 'mid-use — the product doing its actual job, the result already appearing',
    composition: 'close, detailed and tactile. Hands engaged with the product, shallow depth of field on the part that matters',
    light: 'clean, crisp, high-fidelity product lighting that reveals material and texture',
    avoid: 'Do NOT render feature callouts, spec labels, annotation lines or badges. Do NOT float the product on an empty backdrop with nobody using it',
  },
  urgency_scarcity: {
    name: 'Urgency & Scarcity',
    subject: 'something visibly running out — the last one, the closing window, the nearly empty shelf',
    moment: 'the tail end: almost gone, nearly closed, one remaining',
    composition: 'visible depletion — empty space where things used to be, a queue, a narrowing gap. Asymmetric and slightly unstable framing',
    light: 'late low-angle light with long shadows; the end of the day',
    avoid: 'Do NOT render countdown timers, clocks, "only X left" badges, percentages or any text or number as a graphic. Scarcity must be depicted physically. Do NOT create a calm, abundant, well-stocked scene',
  },
  authority: {
    name: 'Authority & Expertise',
    subject: 'a credible practitioner in their real working environment, using the actual tools of their trade',
    moment: 'at work, mid-explanation or mid-procedure — competence in progress rather than posed',
    composition: 'environmental portrait: the subject occupying a space that is itself the evidence of their expertise. Steady level camera, direct eye line',
    light: 'controlled, professional and directional — deliberate rather than casual',
    avoid: 'Do NOT render diplomas, certificates, award badges, seals or institutional logos, and do NOT fall back on a lab-coat cliché. Authority comes from the environment and the person\'s bearing',
  },
};

/**
 * The one-line summary of an angle's look, derived from the scene rather than stored beside it.
 *
 * `CONCEPT_ANGLES` used to carry its own `visualDirection` string. Deriving it here keeps a single
 * source of truth for what an angle looks like, so the video prompt and the image prompt can never
 * drift into describing the same angle differently.
 */
export function visualDirectionFor(angle: GridAngle): string {
  const scene = ANGLE_SCENES[angle];
  return `${scene.subject}; ${scene.moment}`;
}

/** Prompt header for the angle block — exported so tests can anchor on it by position. */
export const ANGLE_DIRECTIVE_HEADER = 'ANGLE — WHAT THIS IMAGE MUST DEPICT';

/**
 * The angle block, emitted by both engine builders immediately BEFORE the operator-brief seam.
 *
 * Returns [] for an absent angle so the whole feature is inert for any call that has no angle to
 * assert — the single-ad flow on 'auto', and any Blitz image shared by cells that disagree about
 * their angle (see `resolveSlotAngles`).
 */
export function buildAngleDirectiveBlock(angle?: GridAngle | null): string[] {
  if (!angle || !ANGLE_SCENES[angle]) return [];
  const scene = ANGLE_SCENES[angle];

  return [
    '',
    `${ANGLE_DIRECTIVE_HEADER}: ${scene.name.toUpperCase()}`,
    `This creative carries the "${scene.name}" angle, and the SCENE ITSELF has to express it. An image that would serve any other angle equally well has failed — the angle is the variable under test, so it must be visible in the photograph, not merely in the copy that will sit beside it.`,
    `- SUBJECT: ${scene.subject}`,
    `- MOMENT: ${scene.moment}`,
    `- COMPOSITION: ${scene.composition}`,
    `- LIGHT & PALETTE: ${scene.light}`,
    `- AVOID: ${scene.avoid}`,
    'Where this angle direction and the reference-derived style pull apart, favour the angle for SUBJECT, MOMENT and COMPOSITION, and favour the references for production quality, grade and finish. If a FORMAT directive below calls for a screenshot rather than a photograph, express the angle through what is on the screen instead of through a photographed scene.',
    '',
  ];
}
