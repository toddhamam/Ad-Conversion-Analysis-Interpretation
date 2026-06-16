import { memo } from 'react';

// Image/graphic variation control for CreativeIQ™ generation. The sibling of the
// "Copy Variation Level" slider — this one governs how closely generated VISUALS hug
// the reference creatives (0 = near-identical to winners) vs. strike out with a bold
// new graphic style (100). Bound to AdGenerator's `similarityValue` (passed to Gemini
// as `similarityLevel`), so copy variation and creative variation are independent axes:
// keep the copy, test a brand-new image style — or vice versa.
//
// Presentational only. Reuses the global `.similarity-*` classes in AdGenerator.css so
// it renders identically in the single (final-config), Blitz config, and Blitz review steps.
interface CreativeVariationSliderProps {
  value: number;                       // 0 = match references exactly, 100 = completely new style
  onChange: (value: number) => void;
  hasReference: boolean;               // cached winning images or channel analysis available to anchor to
  disabled?: boolean;
}

function CreativeVariationSlider({ value, onChange, hasReference, disabled }: CreativeVariationSliderProps) {
  return (
    <div className="config-section similarity-section">
      <label className="config-label">Creative Variation Level</label>
      <p className="config-hint">
        {hasReference
          ? 'Control how closely the new visuals match the creative style already converting in your ad account'
          : 'Control how conventional vs. experimental the generated visuals will be'}
      </p>
      <div className="similarity-slider-container">
        <div className="similarity-labels">
          <span className="similarity-label-left">{hasReference ? 'Match Winners' : 'Conservative'}</span>
          <span className="similarity-label-right">{hasReference ? 'Bold & New' : 'Experimental'}</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="similarity-slider"
          disabled={disabled}
        />
        <div className="similarity-value">
          {hasReference
            ? (value <= 20 ? '🎯 Near Identical' :
               value <= 40 ? '✨ Subtle Variations' :
               value <= 60 ? '🔄 Balanced Mix' :
               value <= 80 ? '🎨 Fresh Visuals' :
               '🚀 Bold & Different')
            : (value <= 20 ? '🎯 Conservative' :
               value <= 40 ? '✨ Slightly Creative' :
               value <= 60 ? '🔄 Balanced' :
               value <= 80 ? '🎨 Creative' :
               '🚀 Experimental')}
          <span className="similarity-percent">{value}% variation</span>
        </div>
      </div>
    </div>
  );
}

export default memo(CreativeVariationSlider);
