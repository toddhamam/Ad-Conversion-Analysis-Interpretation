import { memo } from 'react';
import type { BlitzImageStrategy } from '../services/openaiApi';

// Shared "Image strategy" selector for Blitz Testing — how one rendered image pool maps across the
// Angle × Hook grid, so the image can be held constant along a chosen axis while copy is tested.
// Appears on the config step (plan it up front) and on Grid Review (fine-tune after pruning copy).
// `counts` is the live render count per strategy for the current grid, supplied by the parent.
// Presentational — uses .blitz-strategy-* + the shared .config-section/.copy-length-* classes.
interface BlitzImageStrategySelectorProps {
  value: BlitzImageStrategy;
  counts: Record<BlitzImageStrategy, number>;
  disabled?: boolean;
  onChange: (s: BlitzImageStrategy) => void;
}

const STRATEGY_OPTIONS: { id: BlitzImageStrategy; name: string; desc: string }[] = [
  { id: 'single', name: 'One image', desc: 'Same image on every ad — isolates angle, hook & copy' },
  { id: 'per_angle', name: 'One per angle', desc: "Each angle keeps one image across its hooks" },
  { id: 'per_hook', name: 'One per hook', desc: "Each hook keeps one image across its angles" },
  { id: 'per_ad', name: 'Unique per ad', desc: 'A fresh image for every creative — max variety' },
];

function BlitzImageStrategySelector({ value, counts, disabled, onChange }: BlitzImageStrategySelectorProps) {
  return (
    <div className="config-section blitz-strategy">
      <label className="config-label">Image strategy</label>
      <p className="config-hint">
        How one image pool maps across your test grid — hold the image constant to isolate the variable you're testing.
      </p>
      <div className="blitz-strategy-options">
        {STRATEGY_OPTIONS.map(opt => {
          const n = counts[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              className={`copy-length-btn blitz-strategy-btn ${value === opt.id ? 'active' : ''}`}
              onClick={() => onChange(opt.id)}
              disabled={disabled}
            >
              <span className="copy-length-name">{opt.name}</span>
              <span className="copy-length-desc">{opt.desc}</span>
              <span className="blitz-strategy-count">
                {n} image{n === 1 ? '' : 's'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(BlitzImageStrategySelector);
