import { memo } from 'react';
import type { ImageModel } from '../services/openaiApi';

// Image-generation engine picker — Gemini 3 Pro (Nano Banana Pro) vs OpenAI GPT Image 2.
// Presentational: shared by the single-ad final-config step, the Blitz config step, and Grid Review,
// all bound to the same `imageModel` state in AdGenerator so the choice stays in sync everywhere.
// Reuses the shared .config-section / .image-size-* classes from AdGenerator.css.
interface ImageModelSelectorProps {
  value: ImageModel;
  disabled?: boolean;
  onChange: (model: ImageModel) => void;
}

function ImageModelSelector({ value, disabled, onChange }: ImageModelSelectorProps) {
  return (
    <div className="config-section">
      <label className="config-label">Image Generation Model</label>
      <p className="config-hint">Choose which AI model generates the creatives. Try both to compare quality.</p>
      <div className="image-size-options">
        <button
          type="button"
          className={`image-size-btn ${value === 'gemini' ? 'active' : ''}`}
          onClick={() => onChange('gemini')}
          disabled={disabled}
        >
          <span className="image-size-icon">🧠</span>
          <span className="image-size-name">Gemini 3 Pro</span>
          <span className="image-size-dimensions">Default</span>
          <span className="image-size-desc">Google's flagship — strong with reference images</span>
        </button>
        <button
          type="button"
          className={`image-size-btn ${value === 'openai' ? 'active' : ''}`}
          onClick={() => onChange('openai')}
          disabled={disabled}
        >
          <span className="image-size-icon">✨</span>
          <span className="image-size-name">GPT Image 2</span>
          <span className="image-size-dimensions">New</span>
          <span className="image-size-desc">OpenAI's flagship — native reasoning, 99% text accuracy</span>
        </button>
      </div>
    </div>
  );
}

export default memo(ImageModelSelector);
