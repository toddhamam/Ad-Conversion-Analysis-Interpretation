import { memo, useState } from 'react';
import { RefreshCw, Loader, AlertTriangle } from 'lucide-react';
import type { GeneratedImageResult } from '../services/openaiApi';
import CustomDirectionField from './CustomDirectionField';
import {
  EMPTY_CUSTOM_DIRECTION,
  draftToInput,
  type CustomDirectionDraft,
  type CustomDirectionInput,
  type CustomDirectionMode,
} from '../lib/customDirection';

// Blitz image-review step: review the small image pool and reroll any single image BEFORE it
// gets paired across the copy matrix. The pool is intentionally smaller than the copy set so the
// Angle × Hook copy stays the test variable — these images are shared across the copy variants.
// All batch state/handlers live in AdGenerator; the one exception is the per-slot brief drafts
// below, which are ephemeral view state with no meaning outside this step. Uses the .blitz-img-*
// classes in AdGenerator.css (global stylesheet).
interface BlitzImageReviewPanelProps {
  images: (GeneratedImageResult | null)[];   // slot-aligned; null = that slot's render failed
  slotLabels: string[];       // what each pool image represents (e.g. an angle/hook), per strategy
  adCount: number;            // how many ads this becomes (one per kept copy cell)
  regeneratingIndex: number | null;
  imageError?: string;
  /** A per-slot brief is optional; omitted, the reroll runs on account intelligence alone. */
  onRegenerate: (index: number, customDirection?: CustomDirectionInput) => void;
  onBack: () => void;
  onPublish: () => void;
}

/** Per-slot brief drafts, keyed by slot index. Deliberately NOT lifted into AdGenerator: a note
 *  describes one reroll of one image, is never persisted, and dies with this step — so it is
 *  local view state, not part of the batch session. */
type SlotBriefs = Record<number, CustomDirectionDraft>;

/** DERIVED from the image's `customDirectionMode` — nothing about the badge is stored. */
const BRIEF_BADGE: Record<CustomDirectionMode, string> = {
  blend: 'Your brief + ConversionIQ™',
  override: 'Your brief only',
};

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
  const [briefs, setBriefs] = useState<SlotBriefs>({});
  const briefFor = (index: number) => briefs[index] ?? EMPTY_CUSTOM_DIRECTION;

  const busy = regeneratingIndex !== null;
  const count = images.length;
  const failedCount = images.filter(img => img === null).length;
  const readyCount = count - failedCount;
  const hasFailedSlot = failedCount > 0;

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

      {hasFailedSlot && readyCount > 0 && (
        <div className="blitz-img-error">
          <AlertTriangle size={16} strokeWidth={1.5} />
          <span>
            {failedCount} image{failedCount === 1 ? '' : 's'} failed to render. Regenerate
            {failedCount === 1 ? ' it' : ' them'} now, or publish anyway — ads with a failed image are
            skipped and the rest still go to Meta. The batch is kept, so you can fix and republish later.
          </span>
        </div>
      )}

      <div className="blitz-img-grid">
        {images.map((image, index) => {
          const rerolling = regeneratingIndex === index;
          const brief = briefFor(index);
          const slotDirection = draftToInput(brief);
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
                {/* An image built from a brief must not read as one derived from proven winners —
                    especially in override mode, where no reference informed it at all. */}
                {image?.customDirectionMode && (
                  <span className="blitz-img-brief-badge">{BRIEF_BADGE[image.customDirectionMode]}</span>
                )}
              </div>
              <button
                type="button"
                className="blitz-img-reroll"
                onClick={() => onRegenerate(index, slotDirection)}
                disabled={busy}
                title={
                  slotDirection
                    ? 'Generate a fresh image for this slot using your brief'
                    : 'Generate a fresh image for this slot'
                }
              >
                {rerolling ? (
                  <Loader size={14} strokeWidth={1.5} className="spinning" />
                ) : (
                  <RefreshCw size={14} strokeWidth={1.5} />
                )}
                {rerolling ? 'Rerolling...' : slotDirection ? 'Regenerate with brief' : 'Regenerate'}
              </button>
              <CustomDirectionField
                variant="inline"
                draft={brief}
                onChange={next => setBriefs(prev => ({ ...prev, [index]: next }))}
                disabled={busy}
                placeholder="What should this image show instead?"
              />
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
          disabled={busy || readyCount === 0}
          title={
            readyCount === 0
              ? 'Generate at least one image before publishing'
              : hasFailedSlot
                ? 'Ads whose image failed to render are skipped — the rest are published'
                : undefined
          }
        >
          <span className="generate-icon">🚀</span>
          {hasFailedSlot
            ? 'Publish available ads → Publisher'
            : `Publish ${adCount} Ad${adCount === 1 ? '' : 's'} → Publisher`}
        </button>
      </div>
    </section>
  );
}

export default memo(BlitzImageReviewPanel);
