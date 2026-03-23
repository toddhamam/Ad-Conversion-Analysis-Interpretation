// Swipe Library API Service
// Follows seoIqApi.ts pattern — typed functions with auth header injection

import { supabase } from '../lib/supabase';

const API_BASE = '/api/meta';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SwipeElementType = 'headline' | 'body_copy' | 'image';

export type SwipeConversionType = 'purchase' | 'lead' | 'both' | 'none';

export interface PerformanceSnapshot {
  cvr?: number;
  cpa?: number;
  ctr?: number;
  roas?: number;
  conversions?: number;
  spend?: number;
  conversion_type?: SwipeConversionType;
  purchase_conversions?: number;
  lead_conversions?: number;
}

export interface SwipeLibraryItem {
  id: string;
  organization_id: string;
  ad_account_id: string;
  element_type: SwipeElementType;
  text_content: string | null;
  image_thumbnail: string | null;
  image_mime_type: string | null;
  meta_ad_id: string | null;
  meta_campaign_name: string | null;
  meta_adset_name: string | null;
  performance_snapshot: PerformanceSnapshot;
  content_hash: string;
  tags: string[];
  notes: string | null;
  is_pinned: boolean;
  saved_by: string | null;
  created_at: string;
  updated_at: string;
  group_id: string;
  campaign_type: string | null;
}

export interface SwipeLibrarySavePayload {
  element_type: SwipeElementType;
  text_content?: string;
  image_data?: string;
  image_thumbnail?: string;
  image_mime_type?: string;
  meta_ad_id?: string;
  meta_campaign_name?: string;
  meta_adset_name?: string;
  performance_snapshot?: PerformanceSnapshot;
  content_hash: string;
  tags?: string[];
  notes?: string;
  group_id?: string;
  campaign_type?: string;
}

export type CampaignTypeFilter = 'all' | 'Prospecting' | 'Retargeting' | 'Retention';

export interface SwipeListFilters {
  conversion_type?: SwipeConversionType;
  campaign_type?: string;
  search?: string;
  sort?: 'newest' | 'oldest' | 'cvr' | 'cpa';
  limit?: number;
  offset?: number;
}

// ─── Grouping ───────────────────────────────────────────────────────────────

export interface SwipeAdGroup {
  groupId: string;
  metaAdId: string | null;
  campaignName: string | null;
  campaignType: string | null;
  adsetName: string | null;
  performance: PerformanceSnapshot;
  headline: SwipeLibraryItem | null;
  bodyCopy: SwipeLibraryItem | null;
  image: SwipeLibraryItem | null;
  items: SwipeLibraryItem[];
  isPinned: boolean;
  tags: string[];
  notes: string | null;
  createdAt: string;
}

export function groupSwipeItems(items: SwipeLibraryItem[]): SwipeAdGroup[] {
  const map = new Map<string, SwipeLibraryItem[]>();
  for (const item of items) {
    const key = item.group_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  const groups: SwipeAdGroup[] = [];
  for (const [groupId, groupItems] of map) {
    const headline = groupItems.find(i => i.element_type === 'headline') || null;
    const bodyCopy = groupItems.find(i => i.element_type === 'body_copy') || null;
    const image = groupItems.find(i => i.element_type === 'image') || null;
    const first = groupItems[0];

    // Union of all tags, deduplicated
    const tagSet = new Set<string>();
    for (const item of groupItems) {
      for (const tag of item.tags) tagSet.add(tag);
    }

    // Notes from first item that has them
    const notesItem = groupItems.find(i => i.notes);

    // Earliest created_at
    const earliest = groupItems.reduce((min, i) =>
      i.created_at < min ? i.created_at : min, groupItems[0].created_at);

    // Pinned if any item is pinned
    const isPinned = groupItems.some(i => i.is_pinned);

    groups.push({
      groupId,
      metaAdId: first.meta_ad_id,
      campaignName: first.meta_campaign_name,
      campaignType: first.campaign_type,
      adsetName: first.meta_adset_name,
      performance: first.performance_snapshot,
      headline,
      bodyCopy,
      image,
      items: groupItems,
      isPinned,
      tags: Array.from(tagSet),
      notes: notesItem?.notes || null,
      createdAt: earliest,
    });
  }

  // Sort: pinned first, then newest first
  groups.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return groups;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options?.headers);
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export async function computeContentHash(content: string): Promise<string> {
  const normalized = content.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── API Functions ──────────────────────────────────────────────────────────

export async function fetchSwipeLibrary(
  adAccountId: string,
  filters?: SwipeListFilters
): Promise<{ items: SwipeLibraryItem[]; total: number }> {
  const params = new URLSearchParams({ ad_account_id: adAccountId });
  if (filters?.conversion_type) params.set('conversion_type', filters.conversion_type);
  if (filters?.campaign_type) params.set('campaign_type', filters.campaign_type);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.sort) params.set('sort', filters.sort);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  return fetchJson<{ items: SwipeLibraryItem[]; total: number }>(
    `${API_BASE}/swipe-list?${params.toString()}`
  );
}

export async function saveToSwipeLibrary(
  adAccountId: string,
  items: SwipeLibrarySavePayload[]
): Promise<{ saved: number; duplicates: number }> {
  return fetchJson<{ saved: number; duplicates: number }>(
    `${API_BASE}/swipe-save`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_account_id: adAccountId, items }),
    }
  );
}

export async function updateSwipeItem(
  id: string,
  updates: { tags?: string[]; notes?: string; is_pinned?: boolean }
): Promise<SwipeLibraryItem> {
  return fetchJson<SwipeLibraryItem>(
    `${API_BASE}/swipe-update`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    }
  );
}

export async function deleteSwipeItems(ids: string[]): Promise<{ deleted: number }> {
  return fetchJson<{ deleted: number }>(
    `${API_BASE}/swipe-delete`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }
  );
}

export async function fetchSwipeImage(id: string): Promise<{ image_data: string; image_mime_type: string }> {
  return fetchJson<{ image_data: string; image_mime_type: string }>(
    `${API_BASE}/swipe-image?id=${encodeURIComponent(id)}`
  );
}

export async function checkSavedHashes(
  adAccountId: string,
  hashes: string[],
  groupIds?: string[]
): Promise<Set<string>> {
  const result = await fetchJson<{ saved: string[] }>(
    `${API_BASE}/swipe-check`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_account_id: adAccountId,
        content_hashes: hashes,
        group_ids: groupIds,
      }),
    }
  );
  return new Set(result.saved);
}
