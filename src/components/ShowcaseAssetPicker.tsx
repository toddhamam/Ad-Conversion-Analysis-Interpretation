import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchShowcaseAssets,
  type ShowcaseAsset,
} from '../services/showcaseLibraryApi';
import { SHOWCASE_TEMPLATES, type ShowcaseTemplate } from '../lib/showcaseLayout';
import Loading from './Loading';
import './ShowcaseAssetPicker.css';

interface Props {
  adAccountId: string;
  template: ShowcaseTemplate;
  /** Currently selected ids, so re-opening the picker shows the existing choice. */
  selectedIds: string[];
  onConfirm: (assets: ShowcaseAsset[]) => void;
  onClose: () => void;
}

/**
 * Pick showcase assets for a composite.
 *
 * The picker knows the template's arity, so a before/after template only ever offers assets
 * that actually have a "before" — choosing one that doesn't would produce a half-empty split
 * at render time, which looks like a bug rather than a missing upload.
 */
const ShowcaseAssetPicker = ({ adAccountId, template, selectedIds, onConfirm, onClose }: Props) => {
  const [assets, setAssets] = useState<ShowcaseAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set(selectedIds));

  const spec = SHOWCASE_TEMPLATES[template];
  const arity = spec.arity;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await fetchShowcaseAssets(adAccountId, { sort: 'newest' });
        if (!cancelled) setAssets(result.items);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your showcase library.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adAccountId]);

  /**
   * Assets this template can actually use.
   *
   * Two filters, both structural: the KIND (a framing template must never offer a finished
   * creative to wrap in a second frame, and `as_is` must never offer a raw screenshot it would
   * publish unframed), and the "before" a split cannot render without.
   */
  const eligible = useMemo(
    () => assets.filter(a =>
      a.asset_kind === spec.accepts && (!arity.requiresBefore || !!a.before_image_thumbnail)
    ),
    [assets, spec.accepts, arity.requiresBefore]
  );

  const hiddenCount = assets.length - eligible.length;

  const toggle = (id: string) => {
    setChosen(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Single-asset templates replace rather than accumulate — an operator clicking a
        // second card means "that one instead", not "both".
        if (arity.max === 1) next.clear();
        else if (next.size >= arity.max) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const confirm = () => {
    const byId = new Map(eligible.map(a => [a.id, a]));
    onConfirm([...chosen].map(id => byId.get(id)).filter((a): a is ShowcaseAsset => !!a));
  };

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker-modal" onClick={e => e.stopPropagation()}>
        <header className="picker-header">
          <div>
            <h2>Choose client work</h2>
            <p>
              {spec.label} uses{' '}
              {arity.min === arity.max
                ? `${arity.max} ${arity.max === 1 ? 'asset' : 'assets'}`
                : `${arity.min}–${arity.max} assets`}
              {arity.requiresBefore && ' that have a "before" image'}.
            </p>
          </div>
          <button className="picker-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {error && <div className="picker-error">{error}</div>}

        {loading ? (
          <Loading size="medium" message="ConversionIQ™ loading your showcase..." />
        ) : eligible.length === 0 ? (
          <div className="picker-empty">
            <h3>
              {spec.accepts === 'finished' ? 'No finished creatives yet'
                : arity.requiresBefore ? 'No before/after pairs yet'
                : 'No client work yet'}
            </h3>
            <p>
              {spec.accepts === 'finished'
                ? 'Upload an already-designed creative and it will appear here, ready to publish untouched.'
                : arity.requiresBefore
                  ? 'Add a "before" image to one of your showcase assets and it will appear here.'
                  : 'Add a screenshot of a site you built and it will appear here.'}
            </p>
            <Link to="/showcase" className="picker-cta" onClick={onClose}>
              Open the Showcase Library
            </Link>
          </div>
        ) : (
          <>
            <div className="picker-grid">
              {eligible.map(asset => {
                const isChosen = chosen.has(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`picker-card ${isChosen ? 'is-chosen' : ''}`}
                    onClick={() => toggle(asset.id)}
                    aria-pressed={isChosen}
                  >
                    <span className="picker-thumbs">
                      {asset.before_image_thumbnail && (
                        <img
                          src={`data:${asset.before_image_mime_type || 'image/png'};base64,${asset.before_image_thumbnail}`}
                          alt="" loading="lazy"
                        />
                      )}
                      {asset.image_thumbnail && (
                        <img
                          src={`data:${asset.image_mime_type};base64,${asset.image_thumbnail}`}
                          alt="" loading="lazy"
                        />
                      )}
                    </span>
                    <span className="picker-name">{asset.client_name || 'Untitled creative'}</span>
                    {asset.project_url && <span className="picker-url">{asset.project_url}</span>}
                  </button>
                );
              })}
            </div>

            {hiddenCount > 0 && (
              <p className="picker-hidden-note">
                {hiddenCount} asset{hiddenCount === 1 ? '' : 's'} hidden — this template needs
                {spec.accepts === 'finished' ? ' an already-designed creative' : arity.requiresBefore ? ' a “before” image' : ' a raw screenshot'}.
              </p>
            )}
          </>
        )}

        <footer className="picker-footer">
          <span className="picker-count">
            {chosen.size} / {arity.max} selected
            {chosen.size > 0 && chosen.size < arity.min && ` — needs at least ${arity.min}`}
          </span>
          <div className="picker-actions">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={chosen.size < arity.min} onClick={confirm}>
              Use {chosen.size === 1 ? 'this' : 'these'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ShowcaseAssetPicker;
