/**
 * Image Cache Service
 *
 * Captures and caches images from the browser when they load successfully.
 * This solves the problem of Facebook CDN images requiring authentication -
 * we capture them client-side when they're displayed in the browser.
 */

const IMAGE_CACHE_KEY = 'conversion_intelligence_image_cache';

export interface CachedImage {
  adId: string;
  base64Data: string;
  mimeType: string;
  capturedAt: number;
  conversionRate?: number; // For sorting by performance
  // Quality metadata for filtering out low-res images
  width?: number;
  height?: number;
  fileSize?: number;  // bytes
  qualityScore?: number; // 0-100, calculated from dimensions
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
    const cached = localStorage.getItem(IMAGE_CACHE_KEY);
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
    localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(cache));
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
  conversionRate?: number
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
  const allImages = getAllCachedImages();
  const highQualityImages = allImages.filter(img => (img.qualityScore ?? 0) >= minQuality);

  console.log(`🔍 Quality filter: ${highQualityImages.length}/${allImages.length} images meet quality >= ${minQuality}`);

  if (highQualityImages.length < count && allImages.length > highQualityImages.length) {
    const skippedCount = allImages.length - highQualityImages.length;
    console.log(`⚠️ Filtered out ${skippedCount} low-quality images (quality < ${minQuality})`);
  }

  return highQualityImages.slice(0, count);
}

/**
 * Clear the image cache
 */
export function clearImageCache(): void {
  try {
    localStorage.removeItem(IMAGE_CACHE_KEY);
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
 * Fetch an image via CORS proxy and store it in the cache
 * This solves the Facebook CDN authentication/CORS issue
 * Now includes quality tracking - rejects low-quality images
 */
export async function storeImageFromUrl(
  imageUrl: string,
  adId: string,
  conversionRate: number = 5,
  minQualityScore: number = 40 // Reject thumbnails by default
): Promise<CachedImage | null> {
  // Check if already cached
  const existing = getCachedImage(adId);
  if (existing) {
    console.log(`✅ Image already cached for ad ${adId} (quality: ${existing.qualityScore ?? 'unknown'})`);
    return existing;
  }

  // Try each CORS proxy
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy + encodeURIComponent(imageUrl);
      console.log(`📥 Trying to fetch via CORS proxy: ${proxy.substring(0, 30)}...`);

      const response = await fetch(proxyUrl, {
        headers: {
          'Accept': 'image/*',
        },
      });

      if (!response.ok) {
        console.log(`⚠️ Proxy returned ${response.status}, trying next...`);
        continue;
      }

      const blob = await response.blob();

      // Verify it's actually an image
      if (!blob.type.startsWith('image/')) {
        console.log(`⚠️ Response is not an image (${blob.type}), trying next...`);
        continue;
      }

      // Get image dimensions for quality scoring
      const dimensions = await getImageDimensions(blob);
      if (!dimensions) {
        console.log(`⚠️ Could not determine image dimensions, trying next...`);
        continue;
      }

      const { width, height } = dimensions;
      const qualityScore = calculateQualityScore(width, height);
      const fileSize = blob.size;

      console.log(`📐 Image dimensions: ${width}x${height}, quality score: ${qualityScore}, size: ${Math.round(fileSize / 1024)}KB`);

      // Reject low-quality images
      if (qualityScore < minQualityScore) {
        console.log(`⚠️ Image quality too low (${qualityScore} < ${minQualityScore}), skipping this image`);
        return null; // Don't try other proxies - the image itself is low quality
      }

      // Convert to base64
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
        // Quality metadata
        width,
        height,
        fileSize,
        qualityScore,
      };

      // Store in cache
      const cache = getCache();
      cache.images[adId] = cachedImage;
      saveCache(cache);

      console.log(`✅ Cached high-quality image for ad ${adId}: ${width}x${height}, quality ${qualityScore}`);
      return cachedImage;
    } catch (error) {
      console.log(`⚠️ CORS proxy failed:`, error);
      continue;
    }
  }

  console.log(`❌ All CORS proxies failed for ad ${adId}`);
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
