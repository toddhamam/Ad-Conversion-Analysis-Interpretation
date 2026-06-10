// Shared product-image resize/encode for the two mockup upload paths (Products page and
// the in-flow ProductConfigurator in Integrations). Fine text on product mockups must
// survive this encode — CreativeIQ replicates the design 1:1 from the stored image, so
// quality regressions here surface as typography drift in generated ads (see PRODUCT
// MOCKUP PRESERVATION in openaiApi.ts).

// Bounded to stay within localStorage limits (products live in scoped localStorage)
export const PRODUCT_IMAGE_MAX_DIMENSION = 1024;

// 0.8 left compression artifacts on cover text that image models then "read" and
// reproduced as altered typography
const PRODUCT_IMAGE_JPEG_QUALITY = 0.9;

/**
 * Load an image file, downscale it to fit within maxDimension (high-quality
 * interpolation), and return raw base64 JPEG data (no data-URL prefix).
 */
export async function fileToResizedJpegBase64(
  file: File,
  maxDimension: number = PRODUCT_IMAGE_MAX_DIMENSION
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Resize if either dimension exceeds the max
      if (width > maxDimension || height > maxDimension) {
        const scale = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Failed to create canvas context')); return; }

      // High-quality downscale — fine text on product mockups must survive the resize
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', PRODUCT_IMAGE_JPEG_QUALITY);
      const base64 = dataUrl.split(',')[1];
      if (!base64) { reject(new Error('Canvas toDataURL returned empty data')); return; }
      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
