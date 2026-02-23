/**
 * In-memory publish store for passing generated ads from AdGenerator to AdPublisher.
 *
 * localStorage has a ~5MB limit and silently fails when exceeded (base64 images
 * are large). This module-level store has no size limit and is synchronous.
 *
 * Flow:
 *   AdGenerator → setPublishData(ads) → navigate('/publish')
 *   AdPublisher → getPublishData() → returns ads (and clears the store)
 *
 * Falls back to localStorage if the in-memory store is empty (e.g. page refresh).
 */

import type { GeneratedAdPackage } from './openaiApi';

let _pendingAds: GeneratedAdPackage[] | null = null;

/** Store ads for the publisher to pick up. */
export function setPublishData(ads: GeneratedAdPackage[]): void {
  _pendingAds = ads;
}

/**
 * Retrieve and clear stored ads.
 * Returns null if no in-memory data is available (caller should fall back to localStorage).
 */
export function getPublishData(): GeneratedAdPackage[] | null {
  const data = _pendingAds;
  _pendingAds = null;
  return data;
}
