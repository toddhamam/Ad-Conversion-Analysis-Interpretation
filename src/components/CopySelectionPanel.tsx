import { memo, useState, useCallback } from 'react';
import { RefreshCw, Loader } from 'lucide-react';
import type { CopyOption } from '../services/openaiApi';
import './CopySelectionPanel.css';

interface CopySelectionPanelProps {
  headlines: CopyOption[];
  bodyTexts: CopyOption[];
  callToActions: CopyOption[];
  selectedHeadlines: string[];
  selectedBodyTexts: string[];
  selectedCTAs: string[];
  onHeadlineToggle: (id: string) => void;
  onBodyTextToggle: (id: string) => void;
  onCTAToggle: (id: string) => void;
  onRegenerateHeadline?: (id: string) => Promise<void>;
  onRegenerateBodyText?: (id: string) => Promise<void>;
  onRegenerateCTA?: (id: string) => Promise<void>;
  regeneratingCopyId?: string | null;
  minHeadlines?: number;
  maxHeadlines?: number;
  minBodyTexts?: number;
  maxBodyTexts?: number;
  minCTAs?: number;
  maxCTAs?: number;
}

// Threshold for truncating body copy text (characters)
const BODY_TRUNCATE_THRESHOLD = 250;

function BodyCopyOption({
  option,
  isSelected,
  isDisabled,
  isRegenerating,
  isAnyRegenerating,
  onClick,
  onRegenerate,
}: {
  option: CopyOption;
  isSelected: boolean;
  isDisabled: boolean;
  isRegenerating: boolean;
  isAnyRegenerating: boolean;
  onClick: () => void;
  onRegenerate?: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = option.text.length > BODY_TRUNCATE_THRESHOLD;

  const handleExpandClick = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(prev => !prev);
  }, []);

  const handleExpandKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleExpandClick(e);
    }
  }, [handleExpandClick]);

  return (
    <div className="copy-option-wrapper">
      <button
        className={`copy-option body-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
        onClick={onClick}
        disabled={isDisabled || isRegenerating}
      >
        {isRegenerating && (
          <div className="copy-regenerating-overlay">
            <Loader size={20} strokeWidth={1.5} className="copy-regen-spinner" />
            <span>Regenerating...</span>
          </div>
        )}
        <div className="option-checkbox">
          {isSelected ? '✓' : ''}
        </div>
        <div className="option-content">
          <div className={`option-text ${isLong && !expanded ? 'truncated' : ''}`}>
            {option.text}
          </div>
          {isLong && (
            <span
              className="expand-toggle"
              onClick={handleExpandClick}
              onKeyDown={handleExpandKeyDown}
              role="button"
              tabIndex={0}
            >
              {expanded ? 'Show less' : 'Show more'}
            </span>
          )}
          <div className="option-rationale">{option.rationale}</div>
        </div>
      </button>
      {onRegenerate && (
        <button
          className="copy-regenerate-btn"
          onClick={(e) => { e.stopPropagation(); onRegenerate(option.id); }}
          disabled={isAnyRegenerating}
          title="Generate a different body copy"
          aria-label="Regenerate this body copy"
        >
          <RefreshCw size={14} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}

export default memo(function CopySelectionPanel({
  headlines,
  bodyTexts,
  callToActions,
  selectedHeadlines,
  selectedBodyTexts,
  selectedCTAs,
  onHeadlineToggle,
  onBodyTextToggle,
  onCTAToggle,
  onRegenerateHeadline,
  onRegenerateBodyText,
  onRegenerateCTA,
  regeneratingCopyId = null,
  minHeadlines = 1,
  maxHeadlines = 4,
  minBodyTexts = 1,
  maxBodyTexts = 3,
  minCTAs = 1,
  maxCTAs = 2,
}: CopySelectionPanelProps) {
  const canSelectMoreHeadlines = selectedHeadlines.length < maxHeadlines;
  const canSelectMoreBodyTexts = selectedBodyTexts.length < maxBodyTexts;
  const canSelectMoreCTAs = selectedCTAs.length < maxCTAs;
  const isAnyRegenerating = regeneratingCopyId !== null;

  const handleHeadlineClick = (id: string) => {
    const isSelected = selectedHeadlines.includes(id);
    if (isSelected || canSelectMoreHeadlines) {
      onHeadlineToggle(id);
    }
  };

  const handleBodyTextClick = (id: string) => {
    const isSelected = selectedBodyTexts.includes(id);
    if (isSelected || canSelectMoreBodyTexts) {
      onBodyTextToggle(id);
    }
  };

  const handleCTAClick = (id: string) => {
    const isSelected = selectedCTAs.includes(id);
    if (isSelected || canSelectMoreCTAs) {
      onCTAToggle(id);
    }
  };

  return (
    <div className="copy-selection-panel">
      {/* Headlines Section */}
      <div className="copy-section">
        <div className="section-header">
          <h4 className="section-title">Headlines</h4>
          <span className="selection-count">
            {selectedHeadlines.length}/{maxHeadlines} selected
            {selectedHeadlines.length < minHeadlines && (
              <span className="min-warning"> (min {minHeadlines})</span>
            )}
          </span>
        </div>
        <div className="copy-options-list">
          {headlines.map((option) => {
            const isSelected = selectedHeadlines.includes(option.id);
            const isDisabled = !isSelected && !canSelectMoreHeadlines;
            const isRegenerating = regeneratingCopyId === option.id;
            return (
              <div key={option.id} className="copy-option-wrapper">
                <button
                  className={`copy-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => handleHeadlineClick(option.id)}
                  disabled={isDisabled || isRegenerating}
                >
                  {isRegenerating && (
                    <div className="copy-regenerating-overlay">
                      <Loader size={20} strokeWidth={1.5} className="copy-regen-spinner" />
                      <span>Regenerating...</span>
                    </div>
                  )}
                  <div className="option-checkbox">
                    {isSelected ? '✓' : ''}
                  </div>
                  <div className="option-content">
                    <div className="option-text">{option.text}</div>
                    <div className="option-rationale">{option.rationale}</div>
                  </div>
                </button>
                {onRegenerateHeadline && (
                  <button
                    className="copy-regenerate-btn"
                    onClick={(e) => { e.stopPropagation(); onRegenerateHeadline(option.id); }}
                    disabled={isAnyRegenerating}
                    title="Generate a different headline"
                    aria-label="Regenerate this headline"
                  >
                    <RefreshCw size={14} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Body Copy Section */}
      <div className="copy-section">
        <div className="section-header">
          <h4 className="section-title">Body Copy</h4>
          <span className="selection-count">
            {selectedBodyTexts.length}/{maxBodyTexts} selected
            {selectedBodyTexts.length < minBodyTexts && (
              <span className="min-warning"> (min {minBodyTexts})</span>
            )}
          </span>
        </div>
        <div className="copy-options-list">
          {bodyTexts.map((option) => {
            const isSelected = selectedBodyTexts.includes(option.id);
            const isDisabled = !isSelected && !canSelectMoreBodyTexts;
            const isRegenerating = regeneratingCopyId === option.id;
            return (
              <BodyCopyOption
                key={option.id}
                option={option}
                isSelected={isSelected}
                isDisabled={isDisabled}
                isRegenerating={isRegenerating}
                isAnyRegenerating={isAnyRegenerating}
                onClick={() => handleBodyTextClick(option.id)}
                onRegenerate={onRegenerateBodyText}
              />
            );
          })}
        </div>
      </div>

      {/* CTAs Section — hidden when no CTAs available (e.g. import mode) */}
      {callToActions.length > 0 && (
        <div className="copy-section">
          <div className="section-header">
            <h4 className="section-title">Call-to-Actions</h4>
            <span className="selection-count">
              {selectedCTAs.length}/{maxCTAs} selected
              {selectedCTAs.length < minCTAs && (
                <span className="min-warning"> (min {minCTAs})</span>
              )}
            </span>
          </div>
          <div className="copy-options-grid">
            {callToActions.map((option) => {
              const isSelected = selectedCTAs.includes(option.id);
              const isDisabled = !isSelected && !canSelectMoreCTAs;
              const isRegenerating = regeneratingCopyId === option.id;
              return (
                <div key={option.id} className="cta-option-wrapper">
                  <button
                    className={`cta-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    onClick={() => handleCTAClick(option.id)}
                    disabled={isDisabled || isRegenerating}
                  >
                    {isRegenerating && (
                      <div className="copy-regenerating-overlay">
                        <Loader size={16} strokeWidth={1.5} className="copy-regen-spinner" />
                        <span>Regenerating...</span>
                      </div>
                    )}
                    <div className="cta-checkbox">
                      {isSelected ? '✓' : ''}
                    </div>
                    <div className="cta-content">
                      <div className="cta-text">{option.text}</div>
                      <div className="cta-rationale">{option.rationale}</div>
                    </div>
                  </button>
                  {onRegenerateCTA && (
                    <button
                      className="copy-regenerate-btn"
                      onClick={(e) => { e.stopPropagation(); onRegenerateCTA(option.id); }}
                      disabled={isAnyRegenerating}
                      title="Generate a different CTA"
                      aria-label="Regenerate this CTA"
                    >
                      <RefreshCw size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
