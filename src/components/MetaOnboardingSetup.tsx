import { useState } from 'react';
import { useOrganization } from '../contexts/OrganizationContext';
import {
  getOrgMetaIds,
  loadOrgMetaCredentials,
  saveMetaSelection,
  saveManualCredentials,
  fetchAvailablePixels,
  clearOrgMetaCache,
} from '../services/metaApi';
import './MetaOnboardingSetup.css';

interface MetaOnboardingSetupProps {
  onConfigured?: () => void;
  notification?: { type: 'success' | 'error'; message: string } | null;
  onDismissNotification?: () => void;
}

export default function MetaOnboardingSetup({ onConfigured, notification, onDismissNotification }: MetaOnboardingSetupProps) {
  const { organization } = useOrganization();
  const metaIds = getOrgMetaIds();

  const [selectedAdAccountId, setSelectedAdAccountId] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedPixelId, setSelectedPixelId] = useState('');
  const [availablePixels, setAvailablePixels] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual entry state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualAdAccountId, setManualAdAccountId] = useState('');
  const [manualPageId, setManualPageId] = useState('');
  const [manualPixelId, setManualPixelId] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const isConnected = metaIds?.connected === true || metaIds?.status === 'active';
  const needsConfiguration = isConnected && metaIds?.needsConfiguration === true;
  const isFullyConfigured = isConnected && !needsConfiguration;

  const handleConnect = () => {
    if (!organization?.id) return;
    const returnUrl = '/dashboard';
    window.location.href = `/api/auth/meta/connect?organizationId=${organization.id}&returnUrl=${encodeURIComponent(returnUrl)}`;
  };

  const handleManualSave = async () => {
    if (!manualToken.trim()) {
      setManualError('Access token is required');
      return;
    }
    setManualSaving(true);
    setManualError(null);
    try {
      const result = await saveManualCredentials({
        accessToken: manualToken.trim(),
        adAccountId: manualAdAccountId.trim() || undefined,
        pageId: manualPageId.trim() || undefined,
        pixelId: manualPixelId.trim() || undefined,
      });
      clearOrgMetaCache();
      await loadOrgMetaCredentials();
      if (!result.needsConfiguration) {
        onConfigured?.();
      }
      // Force re-render — credentials are now loaded
      window.location.reload();
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setManualSaving(false);
    }
  };

  const handleAdAccountChange = async (adAccountId: string) => {
    setSelectedAdAccountId(adAccountId);
    setSelectedPixelId('');
    setAvailablePixels([]);
    if (adAccountId) {
      setLoadingPixels(true);
      try {
        const pixels = await fetchAvailablePixels(adAccountId);
        setAvailablePixels(pixels);
      } catch {
        // Non-fatal — pixel selection is optional
      } finally {
        setLoadingPixels(false);
      }
    }
  };

  const handleSave = async () => {
    if (!selectedAdAccountId) {
      setError('Please select an ad account');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveMetaSelection({
        adAccountId: selectedAdAccountId,
        pageId: selectedPageId || null,
        pixelId: selectedPixelId || null,
      });
      clearOrgMetaCache();
      await loadOrgMetaCredentials();
      onConfigured?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Not connected — show connect button + manual entry fallback
  if (!isConnected) {
    return (
      <div className="meta-onboarding">
        {notification && (
          <div className={`meta-onboarding-notification ${notification.type}`}>
            <span>{notification.message}</span>
            {onDismissNotification && (
              <button onClick={onDismissNotification} className="meta-onboarding-notification-dismiss">&times;</button>
            )}
          </div>
        )}
        <div className="meta-onboarding-connect">
          <p>Connect your Meta Ads account to start analyzing your campaigns and generating new creatives.</p>
          <button onClick={handleConnect} className="meta-connect-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Connect Meta Ads
          </button>
        </div>

        <div className="meta-onboarding-manual-toggle">
          <button
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="meta-manual-toggle-btn"
          >
            {showManualEntry ? 'Hide manual setup' : 'Having trouble connecting? Enter credentials manually'}
          </button>
        </div>

        {showManualEntry && (
          <div className="meta-onboarding-manual">
            <p className="meta-onboarding-configure-desc">
              Enter your Meta System User access token and account details. You can find these in your{' '}
              <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer">
                Meta Business Settings
              </a>.
            </p>

            <div className="meta-onboarding-field">
              <label className="meta-onboarding-label">Access Token</label>
              <input
                type="password"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste your Meta access token..."
                className="meta-onboarding-input"
                autoComplete="off"
              />
            </div>

            <div className="meta-onboarding-field">
              <label className="meta-onboarding-label">
                Ad Account ID <span className="meta-onboarding-label-optional">(format: act_XXXXXXXXX)</span>
              </label>
              <input
                type="text"
                value={manualAdAccountId}
                onChange={(e) => setManualAdAccountId(e.target.value)}
                placeholder="act_123456789"
                className="meta-onboarding-input"
              />
            </div>

            <div className="meta-onboarding-field">
              <label className="meta-onboarding-label">
                Facebook Page ID <span className="meta-onboarding-label-optional">(optional)</span>
              </label>
              <input
                type="text"
                value={manualPageId}
                onChange={(e) => setManualPageId(e.target.value)}
                placeholder="123456789"
                className="meta-onboarding-input"
              />
            </div>

            <div className="meta-onboarding-field">
              <label className="meta-onboarding-label">
                Meta Pixel ID <span className="meta-onboarding-label-optional">(optional)</span>
              </label>
              <input
                type="text"
                value={manualPixelId}
                onChange={(e) => setManualPixelId(e.target.value)}
                placeholder="123456789"
                className="meta-onboarding-input"
              />
            </div>

            {manualError && <div className="meta-onboarding-error">{manualError}</div>}

            <button
              onClick={handleManualSave}
              disabled={!manualToken.trim() || manualSaving}
              className="meta-save-btn"
            >
              {manualSaving ? 'Validating & saving...' : 'Validate & Connect'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Connected but needs configuration — show dropdowns
  if (needsConfiguration) {
    const activeAccounts = (metaIds?.availableAccounts || []).filter(a => a.account_status === 1);

    return (
      <div className="meta-onboarding">
        {notification && (
          <div className={`meta-onboarding-notification ${notification.type}`}>
            <span>{notification.message}</span>
            {onDismissNotification && (
              <button onClick={onDismissNotification} className="meta-onboarding-notification-dismiss">&times;</button>
            )}
          </div>
        )}
        <div className="meta-onboarding-configure">
          <div>
            <p className="meta-onboarding-configure-title">Configure your connection</p>
            <p className="meta-onboarding-configure-desc">Select the ad account, page, and pixel to use.</p>
          </div>

          <div className="meta-onboarding-field">
            <label className="meta-onboarding-label">Ad Account</label>
            <select
              value={selectedAdAccountId}
              onChange={(e) => handleAdAccountChange(e.target.value)}
              className="meta-onboarding-select"
            >
              <option value="">Select an ad account...</option>
              {activeAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.id}) — {acc.currency}
                </option>
              ))}
            </select>
          </div>

          <div className="meta-onboarding-field">
            <label className="meta-onboarding-label">Facebook Page</label>
            <select
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
              className="meta-onboarding-select"
            >
              <option value="">Select a page...</option>
              {(metaIds?.availablePages || []).map(page => (
                <option key={page.id} value={page.id}>
                  {page.name} ({page.id})
                </option>
              ))}
            </select>
          </div>

          <div className="meta-onboarding-field">
            <label className="meta-onboarding-label">
              Meta Pixel <span className="meta-onboarding-label-optional">(optional)</span>
            </label>
            <select
              value={selectedPixelId}
              onChange={(e) => setSelectedPixelId(e.target.value)}
              disabled={!selectedAdAccountId || loadingPixels}
              className="meta-onboarding-select"
            >
              <option value="">
                {loadingPixels ? 'Loading pixels...' : !selectedAdAccountId ? 'Select an ad account first' : 'Select a pixel...'}
              </option>
              {availablePixels.map(pixel => (
                <option key={pixel.id} value={pixel.id}>
                  {pixel.name || 'Unnamed Pixel'} ({pixel.id})
                </option>
              ))}
            </select>
          </div>

          {error && <div className="meta-onboarding-error">{error}</div>}

          <button
            onClick={handleSave}
            disabled={!selectedAdAccountId || saving}
            className="meta-save-btn"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    );
  }

  // Fully configured — show success
  if (isFullyConfigured) {
    return (
      <div className="meta-onboarding">
        <div className="meta-onboarding-success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="meta-onboarding-success-text">
            Meta Ads connected{metaIds?.accountName ? ` — ${metaIds.accountName}` : ''}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
