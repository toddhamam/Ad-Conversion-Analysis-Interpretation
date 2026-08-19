import { useState, useRef } from 'react';
import { MANUAL_ANALYSIS_PROMPT_TEMPLATE, distillManualAnalysis } from '../services/openaiApi';
import './ManualAnalysisModal.css';

type Mode = 'json' | 'brief';

interface ManualAnalysisModalProps {
  /** Parse + persist the raw seed (JSON or distilled brief). Returns true on a verified write. */
  onImport: (raw: unknown) => boolean;
  onClose: () => void;
}

const MAX_TEXT_BYTES = 1024 * 1024; // 1MB — a ConversionIQ analysis / brief is text, never this big

export default function ManualAnalysisModal({ onImport, onClose }: ManualAnalysisModalProps) {
  const [mode, setMode] = useState<Mode>('json');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (file.size > MAX_TEXT_BYTES) {
      setError('That file is too large (max 1MB of text).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(typeof reader.result === 'string' ? reader.result : '');
      setError(null);
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(MANUAL_ANALYSIS_PROMPT_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not access the clipboard — open "View prompt" below and copy it manually.');
    }
  }

  async function handleSubmit() {
    const clean = text.trim();
    if (!clean) {
      setError(mode === 'json' ? 'Paste a ConversionIQ analysis (JSON) first.' : 'Paste a brand brief first.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let raw: unknown;
      if (mode === 'json') {
        try {
          raw = JSON.parse(clean);
        } catch {
          setError('That is not valid JSON. Paste the JSON output from the ConversionIQ prompt, or switch to "Brand brief".');
          setBusy(false);
          return;
        }
      } else {
        raw = await distillManualAnalysis(clean);
      }
      const ok = onImport(raw);
      if (ok) {
        setDone(true);
        setTimeout(onClose, 600);
      } else {
        setError('Could not save the seed — try clearing old generated ads to free up storage.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-modal-overlay" onClick={onClose}>
      <div className="manual-modal" onClick={e => e.stopPropagation()}>
        <button className="manual-modal-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="manual-modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M12 18v-6" />
            <path d="M9 15h6" />
          </svg>
        </div>

        <h2 className="manual-modal-title">Seed a Manual Analysis</h2>
        <p className="manual-modal-desc">
          Cold-start copy generation for a brand-new account. Paste a finished ConversionIQ analysis, or
          a brand brief we&apos;ll distill — it informs creative until your own ad data replaces it.
        </p>

        <div className="manual-mode-toggle">
          <button
            type="button"
            className={`manual-mode-btn ${mode === 'json' ? 'active' : ''}`}
            aria-pressed={mode === 'json'}
            onClick={() => switchMode('json')}
            disabled={busy}
          >
            Paste finished analysis (JSON)
          </button>
          <button
            type="button"
            className={`manual-mode-btn ${mode === 'brief' ? 'active' : ''}`}
            aria-pressed={mode === 'brief'}
            onClick={() => switchMode('brief')}
            disabled={busy}
          >
            Distill from a brand brief
          </button>
        </div>

        {mode === 'json' && (
          <div className="manual-prompt-help">
            <div className="manual-prompt-help-row">
              <button type="button" className="manual-copy-btn" onClick={handleCopyPrompt}>
                {copied ? 'Copied ✓' : 'Copy ConversionIQ prompt'}
              </button>
              <span className="manual-prompt-hint">
                Run it in your other repo, paste the JSON output below.
              </span>
            </div>
            <details className="manual-prompt-reveal">
              <summary>View prompt</summary>
              <pre className="manual-prompt-pre">{MANUAL_ANALYSIS_PROMPT_TEMPLATE}</pre>
            </details>
          </div>
        )}

        {error && (
          <div className="manual-modal-error">
            <span className="manual-error-icon">!</span>
            {error}
          </div>
        )}

        <textarea
          className="manual-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={
            mode === 'json'
              ? 'Paste the ConversionIQ analysis JSON here…'
              : 'Paste your brand / positioning brief, messaging style, or a few example ads written in your voice…'
          }
          rows={10}
          disabled={busy}
          spellCheck={false}
        />

        <div className="manual-modal-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.json"
            onChange={handleFile}
            hidden
          />
          <button
            type="button"
            className="manual-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            Upload file
          </button>
          <button
            type="button"
            className="manual-submit-btn"
            onClick={handleSubmit}
            disabled={busy || done}
          >
            {busy
              ? mode === 'brief'
                ? 'ConversionIQ™ distilling…'
                : 'Seeding…'
              : done
                ? 'Seeded ✓'
                : 'Seed Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
}
