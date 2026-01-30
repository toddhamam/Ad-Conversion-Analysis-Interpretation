import { IQ_LEVELS, USER_IQ_LEVELS, type ReasoningEffort } from '../services/openaiApi';
import { Brain, Clock, Coins } from 'lucide-react';
import './IQSelector.css';

interface IQSelectorProps {
  value: ReasoningEffort;
  onChange: (level: ReasoningEffort) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * ConversionIQ™ Level Selector
 * Allows users to choose their AI reasoning depth before analysis/generation
 */
export default function IQSelector({
  value,
  onChange,
  disabled = false,
  compact = false
}: IQSelectorProps) {
  return (
    <div className={`iq-selector ${compact ? 'iq-selector-compact' : ''} ${disabled ? 'iq-selector-disabled' : ''}`}>
      <div className="iq-selector-header">
        <span className="iq-selector-icon"><Brain size={16} strokeWidth={1.5} /></span>
        <span className="iq-selector-label">ConversionIQ™ Level</span>
      </div>
      <div className="iq-selector-options">
        {USER_IQ_LEVELS.map((level) => {
          const config = IQ_LEVELS[level];
          const isActive = value === level;

          return (
            <button
              key={level}
              type="button"
              className={`iq-option ${isActive ? 'active' : ''} ${level === 'xhigh' ? 'premium' : ''}`}
              onClick={() => onChange(level)}
              disabled={disabled}
            >
              {/* Header: Icon + Name + Tagline */}
              <div className="iq-option-header">
                <span className="iq-option-icon">{config.icon}</span>
                <div className="iq-option-titles">
                  <span className="iq-option-name">{config.name}</span>
                  <span className="iq-option-tagline">{config.tagline}</span>
                </div>
              </div>

              {/* Description - only in non-compact mode */}
              {!compact && (
                <p className="iq-option-desc">{config.description}</p>
              )}

              {/* Meta info: Timing + Token usage */}
              <div className="iq-option-meta">
                <span className="iq-meta-item" title="Estimated processing time">
                  <Clock size={12} strokeWidth={1.5} />
                  <span className="iq-meta-label">Time:</span>
                  <span className="iq-meta-value">{config.timing}</span>
                </span>
                <span className="iq-meta-item" title="Token usage (affects cost)">
                  <Coins size={12} strokeWidth={1.5} />
                  <span className="iq-meta-label">Tokens:</span>
                  <span className="iq-meta-value">{config.tokenLabel}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
