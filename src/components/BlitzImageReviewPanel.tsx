import { memo } from 'react';
import { RefreshCw, Loader, AlertTriangle } from 'lucide-react';
import type { GeneratedImageResult } from '../services/openaiApi';

// Blitz image-review step: review the small image pool and reroll any single image BEFORE it
// gets paired across the copy matrix. The pool is intentionally smaller than the copy set so the
// Angle × Hook copy stays the test variable — these images are shared across the copy variants.
// Presentational — all state/handlers live in AdGenerator. Uses the .blitz-img-* classes in
// AdGenerator.css (global stylesheet).
interface BlitzImageReviewPanelProps {
  images: (GeneratedImageResult | null)[];   // slot-aligned; null = that slot's render failed
  slotLabels: string[];       // what each pool image represents (e.g. an angle/hook), per strategy
  adCount: number;            // how many ads this becomes (one per kept copy cell)
  regeneratingIndex: number | null;
  imageError?: string;
  onRegenerate: (index: number) => void;
  onBack: () => void;
  onPublish: () => void;
}

function BlitzImageReviewPanel({
  images,
  slotLabels,
  adCount,
  regeneratingIndex,
  imageError,
  onRegenerate,
  onBack,
  onPublish,
}: BlitzImageReviewPanelProps) {
  const busy = regeneratingIndex !== null;
  const count = images.length;
  const hasFailedSlot = images.some(img => img === null);

  return (
    <section className="config-panel blitz-img-panel">
      <h3 className="config-title">
        Review Blitz Images — {count} image{count === 1 ? '' : 's'} → {adCount} ad{adCount === 1 ? '' : 's'}
      </h3>
      <p className="config-hint">
        {count === 1
          ? 'This single image is shared across every copy variant — a clean A/B test where the angle, hook and copy are the only things that change.'
          : `These ${count} images are spread across your ${adCount} copy variants. Reroll any that don't fit, then publish — the copy stays the variable under test.`}
      </p>

      {imageError && (
        <div className="blitz-img-error">
          <AlertTriangle size={16} strokeWidth={1.5} />
          <span>{imageError}</span>
        </div>
      )}

      <div className="blitz-img-grid">
        {images.map((image, index) => {
          const rerolling = regeneratingIndex === index;
          return (
            <div key={index} className="blitz-img-card">
              <div className="blitz-img-frame">
                {rerolling && (
                  <div className="blitz-img-overlay">
                    <Loader size={28} strokeWidth={1.5} className="spinning" />
                    <span>Rerolling...</span>
                  </div>
                )}
                {image ? (
                  <img src={image.imageUrl} alt={slotLabels[index] || `Blitz image ${index + 1}`} loading="lazy" />
                ) : (
                  <div className="blitz-img-failed">
                    <AlertTriangle size={22} strokeWidth={1.5} />
                    <span>Render failed — regenerate</span>
                  </div>
                )}
                <span className="blitz-img-index">{slotLabels[index] || `Image ${index + 1}`}</span>
              </div>
              <button
                type="button"
                className="blitz-img-reroll"
                onClick={() => onRegenerate(index)}
                disabled={busy}
                title="Generate a fresh image for this slot"
              >
                {rerolling ? (
                  <Loader size={14} strokeWidth={1.5} className="spinning" />
                ) : (
                  <RefreshCw size={14} strokeWidth={1.5} />
                )}
                {rerolling ? 'Rerolling...' : 'Regenerate'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid-review-actions">
        <button
          type="button"
          className="generate-btn step-btn grid-back-btn"
          onClick={onBack}
          disabled={busy}
        >
          ← Back to copy
        </button>
        <button
          type="button"
          className="generate-btn step-btn"
          onClick={onPublish}
          disabled={busy || count === 0 || hasFailedSlot}
          title={hasFailedSlot ? 'Regenerate the failed image before publishing' : undefined}
        >
          <span className="generate-icon">🚀</span>
          Publish {adCount} Ad{adCount === 1 ? '' : 's'} → Publisher
        </button>
      </div>
    </section>
  );
}

export default memo(BlitzImageReviewPanel);
