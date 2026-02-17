import type { AdLibraryInspiration } from '../types';
import './AdLibraryBrowser.css';

interface InspirationSelectorProps {
  inspirations: AdLibraryInspiration[];
  activeIds: string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  maxActive?: number;
}

export default function InspirationSelector({
  inspirations,
  activeIds,
  onToggle,
  onRemove,
  maxActive = 5,
}: InspirationSelectorProps) {
  if (inspirations.length === 0) return null;

  const activeCount = activeIds.length;

  return (
    <div className="inspiration-selector">
      <div className="inspiration-selector-header">
        <span className="inspiration-selector-title">Saved Inspirations</span>
        <span className="inspiration-selector-count">
          <span className="active-count">{activeCount}</span>/{maxActive} active for generation
        </span>
      </div>

      <div className="inspiration-list">
        {inspirations.map(insp => {
          const isActive = activeIds.includes(insp.id);
          const isAtLimit = activeCount >= maxActive && !isActive;
          const preview = insp.adCreativeBodies[0]?.substring(0, 80) || insp.adCreativeLinkTitles[0] || 'No copy';

          return (
            <div
              key={insp.id}
              className={`inspiration-item ${isActive ? 'active' : ''} ${isAtLimit ? 'disabled' : ''}`}
              onClick={() => {
                if (!isAtLimit || isActive) onToggle(insp.id);
              }}
            >
              <input
                type="checkbox"
                className="inspiration-checkbox"
                checked={isActive}
                disabled={isAtLimit && !isActive}
                onChange={() => onToggle(insp.id)}
                onClick={e => e.stopPropagation()}
              />
              <div className="inspiration-item-content">
                <div className="inspiration-item-page">
                  {insp.pageName}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    {insp.durationDays >= 30
                      ? `${Math.floor(insp.durationDays / 30)}mo`
                      : `${insp.durationDays}d`}
                  </span>
                </div>
                <div className="inspiration-item-preview">{preview}</div>
              </div>
              <button
                className="inspiration-item-remove"
                onClick={e => {
                  e.stopPropagation();
                  onRemove(insp.id);
                }}
                aria-label={`Remove ${insp.pageName} inspiration`}
                title="Remove"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
