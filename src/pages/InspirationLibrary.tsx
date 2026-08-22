import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAdAccount } from '../contexts/AdAccountContext';
import {
  fetchInspirationLibrary,
  saveInspirationItems,
  updateInspirationItem,
  deleteInspirationItems,
  purgeInspirationLibrary,
  fetchInspirationImage,
  buildPayloadsFromFiles,
  backfillStyleDescriptors,
  importInspirationFromUrl,
  LibraryFullError,
  UrlImportDisabledError,
  MAX_INSPIRATION_ITEMS,
  type InspirationItem,
} from '../services/inspirationLibraryApi';
import { isAcceptedImageType, ACCEPTED_MIME_TYPES } from '../lib/imageNormalize';
import { extractPdfPages } from '../lib/pdfPages';
import { REFERENCE_UI, LANE_UI, longevityLabel } from '../components/referenceProvenanceCopy';
import type { IngestLane } from '../lib/referenceProvenance';
import SEO from '../components/SEO';
import Loading from '../components/Loading';
import './InspirationLibrary.css';

type SortOption = 'newest' | 'oldest' | 'longevity';
type LaneFilter = IngestLane | 'all';

const LANE_FILTERS: Array<{ value: LaneFilter; label: string }> = [
  { value: 'all', label: 'All sources' },
  { value: 'ad_library', label: 'Ad Library' },
  { value: 'screenshot', label: 'Screenshots' },
  { value: 'deck_upload', label: 'Uploads' },
  { value: 'url_import', label: 'URL imports' },
];

/** Files accepted per bulk selection. Beyond this the browser tab, not the server, is the limit. */
const MAX_FILES_PER_UPLOAD = 20;

const InspirationLibrary = () => {
  const { currentAccount } = useAdAccount();
  const adAccountId = currentAccount?.ad_account_id;

  const [items, setItems] = useState<InspirationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [laneFilter, setLaneFilter] = useState<LaneFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<InspirationItem | null>(null);
  const [editTags, setEditTags] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [viewing, setViewing] = useState<{ data: string; mime: string } | null>(null);
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);

  const [urlDraft, setUrlDraft] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Loading ───────────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    if (!adAccountId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchInspirationLibrary(adAccountId, {
        lane: laneFilter === 'all' ? undefined : laneFilter,
        search: debouncedSearch.trim() || undefined,
        sort: sortBy,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load inspiration library');
    } finally {
      setLoading(false);
    }
  }, [adAccountId, laneFilter, debouncedSearch, sortBy]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Debounced so typing a search term is one request, not one per keystroke.
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  // ── Ingest ────────────────────────────────────────────────────────────────

  const ingestFiles = useCallback(async (files: File[], lane: IngestLane) => {
    if (!adAccountId || files.length === 0) return;

    const images = files.filter(f => isAcceptedImageType(f.type)).slice(0, MAX_FILES_PER_UPLOAD);
    const rejectedType = files.length - files.filter(f => isAcceptedImageType(f.type)).length;
    const rejectedCount = Math.max(0, files.filter(f => isAcceptedImageType(f.type)).length - images.length);

    if (images.length === 0) {
      setError('No supported images found. Use PNG, JPEG, WEBP or GIF.');
      return;
    }

    setIngesting(true);
    setError(null);
    setNotice(null);
    try {
      const { payloads, failed } = await buildPayloadsFromFiles(
        images,
        lane,
        {},
        (done, count) => setIngestProgress(`ConversionIQ™ processing ${done} of ${count}...`)
      );

      if (payloads.length === 0) {
        setError('None of those images could be read.');
        return;
      }

      setIngestProgress('ConversionIQ™ saving references...');
      const result = await saveInspirationItems(adAccountId, payloads);

      // Report every shortfall explicitly. Silently saving 6 of 10 reads as success.
      const parts: string[] = [`Added ${result.saved} reference${result.saved === 1 ? '' : 's'}`];
      if (result.duplicates > 0) parts.push(`${result.duplicates} already saved`);
      if (result.skippedForSpace > 0) parts.push(`${result.skippedForSpace} skipped — library full`);
      if (failed > 0) parts.push(`${failed} could not be read`);
      if (rejectedType > 0) parts.push(`${rejectedType} not an image`);
      if (rejectedCount > 0) parts.push(`${rejectedCount} over the ${MAX_FILES_PER_UPLOAD}-file limit`);
      setNotice(parts.join(' · '));

      await loadItems();

      // Describe the new references in the background so the descriptor cache is warm before
      // the next generation. Deliberately not awaited: ingest is done, and a vision call
      // failing here costs nothing — generation falls back to analysing the set live.
      if (result.items.length > 0) {
        backfillStyleDescriptors(result.items)
          .then(() => loadItems())
          .catch(() => {/* already logged; the cache is an optimisation, not a requirement */});
      }
    } catch (err: unknown) {
      setError(err instanceof LibraryFullError
        ? err.message
        : err instanceof Error ? err.message : 'Failed to save references');
    } finally {
      setIngesting(false);
      setIngestProgress(null);
    }
  }, [adAccountId, loadItems]);

  // Paste handler is scoped to the drop zone, NOT document — a document-level listener would
  // hijack pasting into the notes field and every other textarea in the app.
  useEffect(() => {
    const node = dropZoneRef.current;
    if (!node) return;

    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter(f => isAcceptedImageType(f.type));
      if (files.length === 0) return;
      e.preventDefault();
      ingestFiles(files, 'screenshot');
    };

    node.addEventListener('paste', onPaste);
    return () => node.removeEventListener('paste', onPaste);
  }, [ingestFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    ingestFiles(Array.from(e.dataTransfer.files), 'screenshot');
  }, [ingestFiles]);

  const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // let the same file be picked again after a failure
    if (files.length === 0) return;

    // Agency decks arrive as PDFs. Rasterize them client-side into page images, then feed the
    // same ingest path as everything else.
    const pdfs = files.filter(f => f.type === 'application/pdf');
    const images = files.filter(f => f.type !== 'application/pdf');

    if (pdfs.length === 0) {
      ingestFiles(images, 'deck_upload');
      return;
    }

    setIngesting(true);
    setIngestProgress('ConversionIQ™ reading deck...');
    try {
      const pages: File[] = [];
      for (const pdf of pdfs) {
        const extracted = await extractPdfPages(pdf, {
          maxPages: MAX_FILES_PER_UPLOAD,
          onProgress: (done, total) => setIngestProgress(`ConversionIQ™ reading page ${done} of ${total}...`),
        });
        if (extracted.length === 0) {
          setError(`Could not read pages from ${pdf.name}.`);
        }
        pages.push(...extracted);
      }
      if (pages.length === 0 && images.length === 0) return;
      await ingestFiles([...images, ...pages], 'deck_upload');
    } finally {
      setIngesting(false);
      setIngestProgress(null);
    }
  }, [ingestFiles]);

  const handleUrlImport = useCallback(async () => {
    const source = urlDraft.trim();
    if (!adAccountId || !source) return;

    setIngesting(true);
    setError(null);
    setNotice(null);
    setIngestProgress('ConversionIQ™ importing...');
    try {
      const result = await importInspirationFromUrl(adAccountId, source);
      setUrlDraft('');
      setNotice(result.saved > 0 ? 'Imported 1 reference' : 'Already in your library');
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof UrlImportDisabledError
        ? `${err.message} Screenshot the ad and paste it above instead.`
        : err instanceof Error ? err.message : 'Could not import that URL');
    } finally {
      setIngesting(false);
      setIngestProgress(null);
    }
  }, [adAccountId, urlDraft, loadItems]);

  // ── Item actions ──────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleTogglePin = async (item: InspirationItem) => {
    try {
      await updateInspirationItem(item.id, { is_pinned: !item.is_pinned });
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} reference${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      const { deleted } = await deleteInspirationItems(ids);
      setSelectedIds(new Set());
      setNotice(`Deleted ${deleted} reference${deleted === 1 ? '' : 's'}`);
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handlePurge = async () => {
    if (!adAccountId) return;
    if (!confirm(
      `Remove ALL ${total} inspiration references for this ad account?\n\n` +
      'This permanently deletes every stored competitor image. It cannot be undone.'
    )) return;
    try {
      const { deleted } = await purgeInspirationLibrary(adAccountId);
      setSelectedIds(new Set());
      setNotice(`Purged ${deleted} reference${deleted === 1 ? '' : 's'}`);
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to purge');
    }
  };

  const handleView = async (item: InspirationItem) => {
    setLoadingImageId(item.id);
    try {
      const full = await fetchInspirationImage(item.id);
      setViewing({ data: full.image_data, mime: full.image_mime_type });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load image');
    } finally {
      setLoadingImageId(null);
    }
  };

  const openEdit = (item: InspirationItem) => {
    setEditing(item);
    setEditTags(item.tags.join(', '));
    setEditNotes(item.notes || '');
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    try {
      await updateInspirationItem(editing.id, {
        tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
        notes: editNotes.trim() || undefined,
      });
      setEditing(null);
      await loadItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const laneCounts = useMemo(() => {
    const counts: Partial<Record<IngestLane, number>> = {};
    for (const item of items) counts[item.ingest_lane] = (counts[item.ingest_lane] || 0) + 1;
    return counts;
  }, [items]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!adAccountId) {
    return (
      <div className="inspiration-page">
        <SEO title="Inspiration Library | Convertra" noindex />
        <div className="inspiration-empty">
          <h2>Select an ad account</h2>
          <p>Inspiration references are saved per ad account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="inspiration-page">
      <SEO title="Inspiration Library | Convertra" noindex />

      {/* The provenance statement is the first thing on the page, deliberately. Everything
          below it is unproven outside material and must never read as a proven winner. */}
      <div className="inspiration-preamble">
        <div className="inspiration-preamble-icon" aria-hidden="true">◇</div>
        <div>
          <strong>External inspiration — unproven for this account.</strong>
          <p>
            Competitor and market creative you have collected. None of it has conversion data
            for your account; how long an ad has been running is the only proof signal available.
            CreativeIQ™ uses these to steer visual construction, and is told explicitly not to
            treat their angles as validated. Your own winning ads live in the{' '}
            <a href="/swipe-library">Swipe Library</a>.
          </p>
        </div>
      </div>

      <div
        ref={dropZoneRef}
        tabIndex={0}
        className={`inspiration-dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        aria-label="Drop or paste competitor ad screenshots here"
      >
        {ingesting ? (
          <Loading size="small" message={ingestProgress || 'ConversionIQ™ processing...'} />
        ) : (
          <>
            <span className="inspiration-dropzone-title">Drop screenshots here, or click to focus and paste</span>
            <span className="inspiration-dropzone-hint">
              PNG, JPEG, WEBP, GIF or a PDF deck · up to {MAX_FILES_PER_UPLOAD} at a time
            </span>
            <button
              type="button"
              className="inspiration-upload-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload files
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={[...ACCEPTED_MIME_TYPES, 'application/pdf'].join(',')}
          multiple
          onChange={handleFilePick}
          style={{ display: 'none' }}
        />
      </div>

      <div className="inspiration-url-row">
        <input
          type="url"
          className="inspiration-url-input"
          placeholder="Or paste a direct image URL (https://...)"
          value={urlDraft}
          onChange={e => setUrlDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleUrlImport(); } }}
        />
        <button
          type="button"
          className="inspiration-url-btn"
          onClick={handleUrlImport}
          disabled={ingesting || !urlDraft.trim()}
        >
          Import
        </button>
      </div>

      {error && <div className="inspiration-banner is-error" role="alert">{error}</div>}
      {notice && <div className="inspiration-banner is-notice">{notice}</div>}

      <div className="inspiration-filter-bar">
        <div className="inspiration-lane-tabs">
          {LANE_FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              className={`inspiration-lane-tab ${laneFilter === f.value ? 'active' : ''}`}
              onClick={() => setLaneFilter(f.value)}
            >
              {f.label}
              {f.value !== 'all' && laneCounts[f.value as IngestLane] ? (
                <span className="inspiration-lane-count">{laneCounts[f.value as IngestLane]}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="inspiration-filter-controls">
          <input
            type="search"
            className="inspiration-search"
            placeholder="Search advertiser, copy, notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select
            className="inspiration-sort"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            aria-label="Sort references"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="longevity">Longest running</option>
          </select>
        </div>
      </div>

      <div className="inspiration-count-row">
        <span className={total >= MAX_INSPIRATION_ITEMS ? 'is-full' : ''}>
          {total} / {MAX_INSPIRATION_ITEMS} references
          {total >= MAX_INSPIRATION_ITEMS && ' — delete some to add more'}
        </span>
        {total > 0 && (
          <button type="button" className="inspiration-purge-btn" onClick={handlePurge}>
            Purge all
          </button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="inspiration-bulk-bar">
          <span>{selectedIds.size} selected</span>
          <button type="button" onClick={() => handleDelete(Array.from(selectedIds))}>
            Delete selected
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      {loading ? (
        <Loading size="large" message="ConversionIQ™ loading inspiration..." />
      ) : items.length === 0 ? (
        <div className="inspiration-empty">
          <h2>No references yet</h2>
          <p>
            Paste or drop screenshots of competitor ads above, or save them with their image
            from the Ad Library browser in CreativeIQ™.
          </p>
        </div>
      ) : (
        <div className="inspiration-grid">
          {items.map(item => {
            const laneUi = LANE_UI[item.ingest_lane];
            const lowRes = (item.quality_score ?? 0) < 60;
            return (
              <div
                key={item.id}
                className={`inspiration-card ${selectedIds.has(item.id) ? 'is-selected' : ''}`}
              >
                <div className="inspiration-card-head">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    aria-label={`Select reference from ${item.advertiser_name || 'unknown advertiser'}`}
                  />
                  <span className="inspiration-chip is-external" title={REFERENCE_UI.external.hint}>
                    {REFERENCE_UI.external.badge}
                  </span>
                  <span className="inspiration-lane" title={`Captured via ${laneUi.label}`}>
                    <span aria-hidden="true">{laneUi.icon}</span> {laneUi.label}
                  </span>
                  {item.is_pinned && <span className="inspiration-pin" title="Pinned">📌</span>}
                </div>

                <button
                  type="button"
                  className="inspiration-thumb"
                  onClick={() => handleView(item)}
                  disabled={loadingImageId === item.id}
                  aria-label="View full size"
                >
                  {item.image_thumbnail ? (
                    <img
                      src={`data:${item.image_mime_type};base64,${item.image_thumbnail}`}
                      alt={item.ad_copy_snippet?.slice(0, 80) || 'Competitor ad creative'}
                      loading="lazy"
                    />
                  ) : (
                    <span className="inspiration-thumb-missing">No preview</span>
                  )}
                  {lowRes && <span className="inspiration-lowres">Low-res capture</span>}
                </button>

                <div className="inspiration-card-body">
                  <div className="inspiration-advertiser">
                    {item.advertiser_name || 'Unknown advertiser'}
                  </div>
                  <div className="inspiration-longevity">{longevityLabel(item.days_running)}</div>
                  {item.ad_copy_snippet && (
                    <p className="inspiration-snippet">{item.ad_copy_snippet.slice(0, 140)}</p>
                  )}
                  {item.tags.length > 0 && (
                    <div className="inspiration-tags">
                      {item.tags.map(tag => <span key={tag} className="inspiration-tag">{tag}</span>)}
                    </div>
                  )}
                  {item.notes && <p className="inspiration-notes">{item.notes}</p>}
                </div>

                <div className="inspiration-card-actions">
                  <button type="button" onClick={() => handleTogglePin(item)}>
                    {item.is_pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button type="button" onClick={() => openEdit(item)}>Edit</button>
                  <button type="button" onClick={() => handleDelete([item.id])}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="inspiration-modal-overlay" onClick={() => setEditing(null)}>
          <div className="inspiration-modal" onClick={e => e.stopPropagation()}>
            <h3>Edit reference</h3>
            <label>
              <span>Tags (comma separated)</span>
              <input value={editTags} onChange={e => setEditTags(e.target.value)} />
            </label>
            <label>
              <span>Notes</span>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={4} />
            </label>
            <div className="inspiration-modal-actions">
              <button type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="is-primary" onClick={handleSaveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="inspiration-modal-overlay" onClick={() => setViewing(null)}>
          <img
            className="inspiration-lightbox"
            src={`data:${viewing.mime};base64,${viewing.data}`}
            alt="Competitor ad creative, full size"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default InspirationLibrary;
