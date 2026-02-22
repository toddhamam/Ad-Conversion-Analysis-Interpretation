import { useState, useRef, useCallback, useMemo } from 'react';
import { searchAdLibrary, type AdLibraryResult } from '../services/metaApi';
import type { AdLibraryInspiration } from '../types';
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

interface AdLibraryBrowserProps {
  savedInspirations: AdLibraryInspiration[];
  onSaveInspiration: (inspiration: AdLibraryInspiration) => void;
  onRemoveInspiration: (id: string) => void;
}

export default function AdLibraryBrowser({
  savedInspirations,
  onSaveInspiration,
  onRemoveInspiration,
}: AdLibraryBrowserProps) {
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

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savedIds = new Set(savedInspirations.map(i => i.id));

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
    if (sortBy === 'duration') {
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
  }, [results, minDuration, sortBy]);

  const doSearch = useCallback(async (query: string, cursor?: string) => {
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);
    if (!cursor) {
      setResults([]);
      setTotalFetched(0);
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

          {/* Results count bar */}
          {filteredResults.length > 0 && (
            <div className="ad-library-results-bar">
              <span className="ad-library-results-count">
                {filteredResults.length} ad{filteredResults.length !== 1 ? 's' : ''}
                {minDuration > 0 && ` (filtered from ${totalFetched})`}
              </span>
              {sortBy === 'duration' && (
                <span className="ad-library-results-hint">sorted by longest running</span>
              )}
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

                return (
                  <div key={`${result.page_id}-${idx}`} className={`ad-library-card ${isSaved ? 'saved' : ''}`}>
                    {/* Hero area — headline preview with page identity */}
                    <div className="ad-library-card-hero">
                      <div className="ad-library-card-hero-top">
                        <div className="ad-library-card-avatar">{pageInitial}</div>
                        <div className="ad-library-card-hero-info">
                          <span className="ad-library-card-page">{pageName}</span>
                          <span className={`ad-library-duration-badge ${duration.tier}`}>
                            {duration.tier === 'long' ? '🔥 ' : ''}{duration.label}
                            {!result.ad_delivery_stop_time ? ' (active)' : ''}
                          </span>
                        </div>
                      </div>
                      {headline && (
                        <div className="ad-library-card-hero-headline">{headline}</div>
                      )}
                      {result.ad_snapshot_url && (
                        <a
                          href={result.ad_snapshot_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ad-library-view-creative-btn"
                        >
                          View Ad Creative
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M4.5 2.5H2.5V9.5H9.5V7.5M7 2.5H9.5V5M9.5 2.5L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </a>
                      )}
                    </div>

                    {/* Card content — body copy and metadata */}
                    <div className="ad-library-card-content">
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
                        >
                          {isSaved ? '✓ Saved' : '+ Save as Inspiration'}
                        </button>
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
