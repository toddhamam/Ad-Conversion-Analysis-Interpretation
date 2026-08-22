// One normalization path for every image that enters the app.
//
// Extracted from the inline canvas work in MetaAds.tsx so the four Inspiration Library ingest
// lanes and the swipe-library save flow can't drift on resolution, quality or scoring. Quality
// is scored from the NATURAL dimensions, not the resized ones, using the single ladder in
// imageCache.ts — scoring the downscale would mark every image as low quality.

import { calculateQualityScore } from '../services/imageCache';

/**
 * Longest edge of the stored image. Chosen against Vercel's ~4.5MB request body limit:
 * full-res ad creatives (1080p+) as base64 routinely exceed it and fail the save outright.
 */
const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.82;

/** Grid preview. Small enough that a 50-item list stays responsive with thumbnails inline. */
const THUMBNAIL_WIDTH = 200;
const THUMBNAIL_QUALITY = 0.6;

/** Rejected before any canvas work — a 15MB screenshot is a mistake, not an input. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export interface NormalizedImage {
  /** Base64 with no `data:` prefix, always JPEG. */
  base64: string;
  /** Base64 thumbnail with no `data:` prefix. */
  thumbnail: string;
  mimeType: 'image/jpeg';
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
  quality: number
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.split(',')[1] || null;
}

/**
 * Resize, thumbnail and score an image for storage.
 *
 * Returns null rather than throwing for every failure mode (unreadable file, no canvas
 * context, zero-dimension image). Callers ingest in batches, and one bad file must not fail
 * the batch.
 */
export async function normalizeForUpload(src: Blob | string): Promise<NormalizedImage | null> {
  if (typeof src !== 'string' && src.size > MAX_SOURCE_BYTES) {
    console.warn(`Image rejected: ${Math.round(src.size / 1024 / 1024)}MB exceeds the ${MAX_SOURCE_BYTES / 1024 / 1024}MB limit`);
    return null;
  }

  const img = await loadImage(src);
  if (!img) return null;

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (width === 0 || height === 0) return null;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const base64 = drawToBase64(img, width * scale, height * scale, JPEG_QUALITY);
  if (!base64) return null;

  const thumbScale = Math.min(1, THUMBNAIL_WIDTH / width);
  const thumbnail = drawToBase64(img, width * thumbScale, height * thumbScale, THUMBNAIL_QUALITY);

  return {
    base64,
    thumbnail: thumbnail || base64,
    mimeType: 'image/jpeg',
    width,
    height,
    qualityScore: calculateQualityScore(width, height),
  };
}

/** Convenience wrapper for a raw base64 payload (the Ad Library capture lane). */
export async function normalizeBase64(
  base64Data: string,
  mimeType: string
): Promise<NormalizedImage | null> {
  return normalizeForUpload(`data:${mimeType};base64,${base64Data}`);
}
