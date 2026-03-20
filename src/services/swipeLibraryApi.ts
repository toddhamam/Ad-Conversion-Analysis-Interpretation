// Swipe Library API Service
// Follows seoIqApi.ts pattern — typed functions with auth header injection

import { supabase } from '../lib/supabase';

const API_BASE = '/api/meta';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SwipeElementType = 'headline' | 'body_copy' | 'image';

export interface PerformanceSnapshot {
  cvr?: number;
  cpa?: number;
  ctr?: number;
  roas?: number;
  conversions?: number;
  spend?: number;
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
}

export interface SwipeListFilters {
  element_type?: SwipeElementType;
  search?: string;
  sort?: 'newest' | 'oldest' | 'cvr' | 'cpa';
  limit?: number;
  offset?: number;
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
  if (filters?.element_type) params.set('element_type', filters.element_type);
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
  hashes: string[]
): Promise<Set<string>> {
  const result = await fetchJson<{ saved: string[] }>(
    `${API_BASE}/swipe-check`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_account_id: adAccountId, content_hashes: hashes }),
    }
  );
  return new Set(result.saved);
}
