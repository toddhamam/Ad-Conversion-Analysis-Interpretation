// Scoped localStorage helper for multi-ad-account data isolation.
// Appends the current ad account ID to localStorage keys so that
// channel analysis, products, generated ads, and reference images
// are isolated per ad account.
//
// For single-account orgs, returns the unscoped key (backwards compatible).

let _currentAdAccountId: string | null = null;

/**
 * Set the current ad account ID for localStorage key scoping.
 * Called by AdAccountContext when the user switches accounts.
 */
export function setScopedAccountId(adAccountId: string | null): void {
  _currentAdAccountId = adAccountId;
}

/**
 * Get the current ad account ID used for scoping.
 */
export function getScopedAccountId(): string | null {
  return _currentAdAccountId;
}

/**
 * Build a scoped localStorage key.
 * Returns `baseKey_act_123456789` when multi-account is active,
 * or just `baseKey` for single-account orgs (backwards compatible).
 */
export function scopedKey(baseKey: string): string {
  if (!_currentAdAccountId) return baseKey;
  return `${baseKey}_${_currentAdAccountId}`;
}

/**
 * Get an item from localStorage using a scoped key.
 */
export function getScopedItem(baseKey: string): string | null {
  return localStorage.getItem(scopedKey(baseKey));
}

/**
 * Set an item in localStorage using a scoped key.
 */
export function setScopedItem(baseKey: string, value: string): void {
  localStorage.setItem(scopedKey(baseKey), value);
}

/**
 * Remove an item from localStorage using a scoped key.
 */
export function removeScopedItem(baseKey: string): void {
  localStorage.removeItem(scopedKey(baseKey));
}

/**
 * Migrate unscoped localStorage data to a scoped key.
 * Used when a single-account org upgrades to multi-account:
 * copies the unscoped data to the first account's scoped key
 * so existing data is preserved.
 */
export function migrateToScoped(baseKey: string, adAccountId: string): void {
  const scopedKeyName = `${baseKey}_${adAccountId}`;
  const unscoped = localStorage.getItem(baseKey);
  if (unscoped && !localStorage.getItem(scopedKeyName)) {
    localStorage.setItem(scopedKeyName, unscoped);
  }
}
