import { memo, useState, useCallback } from 'react';
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
  onClick,
}: {
  option: CopyOption;
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
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
    <button
      className={`copy-option body-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={isDisabled}
    >
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
            return (
              <button
                key={option.id}
                className={`copy-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => handleHeadlineClick(option.id)}
                disabled={isDisabled}
              >
                <div className="option-checkbox">
                  {isSelected ? '✓' : ''}
                </div>
                <div className="option-content">
                  <div className="option-text">{option.text}</div>
                  <div className="option-rationale">{option.rationale}</div>
                </div>
              </button>
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
            return (
              <BodyCopyOption
                key={option.id}
                option={option}
                isSelected={isSelected}
                isDisabled={isDisabled}
                onClick={() => handleBodyTextClick(option.id)}
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
              return (
                <button
                  key={option.id}
                  className={`cta-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => handleCTAClick(option.id)}
                  disabled={isDisabled}
                >
                  <div className="cta-checkbox">
                    {isSelected ? '✓' : ''}
                  </div>
                  <div className="cta-content">
                    <div className="cta-text">{option.text}</div>
                    <div className="cta-rationale">{option.rationale}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
