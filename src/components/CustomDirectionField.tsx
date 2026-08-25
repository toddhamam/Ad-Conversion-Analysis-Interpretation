import { memo, useId } from 'react';
import { Wand2, X } from 'lucide-react';
import {
  CUSTOM_DIRECTION_MAX_LENGTH,
  CUSTOM_DIRECTION_MODE_HINT,
  CUSTOM_DIRECTION_MODE_LABEL,
  type CustomDirectionDraft,
  type CustomDirectionMode,
} from '../lib/customDirection';
import './CustomDirectionField.css';

// Operator creative brief input — used in two places with the same semantics:
//   • batch level, on the Generate Creatives step, applying to every image in the run
//   • per image, next to a Regenerate button, applying to that one reroll
//
// Collapsed by default. The whole point of ConversionIQ™ is that the operator does NOT have to
// write a brief, so an always-open textarea would read as a required field.
//
// Presentational — the brief lives in AdGenerator state and is normalized in
// `lib/customDirection.ts` at the point of use, not here. This component deliberately does not
// trim or validate: a half-typed brief must survive re-render exactly as typed.
interface CustomDirectionFieldProps {
  /** Owned by the parent, so the batch-level draft can persist with the session. */
  draft: CustomDirectionDraft;
  onChange: (draft: CustomDirectionDraft) => void;
  disabled?: boolean;
  /** `inline` is the tighter treatment used under a single image card. */
  variant?: 'panel' | 'inline';
  placeholder?: string;
}

const MODES: CustomDirectionMode[] = ['blend', 'override'];

function CustomDirectionField({
  draft,
  onChange,
  disabled = false,
  variant = 'panel',
  placeholder = 'e.g. A woman on a beach at sunrise holding the book, warm golden light, shot on film',
}: CustomDirectionFieldProps) {
  const fieldId = useId();
  const { text, mode, open } = draft;
  const patch = (next: Partial<CustomDirectionDraft>) => onChange({ ...draft, ...next });
  const hasText = text.trim().length > 0;
  const remaining = CUSTOM_DIRECTION_MAX_LENGTH - text.length;

  if (!open) {
    return (
      <button
        type="button"
        className={`cd-toggle cd-toggle-${variant}`}
        onClick={() => patch({ open: true })}
        disabled={disabled}
      >
        <Wand2 size={variant === 'inline' ? 12 : 14} strokeWidth={1.5} aria-hidden="true" />
        {hasText ? 'Edit creative brief' : variant === 'inline' ? 'Regenerate with notes' : 'Describe the image yourself'}
        {hasText && <span className="cd-toggle-dot" aria-label="a brief is set" />}
      </button>
    );
  }

  return (
    <div className={`cd-field cd-field-${variant}`}>
      <div className="cd-head">
        <label className="cd-label" htmlFor={fieldId}>
          <Wand2 size={13} strokeWidth={1.5} aria-hidden="true" />
          Your creative brief
        </label>
        <button
          type="button"
          className="cd-close"
          onClick={() => patch({ open: false })}
          disabled={disabled}
          aria-label="Hide the creative brief field"
        >
          <X size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <textarea
        id={fieldId}
        className="cd-textarea"
        value={text}
        onChange={e => patch({ text: e.target.value.slice(0, CUSTOM_DIRECTION_MAX_LENGTH) })}
        placeholder={placeholder}
        maxLength={CUSTOM_DIRECTION_MAX_LENGTH}
        rows={variant === 'inline' ? 3 : 4}
        disabled={disabled}
      />

      <div className="cd-modes" role="radiogroup" aria-label="How the brief is applied">
        {MODES.map(m => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={`cd-mode ${mode === m ? 'active' : ''}`}
            onClick={() => patch({ mode: m })}
            disabled={disabled || !hasText}
            title={CUSTOM_DIRECTION_MODE_HINT[m]}
          >
            {CUSTOM_DIRECTION_MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <p className="cd-hint">
        {hasText
          ? CUSTOM_DIRECTION_MODE_HINT[mode]
          : 'Leave this empty to generate purely from ConversionIQ™ intelligence.'}
        {remaining < 200 && <span className="cd-count"> · {remaining} characters left</span>}
      </p>

      {/* Product fidelity, aspect ratio, in-image text rules and Meta content policy are enforced
          after the brief regardless of what it says — worth stating so nobody expects otherwise. */}
      <p className="cd-note">
        Your product images, ad format and Meta content rules are always applied on top of your brief.
      </p>
    </div>
  );
}

export default memo(CustomDirectionField);
