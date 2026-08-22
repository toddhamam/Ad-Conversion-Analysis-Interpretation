import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { searchAdLibrary, fetchSnapshotImages, type AdLibraryResult } from '../services/metaApi';
import type { AdLibraryInspiration } from '../types';
import { isEmbeddingAvailable, embedText, batchEmbed, cosineSimilarity } from '../services/embeddingService';
import { useAdAccount } from '../contexts/AdAccountContext';
import { captureAdLibraryInspiration, LibraryFullError } from '../services/inspirationLibraryApi';
import './AdLibraryBrowser.css';

// EU/UK countries where commercial ads are available via the Ad Library API.
// Non-EU countries only return political/issue ads through the API.
const EU_UK_COUNTRIES = [
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'IT', label: 'Italy' },
  { code: 'ES', label: 'Spain' },
  { code: 'SE', label: 'Sweden' },
  { code: 'PL', label: 'Poland' },
  { code: 'IE', label: 'Ireland' },
  { code: 'AT', label: 'Austria' },
  { code: 'BE', label: 'Belgium' },
  { code: 'DK', label: 'Denmark' },
  { code: 'PT', label: 'Portugal' },
];

const OTHER_COUNTRIES = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'BR', label: 'Brazil' },
  { code: 'IN', label: 'India' },
  { code: 'IL', label: 'Israel' },
];

const EU_UK_CODES = new Set(EU_UK_COUNTRIES.map(c => c.code));

const PLATFORMS = [
  { value: '', label: 'All Platforms' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'MESSENGER', label: 'Messenger' },
  { value: 'AUDIENCE_NETWORK', label: 'Audience Network' },
];

const MIN_DURATION_OPTIONS = [
  { value: 0, label: 'Any Duration' },
  { value: 30, label: '30+ days' },
  { value: 90, label: '90+ days (established)' },
  { value: 180, label: '180+ days (long runner)' },
  { value: 365, label: '1+ year (proven)' },
];

const SORT_OPTIONS = [
  { value: 'duration', label: 'Longest Running' },
  { value: 'newest', label: 'Newest First' },
  { value: 'relevance', label: 'Relevance (API default)' },
] as const;

type SortOption = typeof SORT_OPTIONS[number]['value'];

const RUNNING_SINCE_OPTIONS = [
  { value: '', label: 'Any Start Date' },
  { value: '3', label: 'Running 3+ months' },
  { value: '6', label: 'Running 6+ months' },
  { value: '12', label: 'Running 1+ year' },
  { value: '24', label: 'Running 2+ years' },
];

function getDateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split('T')[0];
}

function calculateDuration(startTime: string, stopTime?: string): {
  days: number;
  label: string;
  tier: 'long' | 'established' | 'new';
} {
  const start = new Date(startTime);
  const end = stopTime ? new Date(stopTime) : new Date();
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  let label: string;
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    label = months > 0 ? `${years}y ${months}mo` : `${years}y`;
  } else if (days >= 30) {
    label = `${Math.floor(days / 30)}mo`;
  } else {
    label = `${days}d`;
  }

  const tier = days >= 180 ? 'long' : days >= 90 ? 'established' : 'new';
  return { days, label, tier };
}

function resultToInspiration(result: AdLibraryResult): AdLibraryInspiration {
  const duration = calculateDuration(
    result.ad_delivery_start_time || new Date().toISOString(),
    result.ad_delivery_stop_time || undefined
  );
  const bodyText = (result.ad_creative_bodies || []).join(' ');
  const id = `${result.page_id || 'unknown'}_${hashString(bodyText)}`;

  return {
    id,
    pageName: result.page_name || 'Unknown Advertiser',
    pageId: result.page_id || '',
    adCreativeBodies: result.ad_creative_bodies || [],
    adCreativeLinkTitles: result.ad_creative_link_titles || [],
    adCreativeLinkDescriptions: result.ad_creative_link_descriptions || [],
    adSnapshotUrl: result.ad_snapshot_url || '',
    deliveryStartTime: result.ad_delivery_start_time || new Date().toISOString(),
    deliveryStopTime: result.ad_delivery_stop_time || undefined,
    durationDays: duration.days,
    isActive: !result.ad_delivery_stop_time,
    savedAt: new Date().toISOString(),
  };
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getResultKey(result: AdLibraryResult): string {
  if (result.ad_snapshot_url) return result.ad_snapshot_url;
  const text = [...(result.ad_creative_bodies || []), ...(result.ad_creative_link_titles || [])].join(' ');
  return hashString(text + (result.page_id || ''));
}

interface AdLibraryBrowserProps {
  savedInspirations: AdLibraryInspiration[];
  onSaveInspiration: (inspiration: AdLibraryInspiration) => void;
  onRemoveInspiration: (id: string) => void;
  /** Fired after a creative image is captured, so the caller can refresh its reference counts. */
  onCaptured?: () => void;
}

export default function AdLibraryBrowser({
  savedInspirations,
  onSaveInspiration,
  onRemoveInspiration,
  onCaptured,
}: AdLibraryBrowserProps) {
  // Read the account directly rather than accepting a fourth prop. captured_for_ad_account_id
  // is where the capture is filed, not who owns it, and prop-drilling it through AdGenerator
  // for that would be noise. Same idiom as SwipeLibrary.tsx.
  const { currentAccount } = useAdAccount();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<AdLibraryResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API filters (sent to backend)
  const [country, setCountry] = useState('GB');
  const [activeStatus, setActiveStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [platform, setPlatform] = useState('');
  const [runningSince, setRunningSince] = useState('');

  // Client-side filters (applied after fetch)
  const [minDuration, setMinDuration] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('duration');

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [totalFetched, setTotalFetched] = useState(0);

  // Preview image URLs extracted from snapshot pages (snapshot_url → image_url)
  const [previewImages, setPreviewImages] = useState<Record<string, string | null>>({});

  // Image capture state. Tracked SEPARATELY from `savedIds` (copy-only saves) because an ad
  // can be saved as copy, as an image, or both — one shared set would mislabel all three.
  const [capturedKeys, setCapturedKeys] = useState<Set<string>>(new Set());
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);

  // Semantic search state
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState('');
  const [queryEmbedding, setQueryEmbedding] = useState<number[] | null>(null);
  const [resultEmbeddings, setResultEmbeddings] = useState<Map<string, number[]>>(new Map());
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState('');
  const embeddingsAvailable = isEmbeddingAvailable();

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savedIds = new Set(savedInspirations.map(i => i.id));

  // Fetch preview images when results change
  useEffect(() => {
    if (results.length === 0) return;

    // Collect snapshot URLs we haven't fetched yet
    const newUrls = results
      .map(r => r.ad_snapshot_url)
      .filter((url): url is string => !!url && !(url in previewImages));

    if (newUrls.length === 0) return;

    // Mark as loading (undefined = loading, null = failed, string = loaded)
    setPreviewImages(prev => {
      const next = { ...prev };
      for (const url of newUrls) {
        if (!(url in next)) next[url] = undefined as unknown as null;
      }
      return next;
    });

    fetchSnapshotImages(newUrls).then(images => {
      setPreviewImages(prev => {
        const next = { ...prev };
        for (const url of newUrls) {
          // If the API returned a string URL, use it; otherwise mark as failed (null)
          next[url] = (images[url] && typeof images[url] === 'string') ? images[url] : null;
        }
        return next;
      });
    });
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute embeddings for results when semantic mode is active
  useEffect(() => {
    if (!semanticMode || results.length === 0 || !embeddingsAvailable) return;

    const toEmbed: { key: string; text: string }[] = [];
    for (const r of results) {
      const key = getResultKey(r);
      if (resultEmbeddings.has(key)) continue;
      const text = [
        ...(r.ad_creative_link_titles || []),
        ...(r.ad_creative_bodies || []),
      ].join(' ').trim();
      if (text) toEmbed.push({ key, text });
    }

    if (toEmbed.length === 0) return;

    let cancelled = false;
    setIsEmbedding(true);
    setEmbeddingProgress(`ConversionIQ™ analyzing ${toEmbed.length} ads...`);

    batchEmbed(
      toEmbed.map(t => ({ text: t.text })),
      'RETRIEVAL_DOCUMENT',
      (completed, total) => {
        if (!cancelled) setEmbeddingProgress(`ConversionIQ™ analyzing ${completed}/${total} ads...`);
      }
    ).then(vectors => {
      if (cancelled) return;
      setResultEmbeddings(prev => {
        const next = new Map(prev);
        for (let i = 0; i < toEmbed.length; i++) {
          if (vectors[i]) next.set(toEmbed[i].key, vectors[i]!);
        }
        return next;
      });
      setIsEmbedding(false);
      setEmbeddingProgress('');
    });

    return () => {
      cancelled = true;
      setIsEmbedding(false);
      setEmbeddingProgress('');
    };
  }, [semanticMode, results, embeddingsAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  // Similarity scores (recomputed when query or result embeddings change)
  const similarityScores = useMemo(() => {
    if (!queryEmbedding || resultEmbeddings.size === 0) return new Map<string, number>();
    const scores = new Map<string, number>();
    for (const [key, vec] of resultEmbeddings) {
      scores.set(key, cosineSimilarity(queryEmbedding, vec));
    }
    return scores;
  }, [queryEmbedding, resultEmbeddings]);

  // Apply client-side filters and sorting
  const filteredResults = useMemo(() => {
    let filtered = results;

    // Filter by minimum duration
    if (minDuration > 0) {
      filtered = filtered.filter(r => {
        const dur = calculateDuration(
          r.ad_delivery_start_time || '',
          r.ad_delivery_stop_time || undefined
        );
        return dur.days >= minDuration;
      });
    }

    // Sort
    const sorted = [...filtered];
    if (semanticMode && queryEmbedding && similarityScores.size > 0) {
      // Semantic similarity sort takes precedence when active
      sorted.sort((a, b) => {
        const scoreA = similarityScores.get(getResultKey(a)) ?? -1;
        const scoreB = similarityScores.get(getResultKey(b)) ?? -1;
        return scoreB - scoreA;
      });
    } else if (sortBy === 'duration') {
      sorted.sort((a, b) => {
        const dA = calculateDuration(a.ad_delivery_start_time || '', a.ad_delivery_stop_time || undefined).days;
        const dB = calculateDuration(b.ad_delivery_start_time || '', b.ad_delivery_stop_time || undefined).days;
        return dB - dA;
      });
    } else if (sortBy === 'newest') {
      sorted.sort((a, b) => {
        const dateA = new Date(a.ad_delivery_start_time || 0).getTime();
        const dateB = new Date(b.ad_delivery_start_time || 0).getTime();
        return dateB - dateA;
      });
    }
    // 'relevance' = keep API order

    return sorted;
  }, [results, minDuration, sortBy, semanticMode, queryEmbedding, similarityScores]);

  const doSearch = useCallback(async (query: string, cursor?: string) => {
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);
    if (!cursor) {
      setResults([]);
      setTotalFetched(0);
      setResultEmbeddings(new Map());
      setQueryEmbedding(null);
    }

    try {
      // Calculate date min from "running since" filter
      let dateMin: string | undefined;
      if (runningSince) {
        dateMin = getDateMonthsAgo(parseInt(runningSince, 10));
      }

      const response = await searchAdLibrary({
        searchTerms: query.trim(),
        countries: [country],
        activeStatus,
        platforms: platform ? [platform as 'FACEBOOK' | 'INSTAGRAM' | 'AUDIENCE_NETWORK' | 'MESSENGER'] : undefined,
        dateMin,
        limit: 50,
        after: cursor || undefined,
      });

      const newResults = response.data || [];

      if (cursor) {
        setResults(prev => [...prev, ...newResults]);
        setTotalFetched(prev => prev + newResults.length);
      } else {
        setResults(newResults);
        setTotalFetched(newResults.length);
      }

      setNextCursor(response.paging?.cursors?.after || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [country, activeStatus, platform, runningSince]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value.trim()) {
      setResults([]);
      setNextCursor(null);
      setTotalFetched(0);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      doSearch(value);
    }, 500);
  }, [doSearch]);

  const triggerSearch = useCallback(() => {
    if (searchQuery.trim()) {
      doSearch(searchQuery);
    }
  }, [searchQuery, doSearch]);

  const handleSaveToggle = useCallback((result: AdLibraryResult) => {
    const inspiration = resultToInspiration(result);
    if (savedIds.has(inspiration.id)) {
      onRemoveInspiration(inspiration.id);
    } else {
      onSaveInspiration(inspiration);
    }
  }, [savedIds, onSaveInspiration, onRemoveInspiration]);

  /**
   * Capture the ad's creative image into the Inspiration Library.
   *
   * Separate from "Save as Inspiration", which stores the COPY only. The image is what feeds
   * CreativeIQ's visual reference set, and it needs the advertiser and run-length alongside it
   * — longevity is the only proof signal a competitor ad carries.
   */
  const handleCaptureImage = useCallback(async (result: AdLibraryResult) => {
    const adAccountId = currentAccount?.ad_account_id;
    if (!adAccountId) {
      setCaptureError('Select an ad account before saving inspiration.');
      return;
    }

    const key = getResultKey(result);
    const previewUrl = result.ad_snapshot_url ? previewImages[result.ad_snapshot_url] : null;
    if (!previewUrl) {
      setCaptureError('No preview image is available for this ad. Open it and screenshot it instead.');
      return;
    }

    setCapturingKey(key);
    setCaptureError(null);
    setCaptureNotice(null);
    try {
      const duration = calculateDuration(
        result.ad_delivery_start_time || new Date().toISOString(),
        result.ad_delivery_stop_time || undefined
      );
      const outcome = await captureAdLibraryInspiration(adAccountId, {
        imageUrl: previewUrl,
        advertiserName: result.page_name,
        advertiserPageId: result.page_id,
        snapshotUrl: result.ad_snapshot_url,
        deliveryStartTime: result.ad_delivery_start_time,
        deliveryStopTime: result.ad_delivery_stop_time,
        daysRunning: duration.days,
        adCopySnippet: (result.ad_creative_bodies || [])[0],
      });

      setCapturedKeys(prev => new Set(prev).add(key));

      if (outcome.saved === 0 && outcome.duplicates > 0) {
        setCaptureNotice('Already in your Inspiration Library.');
      } else if (outcome.qualityScore !== null && outcome.qualityScore < 60) {
        // Say so rather than let it silently fail the reference-set quality gate later.
        setCaptureNotice('Saved, but the preview is low-resolution and will not be used as a style reference. Screenshot the ad for a usable version.');
      } else {
        setCaptureNotice('Saved to your Inspiration Library.');
      }
      onCaptured?.();
    } catch (err: unknown) {
      setCaptureError(err instanceof LibraryFullError
        ? err.message
        : err instanceof Error ? err.message : 'Could not save that creative.');
    } finally {
      setCapturingKey(null);
    }
  }, [currentAccount?.ad_account_id, previewImages, onCaptured]);

  const handleSemanticSearch = useCallback(async () => {
    if (!semanticQuery.trim() || !embeddingsAvailable) return;
    setIsEmbedding(true);
    setEmbeddingProgress('ConversionIQ™ matching your description...');
    const vector = await embedText(semanticQuery.trim(), 'RETRIEVAL_QUERY');
    setQueryEmbedding(vector);
    setIsEmbedding(false);
    setEmbeddingProgress('');
  }, [semanticQuery, embeddingsAvailable]);

  const handleFindSimilar = useCallback((result: AdLibraryResult) => {
    const key = getResultKey(result);
    const embedding = resultEmbeddings.get(key);
    if (!embedding) return;
    setQueryEmbedding(embedding);
    const title = (result.ad_creative_link_titles || [])[0]
      || (result.ad_creative_bodies || [])[0]?.slice(0, 50)
      || 'this ad';
    setSemanticQuery(`Similar to: ${title}`);
  }, [resultEmbeddings]);

  const activeFilterCount = [
    platform !== '',
    runningSince !== '',
    minDuration > 0,
    sortBy !== 'duration',
    activeStatus !== 'ACTIVE',
  ].filter(Boolean).length;

  return (
    <div className={`ad-library-browser ${isExpanded ? 'expanded' : ''}`}>
      <button
        className="ad-library-trigger"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? 'Collapse Ad Library browser' : 'Expand Ad Library browser'}
      >
        <span className="ad-library-trigger-icon">🔍</span>
        <span className="ad-library-trigger-text">Browse Ad Library for Inspiration</span>
        {savedInspirations.length > 0 && (
          <span className="ad-library-trigger-badge">{savedInspirations.length} saved</span>
        )}
        <span className="ad-library-trigger-chevron">▾</span>
      </button>

      {isExpanded && (
        <div className="ad-library-content">
          {/* Search bar */}
          <div className="ad-library-search-row">
            <input
              type="text"
              className="ad-library-search-input"
              placeholder="Search competitor brands, niches, or cross-industry keywords..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') triggerSearch();
              }}
            />
            <button
              className="ad-library-search-btn"
              onClick={triggerSearch}
              disabled={isSearching || !searchQuery.trim()}
            >
              {isSearching ? '...' : 'Search'}
            </button>
          </div>

          {/* Primary filters row */}
          <div className="ad-library-filters">
            <select
              className="ad-library-filter-select"
              value={country}
              onChange={e => {
                setCountry(e.target.value);
                setTimeout(triggerSearch, 0);
              }}
            >
              <optgroup label="EU/UK (all ads available)">
                {EU_UK_COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Other (political/issue ads only)">
                {OTHER_COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </optgroup>
            </select>

            <div className="ad-library-status-tabs">
              {(['ACTIVE', 'ALL', 'INACTIVE'] as const).map(status => (
                <button
                  key={status}
                  className={`ad-library-status-tab ${activeStatus === status ? 'active' : ''}`}
                  onClick={() => {
                    setActiveStatus(status);
                    if (searchQuery.trim()) {
                      setTimeout(() => doSearch(searchQuery), 0);
                    }
                  }}
                >
                  {status === 'ALL' ? 'All' : status === 'ACTIVE' ? 'Active' : 'Ended'}
                </button>
              ))}
            </div>

            <button
              className={`ad-library-filter-toggle ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(prev => !prev)}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              <span className="ad-library-filter-toggle-icon">{showFilters ? '▴' : '▾'}</span>
            </button>
          </div>

          {/* Advanced filters (collapsible) */}
          {showFilters && (
            <div className="ad-library-advanced-filters">
              <div className="ad-library-filter-group">
                <label className="ad-library-filter-label">Platform</label>
                <select
                  className="ad-library-filter-select"
                  value={platform}
                  onChange={e => {
                    setPlatform(e.target.value);
                    setTimeout(triggerSearch, 0);
                  }}
                >
                  {PLATFORMS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="ad-library-filter-group">
                <label className="ad-library-filter-label">Running Since</label>
                <select
                  className="ad-library-filter-select"
                  value={runningSince}
                  onChange={e => {
                    setRunningSince(e.target.value);
                    setTimeout(triggerSearch, 0);
                  }}
                >
                  {RUNNING_SINCE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="ad-library-filter-group">
                <label className="ad-library-filter-label">Min. Duration</label>
                <select
                  className="ad-library-filter-select"
                  value={minDuration}
                  onChange={e => setMinDuration(Number(e.target.value))}
                >
                  {MIN_DURATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="ad-library-filter-group">
                <label className="ad-library-filter-label">Sort By</label>
                <select
                  className="ad-library-filter-select"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortOption)}
                >
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Geographic availability notice for non-EU/UK countries */}
          {!EU_UK_CODES.has(country) && (
            <div className="ad-library-geo-notice">
              The Ad Library API only returns commercial ads for EU/UK countries. For {
                [...OTHER_COUNTRIES, ...EU_UK_COUNTRIES].find(c => c.code === country)?.label || country
              }, only political/issue ads are available. Switch to an EU/UK country for commercial ad results.
            </div>
          )}

          {captureError && (
            <div className="ad-library-error" role="alert">{captureError}</div>
          )}
          {captureNotice && (
            <div className="ad-library-capture-notice">{captureNotice}</div>
          )}

          {error && (
            <div className="ad-library-error">
              {error}
              {error.toLowerCase().includes('system user') ? (
                <span className="ad-library-error-help">
                  {' '}Re-connect your Meta account using the{' '}
                  <strong>Connect via Facebook</strong> OAuth button in admin settings
                  to get a User access token that supports Ad Library.
                </span>
              ) : (error.toLowerCase().includes('verification') || error.toLowerCase().includes('permission')) && (
                <span className="ad-library-error-help">
                  {' '}Your Facebook account may need{' '}
                  <a href="https://www.facebook.com/ID" target="_blank" rel="noopener noreferrer">
                    identity verification
                  </a>{' '}
                  to use the Ad Library API.
                </span>
              )}
            </div>
          )}

          {isSearching && results.length === 0 && (
            <div className="ad-library-loading">ConversionIQ™ searching Ad Library...</div>
          )}

          {!isSearching && results.length === 0 && searchQuery.trim() && !error && (
            <div className="ad-library-empty">
              <span className="ad-library-empty-icon">📭</span>
              No ads found. Try different keywords or adjust filters.
            </div>
          )}

          {!searchQuery.trim() && results.length === 0 && !isSearching && (
            <div className="ad-library-empty">
              <span className="ad-library-empty-icon">💡</span>
              Search for competitor brands, niche keywords, or cross-industry terms to find ad inspiration.
            </div>
          )}

          {/* Semantic search (after keyword results loaded) */}
          {embeddingsAvailable && results.length > 0 && (
            <div className="ad-library-semantic-row">
              <button
                className={`ad-library-semantic-toggle ${semanticMode ? 'active' : ''}`}
                onClick={() => {
                  const next = !semanticMode;
                  setSemanticMode(next);
                  if (!next) setQueryEmbedding(null);
                }}
              >
                Semantic Search
              </button>
              {semanticMode && (
                <>
                  <input
                    type="text"
                    className="ad-library-semantic-input"
                    placeholder="Describe the ad style or message you're looking for..."
                    value={semanticQuery}
                    onChange={e => setSemanticQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSemanticSearch();
                    }}
                  />
                  <button
                    className="ad-library-semantic-btn"
                    onClick={handleSemanticSearch}
                    disabled={isEmbedding || !semanticQuery.trim()}
                  >
                    {isEmbedding ? '...' : 'Match'}
                  </button>
                </>
              )}
              {isEmbedding && embeddingProgress && (
                <span className="ad-library-embedding-progress">{embeddingProgress}</span>
              )}
            </div>
          )}

          {/* Results count bar */}
          {filteredResults.length > 0 && (
            <div className="ad-library-results-bar">
              <span className="ad-library-results-count">
                {filteredResults.length} ad{filteredResults.length !== 1 ? 's' : ''}
                {minDuration > 0 && ` (filtered from ${totalFetched})`}
              </span>
              {semanticMode && queryEmbedding && similarityScores.size > 0 ? (
                <span className="ad-library-results-hint">sorted by semantic match</span>
              ) : sortBy === 'duration' ? (
                <span className="ad-library-results-hint">sorted by longest running</span>
              ) : null}
            </div>
          )}

          {filteredResults.length > 0 && (
            <div className="ad-library-results">
              {filteredResults.map((result, idx) => {
                const duration = calculateDuration(
                  result.ad_delivery_start_time || '',
                  result.ad_delivery_stop_time || undefined
                );
                const inspiration = resultToInspiration(result);
                const isSaved = savedIds.has(inspiration.id);
                const isTextExpanded = expandedCards.has(idx);
                const bodyText = (result.ad_creative_bodies || [])[0] || '';
                const headline = (result.ad_creative_link_titles || [])[0] || '';
                const linkDesc = (result.ad_creative_link_descriptions || [])[0] || '';

                if (!bodyText && !headline) return null;

                const pageName = result.page_name || 'Unknown';
                const pageInitial = pageName.charAt(0).toUpperCase();
                const snapshotUrl = result.ad_snapshot_url;
                const previewImg = snapshotUrl ? previewImages[snapshotUrl] : null;
                // undefined = still loading, null = failed/not available, string = image URL
                const isImageLoading = snapshotUrl ? previewImages[snapshotUrl] === undefined : false;

                return (
                  <div key={`${result.page_id}-${idx}`} className={`ad-library-card ${isSaved ? 'saved' : ''}`}>
                    {/* Creative image preview */}
                    {snapshotUrl && (
                      <a
                        href={snapshotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ad-library-card-image-link"
                      >
                        {previewImg ? (
                          <img
                            src={previewImg}
                            alt={`Ad by ${pageName}`}
                            className="ad-library-card-image"
                            loading="lazy"
                          />
                        ) : isImageLoading ? (
                          <div className="ad-library-card-image-placeholder">
                            <div className="ad-library-card-image-shimmer" />
                          </div>
                        ) : (
                          <div className="ad-library-card-image-placeholder ad-library-card-image-fallback">
                            <span className="ad-library-card-image-fallback-icon">🖼</span>
                            <span className="ad-library-card-image-fallback-text">View Ad Creative</span>
                          </div>
                        )}
                      </a>
                    )}

                    {/* Card content */}
                    <div className="ad-library-card-content">
                      <div className="ad-library-card-hero-top">
                        <div className="ad-library-card-avatar">{pageInitial}</div>
                        <div className="ad-library-card-hero-info">
                          <span className="ad-library-card-page">{pageName}</span>
                          <span className={`ad-library-duration-badge ${duration.tier}`}>
                            {duration.tier === 'long' ? '🔥 ' : ''}{duration.label}
                            {!result.ad_delivery_stop_time ? ' (active)' : ''}
                          </span>
                          {semanticMode && (() => {
                            const score = similarityScores.get(getResultKey(result));
                            if (score === undefined) return null;
                            const pct = Math.round(score * 100);
                            return (
                              <span className={`ad-library-similarity-badge ${pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low'}`}>
                                {pct}% match
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {headline && (
                        <div className="ad-library-card-hero-headline">{headline}</div>
                      )}

                      {bodyText && (
                        <>
                          <div className={`ad-library-card-body ${isTextExpanded ? 'expanded-text' : ''}`}>
                            {bodyText}
                          </div>
                          {bodyText.length > 150 && (
                            <button
                              className="ad-library-show-more"
                              onClick={() => setExpandedCards(prev => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx); else next.add(idx);
                                return next;
                              })}
                            >
                              {isTextExpanded ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </>
                      )}

                      {linkDesc && (
                        <div className="ad-library-card-link-desc">{linkDesc}</div>
                      )}

                      <div className="ad-library-card-meta">
                        {(result.publisher_platforms || []).map(p => (
                          <span key={p} className="ad-library-platform-badge">{p}</span>
                        ))}
                        {result.ad_delivery_start_time && (
                          <span className="ad-library-card-date">
                            Since {new Date(result.ad_delivery_start_time).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="ad-library-card-actions">
                        <button
                          className={`ad-library-save-btn ${isSaved ? 'saved' : ''}`}
                          onClick={() => handleSaveToggle(result)}
                          title="Save this ad's copy as a writing reference"
                        >
                          {isSaved ? '✓ Copy saved' : '+ Save copy'}
                        </button>
                        <button
                          className={`ad-library-capture-btn ${capturedKeys.has(getResultKey(result)) ? 'saved' : ''}`}
                          onClick={() => handleCaptureImage(result)}
                          disabled={
                            capturingKey === getResultKey(result)
                            || !(result.ad_snapshot_url && previewImages[result.ad_snapshot_url])
                          }
                          title={
                            result.ad_snapshot_url && previewImages[result.ad_snapshot_url]
                              ? "Save this ad's creative as a visual reference"
                              : 'No preview image available — open the ad and screenshot it instead'
                          }
                        >
                          {capturingKey === getResultKey(result)
                            ? 'Saving...'
                            : capturedKeys.has(getResultKey(result))
                              ? '✓ Image saved'
                              : '◇ Save with image'}
                        </button>
                        {semanticMode && resultEmbeddings.has(getResultKey(result)) && (
                          <button
                            className="ad-library-find-similar-btn"
                            onClick={() => handleFindSimilar(result)}
                          >
                            Find similar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {nextCursor && !isSearching && (
            <button
              className="ad-library-load-more"
              onClick={() => doSearch(searchQuery, nextCursor)}
              disabled={isSearching}
            >
              Load more results
            </button>
          )}

          {isSearching && results.length > 0 && (
            <div className="ad-library-loading">Loading more...</div>
          )}
        </div>
      )}
    </div>
  );
}
