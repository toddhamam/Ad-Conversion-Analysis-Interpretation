import { useState, useEffect, useRef } from 'react';
import type { FeedbackType } from '../types/feedback';
import { submitFeedback } from '../services/feedbackApi';
import './FeedbackWidget.css';

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('feature_request');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Listen for external open requests (from sidebar/dropdown "Support" links)
  useEffect(() => {
    const handleOpenRequest = () => {
      setIsOpen(true);
      setSubmitted(false);
      setError(null);
    };
    document.addEventListener('open-feedback-widget', handleOpenRequest);
    return () => document.removeEventListener('open-feedback-widget', handleOpenRequest);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSubmitted(false);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedback({
        type: feedbackType,
        title: title.trim(),
        description: description.trim(),
        page_url: window.location.href,
      });
      setSubmitted(true);
      setTitle('');
      setDescription('');
      setTimeout(() => {
        setSubmitted(false);
        setIsOpen(false);
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="feedback-trigger"
        onClick={handleToggle}
        aria-label={isOpen ? 'Close feedback panel' : 'Send feedback'}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div ref={panelRef} className="feedback-panel" role="dialog" aria-label="Submit feedback">
          <div className="feedback-panel-header">
            <h3 className="feedback-panel-title">Send Feedback</h3>
          </div>

          {submitted ? (
            <div className="feedback-success">
              <div className="feedback-success-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p>Thank you for your feedback!</p>
            </div>
          ) : (
            <>
              <div className="feedback-type-tabs" role="tablist">
                <button
                  role="tab"
                  aria-selected={feedbackType === 'feature_request'}
                  className={`feedback-tab ${feedbackType === 'feature_request' ? 'feedback-tab-active' : ''}`}
                  onClick={() => { setFeedbackType('feature_request'); setError(null); }}
                >
                  Feature Request
                </button>
                <button
                  role="tab"
                  aria-selected={feedbackType === 'bug_report'}
                  className={`feedback-tab ${feedbackType === 'bug_report' ? 'feedback-tab-active' : ''}`}
                  onClick={() => { setFeedbackType('bug_report'); setError(null); }}
                >
                  Bug Report
                </button>
              </div>

              <div className="feedback-form">
                <input
                  type="text"
                  className="feedback-input"
                  placeholder={feedbackType === 'feature_request' ? 'Feature title...' : 'Bug summary...'}
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setError(null); }}
                  maxLength={200}
                  aria-label="Title"
                />
                <textarea
                  className="feedback-textarea"
                  placeholder={feedbackType === 'feature_request'
                    ? 'Describe the feature you would like...'
                    : 'Describe what happened and what you expected...'}
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setError(null); }}
                  rows={4}
                  maxLength={2000}
                  aria-label="Description"
                />
                {error && <p className="feedback-error">{error}</p>}
                <button
                  className="feedback-submit"
                  onClick={handleSubmit}
                  disabled={submitting || !title.trim() || !description.trim()}
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
