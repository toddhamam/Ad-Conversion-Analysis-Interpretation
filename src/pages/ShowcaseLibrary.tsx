import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAdAccount } from '../contexts/AdAccountContext';
import {
  fetchShowcaseAssets,
  saveShowcaseAssets,
  updateShowcaseAsset,
  deleteShowcaseAssets,
  purgeShowcaseLibrary,
  buildShowcasePayload,
  buildFinishedCreativePayload,
  ShowcaseLibraryFullError,
  MAX_SHOWCASE_ASSETS,
  type ShowcaseAsset,
  type ShowcaseSort,
  EMPTY_SOURCE_DRAFT,
  EMPTY_FINISHED_DRAFT,
  type ShowcaseAssetKind,
  type SourceDraft,
  type FinishedDraft,
} from '../services/showcaseLibraryApi';
import { isAcceptedImageType, ACCEPTED_MIME_TYPES } from '../lib/imageNormalize';
import SEO from '../components/SEO';
import Loading from '../components/Loading';
import AddShowcaseAssetPanel from '../components/AddShowcaseAssetPanel';
import './ShowcaseLibrary.css';

const SORT_OPTIONS: Array<{ value: ShowcaseSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'client', label: 'Client A–Z' },
];

const ACCEPT_ATTR = ACCEPTED_MIME_TYPES.join(',');

const ShowcaseLibrary = () => {
  const { currentAccount } = useAdAccount();
  const adAccountId = currentAccount?.ad_account_id;

  const [assets, setAssets] = useState<ShowcaseAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<ShowcaseSort>('newest');

  const [draft, setDraft] = useState<SourceDraft>(EMPTY_SOURCE_DRAFT);
  const [uploading, setUploading] = useState(false);
  /**
   * Which kind of thing the operator is adding.
   *
   * Two panels rather than one with a toggle, because they ingest different THINGS: a source
   * screenshot needs a client's name and may carry a "before"; a finished creative is whole and
   * has neither. One form with half its fields greyed out would be lying about that.
   */
  const [addKind, setAddKind] = useState<ShowcaseAssetKind>('source');
  const [finishedDraft, setFinishedDraft] = useState<FinishedDraft>(EMPTY_FINISHED_DRAFT);

  const [editing, setEditing] = useState<ShowcaseAsset | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editProjectUrl, setEditProjectUrl] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editConsent, setEditConsent] = useState(false);


  // Debounced search — same 300ms as the other library pages.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const load = useCallback(async () => {
    if (!adAccountId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchShowcaseAssets(adAccountId, {
        search: debouncedSearch || undefined,
        sort: sortBy,
      });
      setAssets(result.items);
      setTotal(result.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load your showcase library.');
    } finally {
      setLoading(false);
    }
  }, [adAccountId, debouncedSearch, sortBy]);

  useEffect(() => { load(); }, [load]);

  const isFull = total >= MAX_SHOWCASE_ASSETS;

  const handleUpload = async () => {
    if (!adAccountId || !draft.hero) return;
    setUploading(true);
    setError(null);
    setNotice(null);

    try {
      const payload = await buildShowcasePayload(draft.hero, draft.before, {
        client_name: draft.clientName,
        project_url: draft.projectUrl.trim() || undefined,
        client_consent: draft.consent,
        device_hint: draft.deviceHint,
      });

      if (!payload) {
        setError('That image could not be read. Try a different file.');
        return;
      }

      const result = await saveShowcaseAssets(adAccountId, [payload]);

      if (result.saved > 0) {
        const hadBefore = !!payload.before_image_data;
        setNotice(
          hadBefore
            ? `Saved ${payload.client_name} with a before/after pair.`
            : `Saved ${payload.client_name}. Add a "before" later to unlock the before/after ad.`
        );
        setDraft(EMPTY_SOURCE_DRAFT);
        await load();
      } else if (result.duplicates > 0) {
        setNotice('That screenshot is already in your library.');
      } else {
        setError('Nothing was saved. Please try again.');
      }
    } catch (err: unknown) {
      if (err instanceof ShowcaseLibraryFullError) setError(err.message);
      else setError(err instanceof Error ? err.message : 'Could not save that asset.');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadFinished = async () => {
    if (!adAccountId || !finishedDraft.file) return;
    setUploading(true);
    setError(null);
    setNotice(null);

    try {
      const payload = await buildFinishedCreativePayload(finishedDraft.file, {
        label: finishedDraft.label,
      });
      if (!payload) {
        setError('That image could not be read. Try a different file.');
        return;
      }

      const result = await saveShowcaseAssets(adAccountId, [payload]);
      if (result.saved > 0) {
        setNotice('Saved. Use the “Use As-Is” template to publish it untouched.');
        setFinishedDraft(EMPTY_FINISHED_DRAFT);
        await load();
      } else if (result.duplicates > 0) {
        setNotice('That creative is already in your library.');
      } else {
        setError('Nothing was saved. Please try again.');
      }
    } catch (err: unknown) {
      if (err instanceof ShowcaseLibraryFullError) setError(err.message);
      else setError(err instanceof Error ? err.message : 'Could not save that creative.');
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (asset: ShowcaseAsset) => {
    setEditing(asset);
    setEditClientName(asset.client_name || '');
    setEditProjectUrl(asset.project_url || '');
    setEditNotes(asset.notes || '');
    setEditConsent(asset.client_consent);
  };

  const saveEdit = async () => {
    if (!editing || !editClientName.trim()) return;
    try {
      const updated = await updateShowcaseAsset(editing.id, {
        client_name: editClientName.trim(),
        project_url: editProjectUrl.trim() || null,
        notes: editNotes.trim() || null,
        client_consent: editConsent,
      });
      setAssets(prev => prev.map(a => (a.id === updated.id ? updated : a)));
      setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save those changes.');
    }
  };

  /** Attach a "before" to an asset that has only a hero — the normal follow-up edit. */
  const attachBefore = async (asset: ShowcaseAsset, file: File) => {
    if (!isAcceptedImageType(file.type)) {
      setError('That is not an image we can read. Use PNG, JPEG, WebP or GIF.');
      return;
    }
    setError(null);
    try {
      // Reuse the ingest path so the "before" gets the same showcase-profile treatment as a
      // hero: same resolution ceiling, same codec choice, same smoothing.
      const staged = await buildShowcasePayload(file, null, { client_name: asset.client_name || 'Client' });
      if (!staged) {
        setError('That image could not be read.');
        return;
      }
      const updated = await updateShowcaseAsset(asset.id, {
        before_image_data: staged.image_data,
        before_image_thumbnail: staged.image_thumbnail,
        before_image_mime_type: staged.image_mime_type,
        before_image_width: staged.image_width,
        before_image_height: staged.image_height,
      });
      setAssets(prev => prev.map(a => (a.id === updated.id ? updated : a)));
      setNotice(`Added a "before" for ${updated.client_name}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not attach that image.');
    }
  };

  const removeAsset = async (asset: ShowcaseAsset) => {
    if (!confirm(`Delete the showcase asset for ${asset.client_name}? This cannot be undone.`)) return;
    try {
      await deleteShowcaseAssets([asset.id]);
      setAssets(prev => prev.filter(a => a.id !== asset.id));
      setTotal(t => Math.max(0, t - 1));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete that asset.');
    }
  };

  const purgeAll = async () => {
    if (!adAccountId) return;
    if (!confirm(`Delete ALL ${total} showcase assets for this ad account? This cannot be undone.`)) return;
    if (!confirm('This permanently removes every client screenshot in this library. Continue?')) return;
    try {
      const { deleted } = await purgeShowcaseLibrary(adAccountId);
      setNotice(`Deleted ${deleted} asset${deleted === 1 ? '' : 's'}.`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not purge the library.');
    }
  };

  const pairCount = useMemo(
    () => assets.filter(a => a.before_image_thumbnail).length,
    [assets]
  );

  if (!adAccountId) {
    return (
      <div className="showcase-page">
        <SEO title="Showcase Library | Convertra" noindex />
        <div className="showcase-empty">
          <h2>Select an ad account</h2>
          <p>Showcase assets are saved per ad account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="showcase-page">
      <SEO title="Showcase Library | Convertra" noindex />

      <header className="showcase-header">
        <div>
          <h1>Showcase Library</h1>
          <p className="showcase-subtitle">
            Real client work — website builds and before/afters — composited into ads exactly as
            you captured them. Never redrawn by AI.
          </p>
        </div>
        <div className="showcase-counts">
          <span className={isFull ? 'count-full' : ''}>{total} / {MAX_SHOWCASE_ASSETS}</span>
          <span className="count-pairs">{pairCount} with a before</span>
        </div>
      </header>

      {error && <div className="showcase-banner error">{error}</div>}
      {notice && <div className="showcase-banner notice">{notice}</div>}

      <AddShowcaseAssetPanel
        kind={addKind}
        onKindChange={setAddKind}
        source={draft}
        onSourceChange={patch => setDraft(d => ({ ...d, ...patch }))}
        onSubmitSource={handleUpload}
        finished={finishedDraft}
        onFinishedChange={patch => setFinishedDraft(d => ({ ...d, ...patch }))}
        onSubmitFinished={handleUploadFinished}
        onRejectFile={setError}
        uploading={uploading}
        isFull={isFull}
        limit={MAX_SHOWCASE_ASSETS}
      />

      <section className="showcase-toolbar">
        <input
          type="search" className="showcase-search" placeholder="Search clients, URLs, notes…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value as ShowcaseSort)}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {total > 0 && (
          <button className="btn-danger-ghost" onClick={purgeAll}>Clear library</button>
        )}
      </section>

      {loading ? (
        <Loading size="medium" message="ConversionIQ™ loading your showcase..." />
      ) : assets.length === 0 ? (
        <div className="showcase-empty">
          <h2>No client work yet</h2>
          <p>
            Add a screenshot of a site you built. Add the old site too and you can run a
            before/after ad — the shape that carries your proof best.
          </p>
        </div>
      ) : (
        <div className="showcase-grid">
          {assets.map(asset => (
            <ShowcaseCard
              key={asset.id}
              asset={asset}
              onEdit={() => openEdit(asset)}
              onDelete={() => removeAsset(asset)}
              onAttachBefore={file => attachBefore(asset, file)}
            />
          ))}
        </div>
      )}

      {editing && (
        <div className="showcase-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="showcase-modal" onClick={e => e.stopPropagation()}>
            <h3>Edit {editing.client_name}</h3>
            <label className="upload-field">
              <span className="slot-label">Client</span>
              <input value={editClientName} onChange={e => setEditClientName(e.target.value)} />
            </label>
            <label className="upload-field">
              <span className="slot-label">Site URL</span>
              <input value={editProjectUrl} onChange={e => setEditProjectUrl(e.target.value)} />
            </label>
            <label className="upload-field">
              <span className="slot-label">Notes</span>
              <textarea rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
            </label>
            <label className="upload-consent">
              <input type="checkbox" checked={editConsent} onChange={e => setEditConsent(e.target.checked)} />
              <span>Client is happy for their site to appear in ads</span>
            </label>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={!editClientName.trim()} onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Card ───────────────────────────────────────────────────────────────────

function ShowcaseCard({
  asset, onEdit, onDelete, onAttachBefore,
}: {
  asset: ShowcaseAsset;
  onEdit: () => void;
  onDelete: () => void;
  onAttachBefore: (file: File) => void;
}) {
  const attachRef = useRef<HTMLInputElement>(null);
  const hasBefore = !!asset.before_image_thumbnail;
  const isFinished = asset.asset_kind === 'finished';

  return (
    <article className="showcase-card">
      <div className="card-thumbs">
        {hasBefore && (
          <figure className="card-thumb is-before">
            <img
              src={`data:${asset.before_image_mime_type || 'image/png'};base64,${asset.before_image_thumbnail}`}
              alt={`${asset.client_name || "Asset"} before`} loading="lazy"
            />
            <figcaption>Before</figcaption>
          </figure>
        )}
        <figure className="card-thumb">
          {asset.image_thumbnail ? (
            <img
              src={`data:${asset.image_mime_type};base64,${asset.image_thumbnail}`}
              alt={asset.client_name || "Showcase asset"} loading="lazy"
            />
          ) : (
            <div className="thumb-missing">No preview</div>
          )}
          {hasBefore && <figcaption>After</figcaption>}
        </figure>
      </div>

      <div className="card-body">
        <h3>{asset.client_name || 'Untitled creative'}</h3>
        {asset.project_url && <p className="card-url">{asset.project_url}</p>}
        <div className="card-chips">
          {isFinished ? (
            <span className="chip chip-finished">Finished · publishes untouched</span>
          ) : (
            <>
              <span className={`chip ${hasBefore ? 'chip-pair' : 'chip-solo'}`}>
                {hasBefore ? 'Before / after' : 'Hero only'}
              </span>
              <span className="chip chip-device">{asset.device_hint}</span>
            </>
          )}
          {asset.client_consent && <span className="chip chip-consent">Consent ✓</span>}
        </div>
      </div>

      <div className="card-actions">
        {!hasBefore && !isFinished && (
          <>
            <button className="btn-ghost" onClick={() => attachRef.current?.click()}>
              Add “before”
            </button>
            <input
              ref={attachRef} type="file" accept={ACCEPT_ATTR} hidden
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) onAttachBefore(file);
                e.target.value = '';
              }}
            />
          </>
        )}
        <button className="btn-ghost" onClick={onEdit}>Edit</button>
        <button className="btn-danger-ghost" onClick={onDelete}>Delete</button>
      </div>
    </article>
  );
}

export default ShowcaseLibrary;
