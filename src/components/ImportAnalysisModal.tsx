import { useState } from 'react';
import type { AdAccountInfo } from '../services/metaApi';
import type { AvailableImport } from '../lib/channelAnalysisCache';
import './ImportAnalysisModal.css';

interface ImportAnalysisModalProps {
  availableImports: AvailableImport[];
  currentBusinessType: string;
  onImport: (sourceAccountId: string) => boolean;
  onClose: () => void;
}

export default function ImportAnalysisModal({
  availableImports,
  currentBusinessType,
  onImport,
  onClose,
}: ImportAnalysisModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [importedAccountId, setImportedAccountId] = useState<string | null>(null);

  function handleImport(account: AdAccountInfo) {
    setError(null);
    const success = onImport(account.ad_account_id);
    if (success) {
      setImportedAccountId(account.ad_account_id);
      setTimeout(onClose, 600);
    } else {
      setError('Import failed — try clearing old generated ads to free up storage.');
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div className="import-modal-overlay" onClick={onClose}>
      <div className="import-modal" onClick={e => e.stopPropagation()}>
        <button className="import-modal-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="import-modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="M8 11l4 4 4-4" />
            <path d="M20 21H4" />
          </svg>
        </div>

        <h2 className="import-modal-title">Import Channel Analysis</h2>
        <p className="import-modal-desc">
          Import an existing ConversionIQ analysis from another ad account to inform creative generation on this account.
        </p>

        {error && (
          <div className="import-modal-error">
            <span className="import-error-icon">!</span>
            {error}
          </div>
        )}

        {availableImports.length === 0 ? (
          <div className="import-modal-empty">
            <p>No analyses available to import.</p>
            <p className="import-empty-hint">
              Run a channel analysis on another ad account first, then come back to import it here.
            </p>
          </div>
        ) : (
          <div className="import-modal-accounts">
            {availableImports.map(({ account, analysis, businessType }) => {
              const isMismatch = businessType !== currentBusinessType;
              const isImported = importedAccountId === account.ad_account_id;

              return (
                <div key={account.ad_account_id} className={`import-account-card ${isImported ? 'imported' : ''}`}>
                  <div className="import-account-info">
                    <div className="import-account-name">
                      {account.ad_account_name || account.ad_account_id}
                    </div>
                    <div className="import-account-details">
                      <span className="import-detail">
                        Analyzed {formatDate(analysis.analyzedAt)}
                      </span>
                      <span className="import-detail-sep">&middot;</span>
                      <span className="import-detail">
                        {/* A seeded source account has no delivery data to score. */}
                        {typeof analysis.overallHealthScore === 'number'
                          ? `Score: ${analysis.overallHealthScore}/10`
                          : 'No delivery data'}
                      </span>
                      <span className="import-detail-sep">&middot;</span>
                      <span className="import-detail">
                        {analysis.performanceBreakdown?.totalAdsAnalyzed || 0} ads
                      </span>
                    </div>
                    {isMismatch && (
                      <div className="import-account-warning">
                        <span className="import-warning-icon">&#9888;</span>
                        Different business type ({businessType}). Patterns may not fully apply.
                      </div>
                    )}
                  </div>
                  <button
                    className="import-account-btn"
                    onClick={() => handleImport(account)}
                    disabled={isImported}
                  >
                    {isImported ? 'Imported' : 'Import'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
