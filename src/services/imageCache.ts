/**
 * Image Cache Service
 *
 * Captures and caches images from the browser when they load successfully.
 * This solves the problem of Facebook CDN images requiring authentication -
 * we capture them client-side when they're displayed in the browser.
 */

import { getScopedItem, setScopedItem, removeScopedItem } from '../lib/scopedStorage';
import { isEmbeddingAvailable, embedMultimodal, cosineSimilarity } from './embeddingService';
import { getEmbedding, setEmbedding, getEmbeddings, computeImageHash } from './embeddingStore';
import type { EmbeddingTaskType } from './embeddingService';
import { fetchImageViaBackend } from './swipeLibraryApi';

const IMAGE_CACHE_KEY = 'conversion_intelligence_image_cache';

export interface CachedImage {
  adId: string;
  base64Data: string;
  mimeType: string;
  capturedAt: number;
  conversionRate?: number; // For sorting by performance
  conversions?: number;    // Absolute conversion count from the ad
  // Quality metadata for filtering out low-res images
  width?: number;
  height?: number;
  fileSize?: number;  // bytes
  qualityScore?: number; // 0-100, calculated from dimensions
  // Text metadata for embedding computation (embeddings stored in IndexedDB, not here)
  headline?: string;      // Ad headline at capture time
  bodyText?: string;      // Ad body snippet (first 200 chars)
}

/**
 * Calculate image quality score based on dimensions
 * Used to filter out low-resolution images from reference set
 */
function calculateQualityScore(width: number, height: number): number {
  const minDimension = Math.min(width, height);
  if (minDimension >= 1080) return 100;  // Excellent (1080p+)
  if (minDimension >= 720) return 80;    // Good (720p)
  if (minDimension >= 480) return 60;    // Acceptable
  if (minDimension >= 320) return 40;    // Poor
  return 20;                              // Very poor (thumbnail)
}

interface ImageCache {
  images: Record<string, CachedImage>;
  lastUpdated: number;
}

/**
 * Get the current image cache from localStorage
 */
function getCache(): ImageCache {
  try {
    const cached = getScopedItem(IMAGE_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Failed to read image cache:', e);
  }
  return { images: {}, lastUpdated: Date.now() };
}

/**
 * Save the image cache to localStorage
 */
function saveCache(cache: ImageCache): void {
  try {
    // Keep cache size manageable - store up to 20 images
    const imageIds = Object.keys(cache.images);
    if (imageIds.length > 20) {
      // Sort by conversion rate and keep top 20
      const sortedImages = imageIds
        .map(id => cache.images[id])
        .sort((a, b) => (b.conversionRate || 0) - (a.conversionRate || 0))
        .slice(0, 20);

      cache.images = {};
      sortedImages.forEach(img => {
        cache.images[img.adId] = img;
      });
    }

    cache.lastUpdated = Date.now();
    setScopedItem(IMAGE_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to save image cache:', e);
  }
}

/**
 * Capture an image element and store its base64 data
 * Call this when an image loads successfully in the browser
 */
export function captureImage(
  imageElement: HTMLImageElement,
  adId: string,
  conversionRate?: number,
  headline?: string,
  bodyText?: string
): CachedImage | null {
  try {
    // Create a canvas to capture the image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.warn('Could not get canvas context');
      return null;
    }

    // Set canvas size to match image
    canvas.width = imageElement.naturalWidth || imageElement.width;
    canvas.height = imageElement.naturalHeight || imageElement.height;

    // Draw the image to canvas
    ctx.drawImage(imageElement, 0, 0);

    // Convert to base64 (use JPEG for smaller size)
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      // CORS error - image is from a different origin without proper headers
      console.log(`⏭️ Cannot capture cross-origin image for ad ${adId} (CORS restriction)`);
      return null;
    }

    // Extract base64 data and mime type
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      console.warn('Failed to parse data URL');
      return null;
    }

    const cachedImage: CachedImage = {
      adId,
      mimeType: matches[1],
      base64Data: matches[2],
      capturedAt: Date.now(),
      conversionRate,
      headline: headline?.slice(0, 200),
      bodyText: bodyText?.slice(0, 200),
    };

    // Store in cache
    const cache = getCache();
    cache.images[adId] = cachedImage;
    saveCache(cache);

    console.log(`✅ Captured image for ad ${adId} (${conversionRate?.toFixed(1)}% conv rate)`);

    return cachedImage;
  } catch (e) {
    console.warn(`Failed to capture image for ad ${adId}:`, e);
    return null;
  }
}

/**
 * Get a cached image by ad ID
 */
export function getCachedImage(adId: string): CachedImage | null {
  const cache = getCache();
  return cache.images[adId] || null;
}

/**
 * Get all cached images, sorted by conversion rate (highest first)
 */
export function getAllCachedImages(): CachedImage[] {
  const cache = getCache();
  return Object.values(cache.images)
    .sort((a, b) => (b.conversionRate || 0) - (a.conversionRate || 0));
}

/**
 * Get top N performing cached images
 */
export function getTopCachedImages(count: number = 3): CachedImage[] {
  return getAllCachedImages().slice(0, count);
}

/**
 * Get top N performing cached images that meet minimum quality threshold
 * This ensures only high-resolution images are used for ad generation
 */
export function getTopHighQualityCachedImages(
  count: number = 3,
  minQuality: number = 60
): CachedImage[] {
  const allImages = getAllCachedImages(); // Already sorted by CVR descending
  const highQualityImages = allImages.filter(img => (img.qualityScore ?? 0) >= minQuality);

  console.log(`🔍 Quality filter: ${highQualityImages.length}/${allImages.length} images meet quality >= ${minQuality}`);

  if (highQualityImages.length < count && allImages.length > highQualityImages.length) {
    const skippedCount = allImages.length - highQualityImages.length;
    console.log(`⚠️ Filtered out ${skippedCount} low-quality images (quality < ${minQuality})`);
  }

  // Ensure the highest-converting image (by absolute count) is always included,
  // even if it doesn't have the highest CVR. This prevents the reference set
  // from missing the ad with the most proven conversions.
  if (highQualityImages.length > 1) {
    let highestConvIdx = 0;
    for (let i = 1; i < highQualityImages.length; i++) {
      if ((highQualityImages[i].conversions ?? 0) > (highQualityImages[highestConvIdx].conversions ?? 0)) {
        highestConvIdx = i;
      }
    }
    // If the highest-converting image isn't already in the top N (by CVR), swap it in
    if (highestConvIdx >= count && (highQualityImages[highestConvIdx].conversions ?? 0) > 0) {
      const result = highQualityImages.slice(0, count);
      // Replace the last slot with the highest-converting image
      result[count - 1] = highQualityImages[highestConvIdx];
      console.log(`📊 Swapped in highest-converting image (${highQualityImages[highestConvIdx].conversions} conversions) to reference set`);
      return result;
    }
  }

  return highQualityImages.slice(0, count);
}

/**
 * Clear the image cache
 */
export function clearImageCache(): void {
  try {
    removeScopedItem(IMAGE_CACHE_KEY);
    console.log('🗑️ Image cache cleared');
  } catch (e) {
    console.warn('Failed to clear image cache:', e);
  }
}

/**
 * Clear old cached images that don't have quality scores
 * This forces re-fetching with proper quality tracking
 */
export function clearLegacyCache(): number {
  try {
    const cache = getCache();
    const imageIds = Object.keys(cache.images);
    let removedCount = 0;

    for (const id of imageIds) {
      const img = cache.images[id];
      // Remove images without quality metadata
      if (img.qualityScore === undefined || img.width === undefined) {
        delete cache.images[id];
        removedCount++;
        console.log(`🗑️ Removed legacy cache entry without quality data: ${id}`);
      }
    }

    if (removedCount > 0) {
      saveCache(cache);
      console.log(`🗑️ Cleared ${removedCount} legacy cache entries`);
    }

    return removedCount;
  } catch (e) {
    console.warn('Failed to clear legacy cache:', e);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { count: number; topConversionRate: number } {
  const images = getAllCachedImages();
  return {
    count: images.length,
    topConversionRate: images[0]?.conversionRate || 0,
  };
}

/**
 * CORS proxy URLs to try for fetching Facebook CDN images
 */
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

/**
 * Helper to get image dimensions from a blob
 * Returns null if dimensions can't be determined or image is too small
 */
async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

/**
 * Helper to build a CachedImage from base64 data, checking quality
 */
async function buildCachedImage(
  base64Data: string,
  mimeType: string,
  adId: string,
  conversionRate: number,
  minQualityScore: number,
  headline?: string,
  bodyText?: string,
  conversions?: number
): Promise<CachedImage | null> {
  // Decode base64 to blob for dimension checking
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });

  const dimensions = await getImageDimensions(blob);
  if (!dimensions) {
    console.log(`⚠️ Could not determine image dimensions for ${adId}`);
    return null;
  }

  const { width, height } = dimensions;
  const qualityScore = calculateQualityScore(width, height);
  const fileSize = blob.size;

  if (qualityScore < minQualityScore) {
    console.log(`⚠️ Image quality too low (${qualityScore} < ${minQualityScore}), skipping ${adId}`);
    return null;
  }

  const cachedImage: CachedImage = {
    adId,
    mimeType,
    base64Data,
    capturedAt: Date.now(),
    conversionRate,
    conversions,
    width,
    height,
    fileSize,
    qualityScore,
    headline: headline?.slice(0, 200),
    bodyText: bodyText?.slice(0, 200),
  };

  const cache = getCache();
  cache.images[adId] = cachedImage;
  saveCache(cache);

  console.log(`✅ Cached image for ad ${adId}: ${width}x${height}, quality ${qualityScore}`);
  return cachedImage;
}

/**
 * Fetch an image and store it in the cache.
 * Primary: uses backend /api/meta/image-fetch (server-side, no CORS issues).
 * Fallback: tries third-party CORS proxies (unreliable, may be down).
 */
export async function storeImageFromUrl(
  imageUrl: string,
  adId: string,
  conversionRate: number = 5,
  minQualityScore: number = 40, // Reject thumbnails by default
  headline?: string,
  bodyText?: string,
  conversions?: number
): Promise<CachedImage | null> {
  // Check if already cached
  const existing = getCachedImage(adId);
  if (existing) {
    console.log(`✅ Image already cached for ad ${adId} (quality: ${existing.qualityScore ?? 'unknown'})`);
    return existing;
  }

  // Primary: fetch via backend proxy (server-side, no CORS issues, handles auth)
  try {
    console.log(`📥 Fetching image via backend proxy for ad ${adId}...`);
    const result = await fetchImageViaBackend(imageUrl);
    if (result?.base64Data && result?.mimeType) {
      const cached = await buildCachedImage(
        result.base64Data, result.mimeType, adId, conversionRate, minQualityScore,
        headline, bodyText, conversions
      );
      if (cached) return cached;
      // If buildCachedImage returned null, quality was too low — don't retry via proxies
      return null;
    }
    console.log(`⚠️ Backend proxy returned no data, trying CORS proxies...`);
  } catch (error) {
    console.log(`⚠️ Backend proxy failed, trying CORS proxies:`, error);
  }

  // Fallback: try third-party CORS proxies
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy + encodeURIComponent(imageUrl);
      console.log(`📥 Trying CORS proxy: ${proxy.substring(0, 30)}...`);

      const response = await fetch(proxyUrl, {
        headers: { 'Accept': 'image/*' },
      });

      if (!response.ok) {
        console.log(`⚠️ Proxy returned ${response.status}, trying next...`);
        continue;
      }

      const blob = await response.blob();

      if (!blob.type.startsWith('image/')) {
        console.log(`⚠️ Response is not an image (${blob.type}), trying next...`);
        continue;
      }

      const dimensions = await getImageDimensions(blob);
      if (!dimensions) {
        console.log(`⚠️ Could not determine image dimensions, trying next...`);
        continue;
      }

      const { width, height } = dimensions;
      const qualityScore = calculateQualityScore(width, height);
      const fileSize = blob.size;

      if (qualityScore < minQualityScore) {
        console.log(`⚠️ Image quality too low (${qualityScore} < ${minQualityScore}), skipping`);
        return null;
      }

      const arrayBuffer = await blob.arrayBuffer();
      const base64Data = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const cachedImage: CachedImage = {
        adId,
        mimeType: blob.type || 'image/jpeg',
        base64Data,
        capturedAt: Date.now(),
        conversionRate,
        conversions,
        width,
        height,
        fileSize,
        qualityScore,
        headline: headline?.slice(0, 200),
        bodyText: bodyText?.slice(0, 200),
      };

      const cache = getCache();
      cache.images[adId] = cachedImage;
      saveCache(cache);

      console.log(`✅ Cached image for ad ${adId}: ${width}x${height}, quality ${qualityScore}`);
      return cachedImage;
    } catch (error) {
      console.log(`⚠️ CORS proxy failed:`, error);
      continue;
    }
  }

  console.log(`❌ All fetch methods failed for ad ${adId}`);
  return null;
}

/**
 * Batch fetch multiple images via CORS proxy
 */
export async function storeImagesFromUrls(
  images: Array<{ url: string; adId: string; conversionRate: number }>
): Promise<CachedImage[]> {
  const results: CachedImage[] = [];

  for (const img of images) {
    const cached = await storeImageFromUrl(img.url, img.adId, img.conversionRate);
    if (cached) {
      results.push(cached);
    }
  }

  console.log(`📸 Fetched ${results.length}/${images.length} images via CORS proxy`);
  return results;
}

/**
 * Upload a brand image from a File object
 * This is the workaround for CORS restrictions on Facebook CDN images
 */
export function uploadBrandImage(
  file: File,
  conversionRate: number = 10 // Default high rate for uploaded brand images
): Promise<CachedImage | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) {
          console.warn('Failed to read file');
          resolve(null);
          return;
        }

        // Extract base64 data and mime type
        const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          console.warn('Failed to parse data URL from uploaded file');
          resolve(null);
          return;
        }

        // Generate a unique ID for uploaded images
        const adId = `uploaded_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        const cachedImage: CachedImage = {
          adId,
          mimeType: matches[1],
          base64Data: matches[2],
          capturedAt: Date.now(),
          conversionRate,
        };

        // Store in cache
        const cache = getCache();
        cache.images[adId] = cachedImage;
        saveCache(cache);

        console.log(`✅ Uploaded brand image: ${file.name} (assigned ${conversionRate}% conv rate)`);
        resolve(cachedImage);
      } catch (e) {
        console.warn('Failed to process uploaded image:', e);
        resolve(null);
      }
    };

    reader.onerror = () => {
      console.warn('Failed to read uploaded file');
      resolve(null);
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Upload multiple brand images
 */
export async function uploadBrandImages(
  files: FileList,
  conversionRates?: number[]
): Promise<CachedImage[]> {
  const results: CachedImage[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rate = conversionRates?.[i] ?? 10 - i; // Default: descending rates
    const result = await uploadBrandImage(file, rate);
    if (result) {
      results.push(result);
    }
  }

  console.log(`📸 Uploaded ${results.length} brand images total`);
  return results;
}

/**
 * Get detailed cache statistics including conversion data
 */
export function getDetailedCacheStats(): {
  count: number;
  topConversions: number;
  topConversionRate: number;
  highestConvertingAdId: string | null;
  highestCVRAdId: string | null;
} {
  const images = getAllCachedImages();
  if (images.length === 0) {
    return { count: 0, topConversions: 0, topConversionRate: 0, highestConvertingAdId: null, highestCVRAdId: null };
  }

  let topConversions = 0;
  let topConversionRate = 0;
  let highestConvertingAdId: string | null = null;
  let highestCVRAdId: string | null = null;

  for (const img of images) {
    if ((img.conversions ?? 0) > topConversions) {
      topConversions = img.conversions ?? 0;
      highestConvertingAdId = img.adId;
    }
    if ((img.conversionRate ?? 0) > topConversionRate) {
      topConversionRate = img.conversionRate ?? 0;
      highestCVRAdId = img.adId;
    }
  }

  return { count: images.length, topConversions, topConversionRate, highestConvertingAdId, highestCVRAdId };
}

/**
 * Auto-fetch images from converting ads into the cache.
 * Called by both MetaAds (after sync) and AdGenerator (on mount).
 * Prioritizes ads with most conversions, then highest CVR.
 */
export async function autoFetchConvertingAdImages(
  creatives: Array<{
    id: string;
    imageUrl?: string;
    conversionRate: number;
    conversions: number;
    headline?: string;
    bodySnippet?: string;
  }>,
  options?: {
    maxImages?: number;
    minQuality?: number;
    onProgress?: (loaded: number, total: number) => void;
  }
): Promise<{ loaded: number; alreadyCached: number; failed: number }> {
  const maxImages = options?.maxImages ?? 20;
  const minQuality = options?.minQuality ?? 60;

  // Filter to ads with conversions and images, sort by conversions (then CVR)
  const candidates = creatives
    .filter(c => c.imageUrl && c.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions || b.conversionRate - a.conversionRate);

  if (candidates.length === 0) {
    return { loaded: 0, alreadyCached: 0, failed: 0 };
  }

  console.log(`🔄 Auto-fetching up to ${maxImages} converting ad images (${candidates.length} candidates)`);

  let loaded = 0;
  let alreadyCached = 0;
  let failed = 0;

  for (const creative of candidates) {
    if (loaded + alreadyCached >= maxImages) break;

    // Check if already cached with sufficient quality
    const existing = getCachedImage(creative.id);
    if (existing && (existing.qualityScore ?? 0) >= minQuality) {
      // Update conversions data if missing on existing cache entry
      if (existing.conversions === undefined && creative.conversions > 0) {
        const cache = getCache();
        cache.images[creative.id] = { ...existing, conversions: creative.conversions, conversionRate: creative.conversionRate };
        saveCache(cache);
      }
      alreadyCached++;
      continue;
    }

    const cached = await storeImageFromUrl(
      creative.imageUrl!,
      creative.id,
      creative.conversionRate,
      minQuality,
      creative.headline,
      creative.bodySnippet,
      creative.conversions
    );

    if (cached && (cached.qualityScore ?? 0) >= minQuality) {
      loaded++;
      console.log(`✅ Cached reference #${loaded}: ${creative.id} (${creative.conversions} conv, ${creative.conversionRate.toFixed(1)}% CVR)`);
    } else {
      failed++;
    }

    options?.onProgress?.(loaded + alreadyCached, Math.min(candidates.length, maxImages));
  }

  console.log(`📸 Auto-fetch complete: ${loaded} loaded, ${alreadyCached} already cached, ${failed} failed`);
  return { loaded, alreadyCached, failed };
}

// ─── Semantic Image Selection (Embedding-Based) ─────────────────────────────────

/**
 * Get cached images ranked by semantic similarity to a query embedding.
 * Falls back to top-CVR images when embeddings are unavailable.
 *
 * @param queryEmbedding - The embedding vector to match against
 * @param count - Number of images to return
 * @param minQuality - Minimum quality score threshold
 * @param minCVR - Minimum conversion rate threshold (use average CVR of all cached images)
 */
export async function getSemanticallySimilarImages(
  queryEmbedding: number[],
  count: number = 3,
  minQuality: number = 60,
  minCVR: number = 0
): Promise<CachedImage[]> {
  const allImages = getAllCachedImages();
  const qualifiedImages = allImages.filter(
    img => (img.qualityScore ?? 0) >= minQuality && (img.conversionRate ?? 0) >= minCVR
  );

  if (qualifiedImages.length === 0) {
    return getTopHighQualityCachedImages(count, minQuality);
  }

  // Look up embeddings from IndexedDB
  const adIds = qualifiedImages.map(img => img.adId);
  const embeddingMap = await getEmbeddings(adIds);

  // Score images by semantic similarity
  const scored: Array<{ image: CachedImage; similarity: number }> = [];
  const unscored: CachedImage[] = [];

  for (const img of qualifiedImages) {
    const stored = embeddingMap.get(img.adId);
    if (stored?.vector) {
      scored.push({
        image: img,
        similarity: cosineSimilarity(queryEmbedding, stored.vector),
      });
    } else {
      unscored.push(img);
    }
  }

  // Sort by similarity (highest first)
  scored.sort((a, b) => b.similarity - a.similarity);

  // Build result: semantic matches first, then fill with top-CVR fallbacks
  const result: CachedImage[] = scored.slice(0, count).map(s => s.image);

  if (result.length < count) {
    // Fill remaining slots with highest-CVR images that aren't already selected
    const selectedIds = new Set(result.map(img => img.adId));
    const fallbacks = unscored
      .filter(img => !selectedIds.has(img.adId))
      .slice(0, count - result.length);
    result.push(...fallbacks);
  }

  console.log(`🔍 Semantic selection: ${scored.length} scored, ${unscored.length} unscored, returning ${result.length}`);
  return result;
}

/**
 * Compute embeddings for cached images that don't have them yet.
 * Stores embeddings in IndexedDB (not localStorage).
 * Returns the count of newly computed embeddings.
 */
export async function computeMissingEmbeddings(
  onProgress?: (completed: number, total: number) => void
): Promise<number> {
  if (!isEmbeddingAvailable()) return 0;

  const allImages = getAllCachedImages();
  const needsEmbedding: CachedImage[] = [];

  // Check which images need embeddings
  for (const img of allImages) {
    const existing = await getEmbedding(img.adId);
    if (!existing) {
      needsEmbedding.push(img);
    } else if (img.base64Data) {
      // Check if image has changed (cache invalidation)
      const currentHash = computeImageHash(img.base64Data);
      if (existing.imageHash && existing.imageHash !== currentHash) {
        needsEmbedding.push(img);
      }
    }
  }

  if (needsEmbedding.length === 0) return 0;

  console.log(`Computing embeddings for ${needsEmbedding.length} cached images...`);
  let computed = 0;

  for (let i = 0; i < needsEmbedding.length; i++) {
    const img = needsEmbedding[i];
    const textContent = [img.headline, img.bodyText].filter(Boolean).join('. ');

    try {
      const vector = await embedMultimodal(
        textContent || `Ad creative ${img.adId}`,
        img.base64Data,
        img.mimeType,
        'SEMANTIC_SIMILARITY' as EmbeddingTaskType
      );

      if (vector) {
        const imgHash = computeImageHash(img.base64Data);
        await setEmbedding(img.adId, vector, textContent, imgHash);
        computed++;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Failed to compute embedding for ad ${img.adId}:`, msg);
    }

    onProgress?.(i + 1, needsEmbedding.length);
  }

  console.log(`Computed ${computed}/${needsEmbedding.length} embeddings`);
  return computed;
}

/**
 * Get average conversion rate across all cached images.
 * Used as the minimum threshold for semantic selection.
 */
export function getAverageCVR(): number {
  const images = getAllCachedImages();
  if (images.length === 0) return 0;
  const total = images.reduce((sum, img) => sum + (img.conversionRate ?? 0), 0);
  return total / images.length;
}
