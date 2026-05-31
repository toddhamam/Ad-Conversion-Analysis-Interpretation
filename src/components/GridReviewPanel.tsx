import { memo } from 'react';
import { CONCEPT_ANGLES, type GridCell } from '../services/openaiApi';
import { HOOK_LABELS } from '../lib/axisTags';

// Grid-review step: prune + per-cell reroll the Angle × Hook copy matrix before
// spending image credits. Presentational — all state/handlers live in AdGenerator.
// Uses the .grid-* classes defined in AdGenerator.css (global stylesheet).
interface GridReviewPanelProps {
  cells: GridCell[];
  keptCellIds: Set<string>;
  regeneratingCellId: string | null;
  isGenerating: boolean;
  generationProgress: string;
  onToggleKeep: (id: string) => void;
  onReroll: (id: string) => void;
  onBack: () => void;
  onGenerate: () => void;
}

function GridReviewPanel({
  cells,
  keptCellIds,
  regeneratingCellId,
  isGenerating,
  generationProgress,
  onToggleKeep,
  onReroll,
  onBack,
  onGenerate,
}: GridReviewPanelProps) {
  const keptCount = keptCellIds.size;

  return (
    <section className="config-panel grid-review-panel">
      <h3 className="config-title">Review Blitz Test — {keptCount}/{cells.length} kept</h3>
      <p className="config-hint">
        Each card is one Angle × Hook creative anchored to your core promise. Deselect the ones that don't fit,
        reroll any you want fresh, then generate images for the ones you keep.
      </p>
      <div className="grid-review-list">
        {cells.map(cell => {
          const kept = keptCellIds.has(cell.id);
          const rerolling = regeneratingCellId === cell.id;
          return (
            <div key={cell.id} className={`grid-cell-card ${kept ? 'kept' : 'pruned'}`}>
              {rerolling && (
                <div className="copy-regenerating-overlay">
                  <span className="spinner"></span>
                  <span>Rerolling...</span>
                </div>
              )}
              <div className="grid-cell-tags">
                <span className="grid-cell-angle">{CONCEPT_ANGLES[cell.angle].name}</span>
                <span className="hook-chip">{HOOK_LABELS[cell.hook]}</span>
              </div>
              <div className="grid-cell-headline">{cell.headline}</div>
              <div className="grid-cell-body">{cell.body}</div>
              <div className="grid-cell-cta">{cell.cta}</div>
              <div className="grid-cell-actions">
                <button
                  type="button"
                  className={`grid-keep-btn ${kept ? 'active' : ''}`}
                  onClick={() => onToggleKeep(cell.id)}
                >
                  {kept ? '✓ Keep' : 'Skipped'}
                </button>
                <button
                  type="button"
                  className="grid-reroll-btn"
                  onClick={() => onReroll(cell.id)}
                  disabled={regeneratingCellId !== null || isGenerating}
                  title="Generate a fresh creative for this angle + hook"
                >
                  ↻ Reroll
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid-review-actions">
        <button
          type="button"
          className="generate-btn step-btn grid-back-btn"
          onClick={onBack}
          disabled={isGenerating}
        >
          ← Back to config
        </button>
        <button
          type="button"
          className="generate-btn step-btn"
          onClick={onGenerate}
          disabled={isGenerating || keptCount === 0}
        >
          {isGenerating ? (
            <>
              <span className="spinner"></span>
              {generationProgress}
            </>
          ) : (
            <>
              <span className="generate-icon">✨</span>
              Generate {keptCount} Image{keptCount === 1 ? '' : 's'} → Publisher
            </>
          )}
        </button>
      </div>
    </section>
  );
}

export default memo(GridReviewPanel);
