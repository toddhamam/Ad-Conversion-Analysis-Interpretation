import {
  SHOWCASE_TEMPLATES,
  SHOWCASE_TEMPLATE_VALUES,
  SHOWCASE_SIZE_LABELS,
  type ShowcaseDraft,
  type ShowcaseTemplate,
  type ShowcaseSize,
} from '../lib/showcaseLayout';
import { TEXT_AD_STYLES } from '../services/textAdCanvas';
import type { ShowcaseAsset } from '../services/showcaseLibraryApi';

interface Props {
  draft: ShowcaseDraft;
  onChange: (patch: Partial<ShowcaseDraft>) => void;
  assets: ShowcaseAsset[];
  /** Called when the operator wants to change which client work is used. */
  onPickAssets: () => void;
  /** Clearing on template change lives with the caller — arity differs per template. */
  onTemplateChange: (template: ShowcaseTemplate) => void;
  disabled?: boolean;
}

/**
 * The Showcase Ad configuration step.
 *
 * Lives outside AdGenerator.tsx because that file is already 4.6k lines, and takes ONE draft
 * object rather than seven values and seven setters — the same shape `CustomDirectionDraft`
 * settled on for the same reason (ADR #23).
 */
const ShowcaseConfigPanel = ({
  draft, onChange, assets, onPickAssets, onTemplateChange, disabled,
}: Props) => (
  <div className="config-section showcase-config">
    <label className="config-label">Showcase Composite</label>
    <p className="config-hint">
      Your client's screenshots, composited exactly as you captured them. No AI touches the
      picture, and it costs no credits.
    </p>

    <div className="showcase-template-options">
      {SHOWCASE_TEMPLATE_VALUES.map(t => (
        <button
          key={t}
          className={`ad-type-btn ${draft.template === t ? 'active' : ''}`}
          onClick={() => onTemplateChange(t)}
        >
          <span className="ad-type-name">{SHOWCASE_TEMPLATES[t].label}</span>
          <span className="ad-type-desc">{SHOWCASE_TEMPLATES[t].hint}</span>
        </button>
      ))}
    </div>

    <div className="showcase-picker-row">
      <button className="secondary-btn" onClick={onPickAssets} disabled={disabled}>
        🖥️ Choose client work
      </button>
      <span className="config-hint">
        {assets.length > 0
          ? assets.map(a => a.client_name).join(', ')
          : 'Nothing selected yet'}
      </span>
    </div>

    <div className="showcase-field-row">
      <label className="showcase-field">
        <span>Format</span>
        <select
          value={draft.size}
          onChange={e => onChange({ size: e.target.value as ShowcaseSize })}
        >
          {(Object.keys(SHOWCASE_SIZE_LABELS) as ShowcaseSize[]).map(sz => (
            <option key={sz} value={sz}>{SHOWCASE_SIZE_LABELS[sz]}</option>
          ))}
        </select>
      </label>

      <label className="showcase-field">
        <span>Theme</span>
        <select value={draft.styleId} onChange={e => onChange({ styleId: e.target.value })}>
          {TEXT_AD_STYLES.map(st => (
            <option key={st.id} value={st.id}>{st.name}</option>
          ))}
        </select>
      </label>

      {draft.template === 'hero_browser' && (
        <label className="showcase-field">
          <span>Browser frame</span>
          <select
            value={draft.chrome}
            onChange={e => onChange({ chrome: e.target.value as 'browser' | 'none' })}
          >
            <option value="browser">Show address bar</option>
            <option value="none">No frame</option>
          </select>
        </label>
      )}
    </div>

    {draft.template === 'before_after_split' && (
      <div className="showcase-field-row">
        <label className="showcase-field">
          <span>“Before” label</span>
          <input
            value={draft.beforeLabel} placeholder="BEFORE"
            onChange={e => onChange({ beforeLabel: e.target.value })}
          />
        </label>
        <label className="showcase-field">
          <span>“After” label</span>
          <input
            value={draft.afterLabel} placeholder="AFTER"
            onChange={e => onChange({ afterLabel: e.target.value })}
          />
        </label>
      </div>
    )}

    <label className="showcase-field">
      <span>Caption (optional)</span>
      <input
        value={draft.caption} placeholder="Rebuilt in 3 weeks"
        onChange={e => onChange({ caption: e.target.value })}
      />
    </label>
  </div>
);

export default ShowcaseConfigPanel;
