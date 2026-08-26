import { useState, useEffect, useRef } from 'react';
import { renderShowcase, type ShowcaseRenderConfig } from '../services/showcaseCanvas';
import './ShowcasePreview.css';

interface Props {
  /** Null while the operator has not chosen enough assets to compose anything. */
  config: ShowcaseRenderConfig | null;
  /** What to say when there is nothing to render yet. */
  emptyHint: string;
}

/**
 * The composite, rendered live as the operator configures it.
 *
 * WHY THIS EXISTS. Everything else in CreativeIQ costs a credit and a minute, so it is configured
 * blind and reviewed after. A showcase composite costs NEITHER — the compositor is pure canvas
 * work in the browser — so making the operator generate first just to see what a template does
 * is a cost with no cause. It also turns questions that are otherwise unanswerable ("will the
 * screenshot be legible?", "does this crop cut my design?") into something you can simply look at.
 *
 * Debounced because the inputs it watches are text fields; without it every keystroke in the
 * caption box would decode both source images again.
 */
const PREVIEW_DEBOUNCE_MS = 250;

const ShowcasePreview = ({ config, emptyHint }: Props) => {
  const [result, setResult] = useState<{ url: string | null; failed: boolean }>(
    { url: null, failed: false }
  );
  const [rendering, setRendering] = useState(false);
  /** Guards against an earlier, slower render landing after a later one. */
  const runRef = useRef(0);

  useEffect(() => {
    if (!config) return;

    const run = ++runRef.current;
    // Everything that sets state lives inside the timeout. Setting it synchronously here would
    // trigger a cascading render, and the previous frame is worth keeping on screen anyway —
    // blanking the preview between keystrokes reads as a flicker, not as progress.
    const timer = setTimeout(async () => {
      setRendering(true);
      const rendered = await renderShowcase(config);
      // A stale render must not overwrite a newer one.
      if (run !== runRef.current) return;
      setResult({ url: rendered?.imageUrl ?? null, failed: !rendered });
      setRendering(false);
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `config` is memoized by the caller, so identity is a sound dependency. It was briefly
    // compared by a JSON.stringify with images reduced to their LENGTHS — a hand-rolled
    // deep-compare that would silently skip a re-render for two different images encoding to
    // the same number of characters.
  }, [config]);

  // Derived, not stored: with no config there is nothing to show, and clearing state to say so
  // would mean another synchronous setState.
  const shown = config ? result.url : null;

  return (
    <div className="showcase-preview">
      <div className="preview-header">
        <span className="preview-label">Live preview</span>
        {rendering && <span className="preview-status">rendering…</span>}
        {!rendering && shown && <span className="preview-status">exact output · 0 credits</span>}
      </div>

      <div className="preview-stage">
        {shown ? (
          <img src={shown} alt="Showcase composite preview" />
        ) : (
          <p className="preview-empty">
            {config && result.failed
              ? 'That combination could not be rendered — try another template.'
              : emptyHint}
          </p>
        )}
      </div>
    </div>
  );
};

export default ShowcasePreview;
