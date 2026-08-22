// External inspiration references for CreativeIQ generation.
//
// Extracted from AdGenerator so that already-4000-line component does not also own the
// loading, activation and lazy-pixel-fetching of a second reference source. Everything here
// is one cohesive concern: which external references exist for this account, which are active,
// and how to materialise them at generation time.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchInspirationLibrary,
  loadExternalStyleReferences,
  type InspirationItem,
} from '../services/inspirationLibraryApi';
import { isUsableDescriptor, type StyleDescriptor } from '../lib/styleDescriptor';
import type { StyleReference } from '../lib/referenceProvenance';
import { MAX_EXTERNAL_REFERENCES } from '../services/referenceSet';

export interface InspirationReferences {
  items: InspirationItem[];
  activeIds: string[];
  /** Longest run length across the library, or null when none is known. */
  longestRunningDays: number | null;
  /** Cached style descriptors for the active references, validated at this boundary. */
  activeDescriptorsById: Record<string, StyleDescriptor>;
  toggle(id: string): void;
  refresh(): void;
  /** Load full-resolution pixels for the active references. Call at generation time. */
  loadActiveStyleReferences(): Promise<StyleReference[] | undefined>;
}

/**
 * How many external references may be active at once.
 *
 * Mirrors `MAX_EXTERNAL_REFERENCES`, which is the real limit — `resolveReferenceSet` trims
 * anything beyond what one request can carry. Imported rather than re-declared so the picker
 * can never promise more than the request will actually send.
 */
export const MAX_ACTIVE_INSPIRATION_REFS = MAX_EXTERNAL_REFERENCES;

const NO_ITEMS: InspirationItem[] = [];
const NO_IDS: string[] = [];

export function useInspirationReferences(adAccountId: string | undefined): InspirationReferences {
  // State is stored WITH the account it belongs to and derived by matching, rather than
  // stored bare and cleared on switch. Two things fall out of that: there is no clearing
  // effect (a synchronous setState in an effect body causes cascading renders), and the
  // previous account's references cannot appear during the gap between switching accounts
  // and the new load resolving — the match simply fails and the derived value is empty.
  const [loaded, setLoaded] = useState<{ accountId: string; items: InspirationItem[] } | null>(null);
  const [activeFor, setActiveFor] = useState<{ accountId: string; ids: string[] } | null>(null);

  const items = loaded && loaded.accountId === adAccountId ? loaded.items : NO_ITEMS;
  const activeIds = activeFor && activeFor.accountId === adAccountId ? activeFor.ids : NO_IDS;

  /**
   * Load and pre-activate the strongest references.
   *
   * Pinned first, then longest-running, because longevity is the only proof signal external
   * material carries. Auto-activating is what makes this useful to a cold-start account with
   * no extra configuration step; the panel shows exactly what is active so it is never a
   * surprise. An explicit choice is preserved across a refresh — only a cold load auto-picks.
   */
  const load = useCallback(async (accountId: string, isCancelled?: () => boolean) => {
    try {
      const result = await fetchInspirationLibrary(accountId, { sort: 'longevity' });
      if (isCancelled?.()) return;
      setLoaded({ accountId, items: result.items });
      setActiveFor(prev => {
        // Preserve an explicit choice across a refresh of the SAME account; only a cold load
        // (or a different account) auto-picks.
        const carried = prev?.accountId === accountId
          ? prev.ids.filter(id => result.items.some(i => i.id === id))
          : [];
        if (carried.length > 0) return { accountId, ids: carried };
        const ranked = [...result.items].sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return (b.days_running ?? -1) - (a.days_running ?? -1);
        });
        return { accountId, ids: ranked.slice(0, MAX_ACTIVE_INSPIRATION_REFS).map(i => i.id) };
      });
    } catch (error: unknown) {
      // A missing inspiration library must never block generation — it is purely additive.
      if (isCancelled?.()) return;
      console.warn('Could not load inspiration library:', error instanceof Error ? error.message : error);
      setLoaded({ accountId, items: [] });
      setActiveFor({ accountId, ids: [] });
    }
  }, []);

  useEffect(() => {
    if (!adAccountId) return;
    // Cancelled on account switch so a slow response cannot land on the wrong account.
    let cancelled = false;
    load(adAccountId, () => cancelled);
    return () => { cancelled = true; };
  }, [adAccountId, load]);

  const refresh = useCallback(() => {
    if (adAccountId) load(adAccountId);
  }, [adAccountId, load]);

  const toggle = useCallback((id: string) => {
    if (!adAccountId) return;
    setActiveFor(prev => {
      const ids = prev?.accountId === adAccountId ? prev.ids : [];
      if (ids.includes(id)) return { accountId: adAccountId, ids: ids.filter(x => x !== id) };
      if (ids.length >= MAX_ACTIVE_INSPIRATION_REFS) return prev;
      return { accountId: adAccountId, ids: [...ids, id] };
    });
  }, [adAccountId]);

  const longestRunningDays = useMemo(() => {
    const durations = items.map(i => i.days_running).filter((d): d is number => typeof d === 'number');
    return durations.length > 0 ? Math.max(...durations) : null;
  }, [items]);

  const activeDescriptorsById = useMemo(() => {
    // Validated HERE, where untrusted JSONB from the database enters the app, so everything
    // downstream takes a real StyleDescriptor rather than an `unknown` it has to re-check.
    const map: Record<string, StyleDescriptor> = {};
    for (const item of items) {
      if (!activeIds.includes(item.id)) continue;
      if (isUsableDescriptor(item.style_descriptor)) map[item.id] = item.style_descriptor;
    }
    return map;
  }, [items, activeIds]);

  /**
   * Materialise the active references.
   *
   * Deliberately NOT held in state: a handful of full-size base64 images is tens of MB, and
   * keeping them resident for the whole CreativeIQ session is the memory-exhaustion class of
   * bug this codebase has hit before.
   */
  const loadActiveStyleReferences = useCallback(async (): Promise<StyleReference[] | undefined> => {
    if (activeIds.length === 0) return undefined;
    const active = items.filter(i => activeIds.includes(i.id));
    if (active.length === 0) return undefined;
    try {
      const refs = await loadExternalStyleReferences(active);
      return refs.length > 0 ? refs : undefined;
    } catch (error: unknown) {
      console.warn('Could not load external references:', error instanceof Error ? error.message : error);
      return undefined;
    }
  }, [items, activeIds]);

  return {
    items,
    activeIds,
    longestRunningDays,
    activeDescriptorsById,
    toggle,
    refresh,
    loadActiveStyleReferences,
  };
}
