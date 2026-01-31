/**
 * Tenant detection utilities for multi-tenant subdomain routing
 *
 * URL patterns:
 * - app.convertra.io or convertra.io -> main app (no tenant)
 * - acme.convertra.io -> tenant slug "acme"
 * - localhost:5175 -> development (no tenant)
 */

// Reserved subdomains that are not tenant slugs
const RESERVED_SUBDOMAINS = ['app', 'www', 'api', 'admin', 'staging', 'dev'];

/**
 * Extract tenant slug from current hostname
 * Returns null if on main app domain or development
 */
export function getTenantSlug(): string | null {
  const host = window.location.hostname;

  // Development environment
  if (host === 'localhost' || host === '127.0.0.1') {
    // Check for tenant override in localStorage (for dev testing)
    return localStorage.getItem('dev_tenant_slug');
  }

  // Production: Check for subdomain pattern
  // Match: {slug}.convertra.io
  const match = host.match(/^([^.]+)\.convertra\.io$/i);

  if (match) {
    const subdomain = match[1].toLowerCase();

    // Skip reserved subdomains
    if (RESERVED_SUBDOMAINS.includes(subdomain)) {
      return null;
    }

    return subdomain;
  }

  // Custom domain support: Store domain -> slug mapping in database
  // For now, return null (will be implemented with custom domain feature)
  return null;
}

/**
 * Check if we're on a tenant subdomain
 */
export function isTenantDomain(): boolean {
  return getTenantSlug() !== null;
}

/**
 * Get the base URL for the main app (non-tenant)
 */
export function getMainAppUrl(): string {
  if (window.location.hostname === 'localhost') {
    return window.location.origin;
  }
  return 'https://app.convertra.io';
}

/**
 * Get the URL for a specific tenant
 */
export function getTenantUrl(slug: string): string {
  if (window.location.hostname === 'localhost') {
    // In development, just add query param
    return `${window.location.origin}?tenant=${slug}`;
  }
  return `https://${slug}.convertra.io`;
}

/**
 * Set tenant slug for development testing
 * Call this from browser console: setDevTenant('acme')
 */
export function setDevTenant(slug: string | null): void {
  if (slug) {
    localStorage.setItem('dev_tenant_slug', slug);
    console.log(`Development tenant set to: ${slug}`);
  } else {
    localStorage.removeItem('dev_tenant_slug');
    console.log('Development tenant cleared');
  }
  // Reload to apply
  window.location.reload();
}

// Expose to window for development testing
if (typeof window !== 'undefined') {
  (window as unknown as { setDevTenant: typeof setDevTenant }).setDevTenant = setDevTenant;
}
