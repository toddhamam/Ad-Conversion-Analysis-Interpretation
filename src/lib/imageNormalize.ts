// One normalization path for every image that enters the app.
//
// Extracted from the inline canvas work in MetaAds.tsx so the four Inspiration Library ingest
// lanes and the swipe-library save flow can't drift on resolution, quality or scoring. Quality
// is scored from the NATURAL dimensions, not the resized ones, using the single ladder in
// imageCache.ts — scoring the downscale would mark every image as low quality.

import { calculateQualityScore } from '../services/imageCache';

/**
 * How hard to compress, chosen by what the image is FOR.
 *
 * `reference` is the original and remains the default, so every existing call site is
 * untouched: a style reference only has to convey palette, composition and mood to a vision
 * model, and 800px was chosen against Vercel's ~4.5MB request body limit — full-res ad
 * creatives (1080p+) as base64 routinely exceed it and fail the save outright.
 *
 * `showcase` exists because that trade-off inverts when the image IS the proof. A website
 * screenshot at 800px/q0.82 comes back with mushy UI text, and the whole point of showing a
 * client's build is that the build looks good. The numbers follow `imageResize.ts`, which
 * already solved this for product mockups — its header records that "0.8 left compression
 * artifacts on cover text that image models then 'read' and reproduced as altered typography".
 * `smoothing` turns on the high-quality downscale filter, which that module is otherwise the
 * only place in the repo to use.
 *
 * `preferPng` exists because a website screenshot is JPEG's pathological case: flat colour
 * fields with crisp glyphs produce ringing around every letter, and here a *human* judges the
 * result — it is the proof, not a hint to a vision model. Rather than pick a codec blind, the
 * showcase profile encodes both and keeps whichever is smaller. A text-heavy page usually wins
 * on PNG (smaller AND lossless); a photo-heavy page wins on JPEG by a wide margin. The rule
 * adapts per image and can never do worse than JPEG alone.
 *
 * Raising `maxDimension` spends the request-body budget, so showcase saves send fewer items
 * per request rather than more — and count IMAGES, not rows, because one showcase row can
 * carry both a before and an after.
 */
export type NormalizeProfile = 'reference' | 'showcase';

const PROFILES: Record<NormalizeProfile, {
  maxDimension: number;
  quality: number;
  smoothing: boolean;
  preferPng: boolean;
}> = {
  reference: { maxDimension: 800, quality: 0.82, smoothing: false, preferPng: false },
  showcase: { maxDimension: 1600, quality: 0.92, smoothing: true, preferPng: true },
};

/** Grid preview. Small enough that a 50-item list stays responsive with thumbnails inline. */
const THUMBNAIL_WIDTH = 200;
const THUMBNAIL_QUALITY = 0.6;

/** Rejected before any canvas work — a 15MB screenshot is a mistake, not an input. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** What a normalized payload may be encoded as. See `preferPng` on the profile table. */
export type ImageMimeType = 'image/jpeg' | 'image/png';

export interface NormalizedImage {
  /** Base64 with no `data:` prefix. JPEG, or PNG when the profile chose it — see `mimeType`. */
  base64: string;
  /** Base64 thumbnail with no `data:` prefix. Always JPEG: nobody reads text in a 200px thumb. */
  thumbnail: string;
  mimeType: ImageMimeType;
  /** NATURAL dimensions of the source, not the resized output. */
  width: number;
  height: number;
  qualityScore: number;
}

export function isAcceptedImageType(type: string): boolean {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(type);
}

/** Load a blob or data URL into an HTMLImageElement, resolving null instead of throwing. */
function loadImage(src: Blob | string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const isBlob = typeof src !== 'string';
    const url = isBlob ? URL.createObjectURL(src) : src;
    const img = new Image();

    img.onload = () => {
      if (isBlob) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (isBlob) URL.revokeObjectURL(url);
      resolve(null);
    };

    // Data URLs are same-origin; remote URLs would need CORS, and every lane here passes
    // either a Blob or a data URL by the time it reaches this function.
    img.src = url;
  });
}

function drawToBase64(
  img: HTMLImageElement,
  width: number,
  height: number,
  quality: number,
  smoothing = false,
  format: ImageMimeType = 'image/jpeg'
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (smoothing) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // The quality argument is ignored by toDataURL for PNG, which is lossless.
  const dataUrl = canvas.toDataURL(format, quality);
  return dataUrl.split(',')[1] || null;
}

/**
 * Encode once as JPEG, and — when the profile asks — again as PNG, keeping whichever is
 * smaller. Base64 length is a faithful proxy for byte size here: both strings encode the same
 * canvas through the same 4/3 expansion.
 */
function encodeBest(
  img: HTMLImageElement,
  width: number,
  height: number,
  profile: (typeof PROFILES)[NormalizeProfile]
): { base64: string; mimeType: ImageMimeType } | null {
  const jpeg = drawToBase64(img, width, height, profile.quality, profile.smoothing, 'image/jpeg');
  if (!profile.preferPng) return jpeg ? { base64: jpeg, mimeType: 'image/jpeg' } : null;

  const png = drawToBase64(img, width, height, profile.quality, profile.smoothing, 'image/png');
  if (!jpeg) return png ? { base64: png, mimeType: 'image/png' } : null;
  if (!png || png.length >= jpeg.length) return { base64: jpeg, mimeType: 'image/jpeg' };
  return { base64: png, mimeType: 'image/png' };
}

/**
 * Resize, thumbnail and score an image for storage.
 *
 * Returns null rather than throwing for every failure mode (unreadable file, no canvas
 * context, zero-dimension image). Callers ingest in batches, and one bad file must not fail
 * the batch.
 */
export async function normalizeForUpload(
  src: Blob | string,
  profile: NormalizeProfile = 'reference'
): Promise<NormalizedImage | null> {
  if (typeof src !== 'string' && src.size > MAX_SOURCE_BYTES) {
    console.warn(`Image rejected: ${Math.round(src.size / 1024 / 1024)}MB exceeds the ${MAX_SOURCE_BYTES / 1024 / 1024}MB limit`);
    return null;
  }

  const img = await loadImage(src);
  if (!img) return null;

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (width === 0 || height === 0) return null;

  const settings = PROFILES[profile];
  const scale = Math.min(1, settings.maxDimension / Math.max(width, height));
  const encoded = encodeBest(img, width * scale, height * scale, settings);
  if (!encoded) return null;

  const thumbScale = Math.min(1, THUMBNAIL_WIDTH / width);
  const thumbnail = drawToBase64(img, width * thumbScale, height * thumbScale, THUMBNAIL_QUALITY);

  return {
    base64: encoded.base64,
    thumbnail: thumbnail || encoded.base64,
    mimeType: encoded.mimeType,
    width,
    height,
    qualityScore: calculateQualityScore(width, height),
  };
}

/** Convenience wrapper for a raw base64 payload (the Ad Library capture lane). */
export async function normalizeBase64(
  base64Data: string,
  mimeType: string,
  profile: NormalizeProfile = 'reference'
): Promise<NormalizedImage | null> {
  return normalizeForUpload(`data:${mimeType};base64,${base64Data}`, profile);
}
