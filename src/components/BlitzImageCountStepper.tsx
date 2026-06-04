import { memo } from 'react';

// Shared "How many images?" stepper for Blitz Testing. Appears on the config step (plan the pool
// up front, next to the creative count) and again on Grid Review (fine-tune after pruning copy).
// Bound to a single count in AdGenerator; `max` is the current copy-cell count so the image pool
// never exceeds the number of copy variants. Presentational — uses .blitz-count-* in AdGenerator.css.
interface BlitzImageCountStepperProps {
  value: number;     // effective (already clamped) image count
  max: number;
  hint: string;
  disabled?: boolean;
  onChange: (n: number) => void;
}

function BlitzImageCountStepper({ value, max, hint, disabled, onChange }: BlitzImageCountStepperProps) {
  return (
    <div className="blitz-count-row">
      <div className="blitz-count-label">
        <span className="blitz-count-title">How many images?</span>
        <span className="blitz-count-hint">{hint}</span>
      </div>
      <div className="blitz-count-stepper">
        <button
          type="button"
          className="blitz-count-btn"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={disabled || value <= 1}
          aria-label="Fewer images"
        >
          −
        </button>
        <span className="blitz-count-value">{value}</span>
        <button
          type="button"
          className="blitz-count-btn"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={disabled || value >= max}
          aria-label="More images"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default memo(BlitzImageCountStepper);
