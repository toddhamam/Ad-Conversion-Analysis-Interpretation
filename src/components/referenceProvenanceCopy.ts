// User-facing copy for visual reference provenance — the UI twin of the prompt vocabulary in
// lib/referenceProvenance.ts, and the same idea as channelInsightsCopy.ts's MODE_COPY.
//
// A lookup rather than a ternary at every render site, so all the wording a user reads about
// where a reference came from lives in one reviewable file. The rule this encodes: a user must
// never be able to mistake unproven outside material for a proven winner, and the two must
// never be summed into a single "N references" figure.

import type { ReferenceSource, IngestLane } from '../lib/referenceProvenance';

export interface ReferenceUiCopy {
  /** Short chip text prefix, e.g. "External" in "External · Acme · 214d". */
  badge: string;
  /** CSS modifier suffix — `.ref-chip.is-{tone}`. Never a hardcoded colour. */
  tone: 'measured' | 'brand' | 'external';
  /** One-line explanation shown on hover / in the panel. */
  hint: string;
}

export const REFERENCE_UI: Record<ReferenceSource, ReferenceUiCopy> = {
  own_winner: {
    badge: 'Own',
    tone: 'measured',
    hint: 'From an ad in this account, with measured delivery data behind it.',
  },
  own_upload: {
    badge: 'Brand asset',
    tone: 'brand',
    hint: 'You uploaded this. It is authoritative for how the brand looks, but it has never run as an ad.',
  },
  external: {
    badge: 'External',
    tone: 'external',
    hint: 'Outside material. No conversion data for this account — how long it has been running is the only proof signal.',
  },
};

export const LANE_UI: Record<IngestLane, { label: string; icon: string }> = {
  ad_library: { label: 'Ad Library', icon: '🔍' },
  screenshot: { label: 'Screenshot', icon: '📋' },
  deck_upload: { label: 'Upload', icon: '📁' },
  url_import: { label: 'URL', icon: '🔗' },
};

/**
 * Longevity, phrased so an absent value reads as "we don't know" rather than as zero.
 * A competitor capture with no duration is weaker evidence than one running 400 days, and
 * the UI has to say so rather than leave a blank cell.
 */
export function longevityLabel(daysRunning: number | null | undefined): string {
  if (typeof daysRunning !== 'number') return 'Unknown run length';
  if (daysRunning >= 365) {
    const years = Math.floor(daysRunning / 365);
    const months = Math.floor((daysRunning % 365) / 30);
    return months > 0 ? `Running ${years}y ${months}mo` : `Running ${years}y`;
  }
  if (daysRunning >= 30) return `Running ${Math.floor(daysRunning / 30)}mo`;
  return `Running ${daysRunning}d`;
}

/** The chip a thumbnail carries. Kept as one function so every surface says the same thing. */
export function referenceChipText(
  source: ReferenceSource,
  detail: { conversions?: number | null; advertiser?: string | null; daysRunning?: number | null }
): string {
  const copy = REFERENCE_UI[source];
  if (source === 'own_winner') {
    return typeof detail.conversions === 'number'
      ? `${copy.badge} · ${detail.conversions} conv`
      : copy.badge;
  }
  if (source === 'external') {
    const parts = [copy.badge];
    if (detail.advertiser) parts.push(detail.advertiser);
    if (typeof detail.daysRunning === 'number') parts.push(`${detail.daysRunning}d`);
    return parts.join(' · ');
  }
  return copy.badge;
}
