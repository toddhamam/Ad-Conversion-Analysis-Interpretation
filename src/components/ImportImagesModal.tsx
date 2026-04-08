import { useState } from 'react';
import type { AdAccountInfo } from '../services/metaApi';
import type { CachedImage } from '../services/imageCache';
import './ImportImagesModal.css';

const IMAGE_CACHE_KEY = 'conversion_intelligence_image_cache';

export interface AvailableImageImport {
  account: AdAccountInfo;
  imageCount: number;
  topConversions: number;
  topCVR: number;
}

/**
 * Scan other activated accounts' localStorage for cached reference images.
 * Returns accounts that have image data available to import.
 */
export function getAvailableImageImports(
  accounts: AdAccountInfo[],
  currentAccountId: string | null,
): AvailableImageImport[] {
  const results: AvailableImageImport[] = [];

  for (const account of accounts) {
    if (account.ad_account_id === currentAccountId) continue;

    const key = `${IMAGE_CACHE_KEY}_${account.ad_account_id}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { images?: Record<string, CachedImage> };
      const images = parsed.images;
      if (!images) continue;

      const imageList = Object.values(images);
      if (imageList.length === 0) continue;

      let topConversions = 0;
      let topCVR = 0;
      for (const img of imageList) {
        if ((img.conversions ?? 0) > topConversions) topConversions = img.conversions ?? 0;
        if ((img.conversionRate ?? 0) > topCVR) topCVR = img.conversionRate ?? 0;
      }

      results.push({
        account,
        imageCount: imageList.length,
        topConversions,
        topCVR,
      });
    } catch {
      // Skip corrupted entries
    }
  }

  return results;
}

/**
 * Import reference images from another account into the current account's cache.
 * Merges images (skips duplicates by adId), enforces 20-image cap with the same
 * highest-converting-image protection as imageCache.ts saveCache().
 * Returns: positive count of new images that survived the cap, 0 if all duplicates, -1 on failure.
 */
export function importImages(
  sourceAccountId: string,
  currentCacheKey: string,
): number {
  const sourceKey = `${IMAGE_CACHE_KEY}_${sourceAccountId}`;
  const sourceRaw = localStorage.getItem(sourceKey);
  if (!sourceRaw) return -1;

  const sourceParsed = JSON.parse(sourceRaw) as { images?: Record<string, CachedImage>; lastUpdated?: number };
  const sourceImages = sourceParsed.images;
  if (!sourceImages || Object.keys(sourceImages).length === 0) return 0;

  // Read current account's cache
  let currentParsed: { images: Record<string, CachedImage>; lastUpdated: number };
  try {
    const currentRaw = localStorage.getItem(currentCacheKey);
    currentParsed = currentRaw
      ? JSON.parse(currentRaw)
      : { images: {}, lastUpdated: Date.now() };
    if (!currentParsed.images) currentParsed.images = {};
  } catch {
    currentParsed = { images: {}, lastUpdated: Date.now() };
  }

  // Track which adIds existed before merge
  const existingIds = new Set(Object.keys(currentParsed.images));

  // Merge: add source images that don't already exist in current cache
  let mergedNew = 0;
  for (const [adId, img] of Object.entries(sourceImages)) {
    if (!currentParsed.images[adId]) {
      currentParsed.images[adId] = img;
      mergedNew++;
    }
  }

  if (mergedNew === 0) return 0;

  // Enforce 20-image limit with highest-converting-image protection
  // (mirrors saveCache() logic in imageCache.ts)
  const allImages = Object.values(currentParsed.images);
  if (allImages.length > 20) {
    // Find the highest-converting image by absolute count to protect from eviction
    let highestConvImg: CachedImage | null = null;
    for (const img of allImages) {
      if ((img.conversions ?? 0) > (highestConvImg?.conversions ?? 0)) {
        highestConvImg = img;
      }
    }

    // Sort by CVR and keep top 20
    const sorted = [...allImages].sort((a, b) => (b.conversionRate || 0) - (a.conversionRate || 0));
    const kept = sorted.slice(0, 20);

    // Ensure highest-converting image is retained even if its CVR is low
    if (highestConvImg && (highestConvImg.conversions ?? 0) > 0 && !kept.includes(highestConvImg)) {
      kept[kept.length - 1] = highestConvImg;
    }

    currentParsed.images = {};
    for (const img of kept) {
      currentParsed.images[img.adId] = img;
    }
  }

  // Count how many newly merged images actually survived the cap
  let imported = 0;
  for (const adId of Object.keys(currentParsed.images)) {
    if (!existingIds.has(adId)) imported++;
  }

  if (imported === 0) return 0;

  currentParsed.lastUpdated = Date.now();

  // Write back
  try {
    localStorage.setItem(currentCacheKey, JSON.stringify(currentParsed));
  } catch {
    // QuotaExceededError — clear old unscoped cache and retry
    try {
      localStorage.removeItem(IMAGE_CACHE_KEY);
      localStorage.setItem(currentCacheKey, JSON.stringify(currentParsed));
    } catch {
      return -1;
    }
  }

  // Verify write
  const verify = localStorage.getItem(currentCacheKey);
  if (!verify) return -1;

  return imported;
}

interface ImportImagesModalProps {
  availableImports: AvailableImageImport[];
  currentImageCount: number;
  onImport: (sourceAccountId: string) => number;
  onClose: () => void;
}

export default function ImportImagesModal({
  availableImports,
  currentImageCount,
  onImport,
  onClose,
}: ImportImagesModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [importedAccountId, setImportedAccountId] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  function handleImport(account: AdAccountInfo) {
    setError(null);
    const count = onImport(account.ad_account_id);
    if (count > 0) {
      setImportedAccountId(account.ad_account_id);
      setImportedCount(count);
      setTimeout(onClose, 800);
    } else if (count === 0) {
      setError('All images from this account already exist in your current cache.');
    } else {
      // count < 0 indicates a write/verification failure
      setError('Import failed — try clearing old generated ads to free up storage.');
    }
  }

  return (
    <div className="import-modal-overlay" onClick={onClose}>
      <div className="import-modal" onClick={e => e.stopPropagation()}>
        <button className="import-modal-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="import-modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>

        <h2 className="import-modal-title">Import Reference Images</h2>
        <p className="import-modal-desc">
          Import cached reference images from another ad account's converting ads to inform creative generation on this account.
          {currentImageCount > 0 && (
            <span className="import-images-current">
              {' '}You currently have {currentImageCount} reference image{currentImageCount !== 1 ? 's' : ''}.
            </span>
          )}
        </p>

        {error && (
          <div className="import-modal-error">
            <span className="import-error-icon">!</span>
            {error}
          </div>
        )}

        {availableImports.length === 0 ? (
          <div className="import-modal-empty">
            <p>No reference images available to import.</p>
            <p className="import-empty-hint">
              Sync Meta Ads on another ad account first to cache reference images, then come back to import them here.
            </p>
          </div>
        ) : (
          <div className="import-modal-accounts">
            {availableImports.map(({ account, imageCount, topConversions, topCVR }) => {
              const isImported = importedAccountId === account.ad_account_id;

              return (
                <div key={account.ad_account_id} className={`import-account-card ${isImported ? 'imported' : ''}`}>
                  <div className="import-account-info">
                    <div className="import-account-name">
                      {account.ad_account_name || account.ad_account_id}
                    </div>
                    <div className="import-account-details">
                      <span className="import-detail">
                        {imageCount} image{imageCount !== 1 ? 's' : ''}
                      </span>
                      {topConversions > 0 && (
                        <>
                          <span className="import-detail-sep">&middot;</span>
                          <span className="import-detail">
                            Best: {topConversions} conversion{topConversions !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                      {topCVR > 0 && (
                        <>
                          <span className="import-detail-sep">&middot;</span>
                          <span className="import-detail">
                            Top CVR: {topCVR.toFixed(1)}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    className="import-account-btn"
                    onClick={() => handleImport(account)}
                    disabled={isImported}
                  >
                    {isImported ? `${importedCount} Imported` : 'Import'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
