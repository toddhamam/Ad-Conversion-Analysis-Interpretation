import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import {
  loadOrgMetaCredentials,
  getOrgMetaIds,
  disconnectMeta,
  saveMetaSelection,
  fetchAvailablePixels,
  clearOrgMetaCache,
  fetchAdAccounts,
  activateAdAccount,
  deactivateAdAccount,
  configureAdAccount,
  refreshAvailableData,
  type OrgMetaIds,
  type AdAccountInfo,
  type AdAccountListResponse,
} from '../services/metaApi';
import { PLAN_LIMITS, type BusinessType } from '../types/organization';
import { purchaseAccountBlock } from '../services/stripeApi';
import SEO from '../components/SEO';
import Loading from '../components/Loading';
import './Integrations.css';

function Integrations() {
  const { organization } = useOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  const [metaStatus, setMetaStatus] = useState<OrgMetaIds | null>(getOrgMetaIds());
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Configuration selections
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedPixelId, setSelectedPixelId] = useState('');
  const [availablePixels, setAvailablePixels] = useState<Array<{ id: string; name: string }>>([]);

  // Multi-account management state
  const [adAccountData, setAdAccountData] = useState<AdAccountListResponse | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [activatingAccount, setActivatingAccount] = useState<string | null>(null);
  const [configuringAccount, setConfiguringAccount] = useState<string | null>(null);
  const [configPageId, setConfigPageId] = useState('');
  const [configPixelId, setConfigPixelId] = useState('');
  const [configBusinessType, setConfigBusinessType] = useState<BusinessType | ''>('');
  const [configPixels, setConfigPixels] = useState<Array<{ id: string; name: string }>>([]);
  const [configPixelsLoading, setConfigPixelsLoading] = useState(false);
  const [refreshingAvailable, setRefreshingAvailable] = useState(false);

  // Determine if org supports multi-account
  const planTier = organization?.plan_tier || 'free';
  const planLimits = PLAN_LIMITS[planTier] || PLAN_LIMITS.free;
  const supportsMultiAccount = planLimits.maxAdAccounts > 1 || planLimits.maxAdAccounts === -1;

  const refreshStatus = useCallback(async () => {
    clearOrgMetaCache();
    const status = await loadOrgMetaCredentials();
    setMetaStatus(status);
    if (status) {
      setSelectedAccountId(status.adAccountId || '');
      setSelectedPageId(status.pageId || '');
      setSelectedPixelId(status.pixelId || '');
    }
    return status;
  }, []);

  const loadAdAccounts = useCallback(async () => {
    if (!supportsMultiAccount) return;
    setAccountsLoading(true);
    try {
      const data = await fetchAdAccounts();
      setAdAccountData(data);
    } catch (err) {
      console.warn('Failed to load ad accounts:', err);
    } finally {
      setAccountsLoading(false);
    }
  }, [supportsMultiAccount]);

  // Load status on mount
  useEffect(() => {
    const init = async () => {
      await refreshStatus();
      await loadAdAccounts();
      setLoading(false);
    };
    init();
  }, [refreshStatus, loadAdAccounts]);

  // Handle OAuth redirect callback
  useEffect(() => {
    if (searchParams.get('meta_connected') === 'true') {
      setMessage({ type: 'success', text: 'Meta Ads account connected successfully.' });
      searchParams.delete('meta_connected');
      setSearchParams(searchParams, { replace: true });
      refreshStatus();
      loadAdAccounts();
    }
    if (searchParams.get('error')) {
      const errorMsg = searchParams.get('message') || 'Failed to connect Meta account.';
      setMessage({ type: 'error', text: errorMsg });
      searchParams.delete('error');
      searchParams.delete('message');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, refreshStatus, loadAdAccounts]);

  // Fetch pixels when ad account changes
  useEffect(() => {
    if (selectedAccountId && metaStatus?.connected) {
      fetchAvailablePixels(selectedAccountId)
        .then(setAvailablePixels)
        .catch(() => setAvailablePixels([]));
    }
  }, [selectedAccountId, metaStatus?.connected]);

  const handleConnect = () => {
    if (!organization?.id) {
      setMessage({ type: 'error', text: 'Organization not loaded. Please refresh and try again.' });
      return;
    }
    window.location.href = `/api/auth/meta/connect?organizationId=${organization.id}&returnUrl=/integrations`;
  };

  const handleReauthorize = () => {
    if (!organization?.id) {
      setMessage({ type: 'error', text: 'Organization not loaded. Please refresh and try again.' });
      return;
    }
    // Force the consent screen so the user can re-select pages/accounts
    window.location.href = `/api/auth/meta/connect?organizationId=${organization.id}&returnUrl=/integrations&reauth=true`;
  };

  const handleRefreshAvailable = async () => {
    setRefreshingAvailable(true);
    setMessage(null);
    try {
      const result = await refreshAvailableData();
      await refreshStatus();
      await loadAdAccounts();
      if (result.selectionsCleared) {
        setMessage({ type: 'success', text: 'Available accounts and pages refreshed. Some previously selected items were cleared because they are no longer accessible.' });
      } else {
        setMessage({ type: 'success', text: 'Available accounts and pages refreshed.' });
      }
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to refresh available data.' });
    } finally {
      setRefreshingAvailable(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Meta Ads account? This will remove your saved credentials.')) return;

    setDisconnecting(true);
    setMessage(null);
    try {
      await disconnectMeta();
      setMetaStatus(null);
      setSelectedAccountId('');
      setSelectedPageId('');
      setSelectedPixelId('');
      setAvailablePixels([]);
      setAdAccountData(null);
      setMessage({ type: 'success', text: 'Meta Ads account disconnected.' });
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to disconnect.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedAccountId) return;

    setSavingConfig(true);
    setMessage(null);
    try {
      await saveMetaSelection({
        adAccountId: selectedAccountId,
        pageId: selectedPageId || null,
        pixelId: selectedPixelId || null,
      });
      await refreshStatus();
      setMessage({ type: 'success', text: 'Configuration saved.' });
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save configuration.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleActivateAccount = async (adAccountId: string) => {
    setActivatingAccount(adAccountId);
    setMessage(null);
    try {
      await activateAdAccount(adAccountId);
      await loadAdAccounts();
      await refreshStatus();
      setMessage({ type: 'success', text: 'Ad account activated.' });
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to activate account.' });
    } finally {
      setActivatingAccount(null);
    }
  };

  const handleDeactivateAccount = async (adAccountId: string, accountName: string | null) => {
    if (!confirm(`Are you sure you want to deactivate ${accountName || adAccountId}? Data will be preserved.`)) return;
    setMessage(null);
    try {
      await deactivateAdAccount(adAccountId);
      await loadAdAccounts();
      await refreshStatus();
      setMessage({ type: 'success', text: 'Ad account deactivated. Seat freed.' });
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to deactivate account.' });
    }
  };

  const handleStartConfigure = (account: AdAccountInfo) => {
    setConfiguringAccount(account.ad_account_id);
    setConfigPageId(account.page_id || '');
    setConfigPixelId(account.pixel_id || '');
    setConfigBusinessType(account.business_type || '');

    // Load available pixels for this ad account
    setConfigPixels([]);
    setConfigPixelsLoading(true);
    fetchAvailablePixels(account.ad_account_id)
      .then(setConfigPixels)
      .catch(() => setConfigPixels([]))
      .finally(() => setConfigPixelsLoading(false));
  };

  const handleSaveAccountConfig = async () => {
    if (!configuringAccount) return;
    if (!configPixelId) {
      setMessage({ type: 'error', text: 'Please select a Meta Pixel before saving. A pixel is required for conversion tracking.' });
      return;
    }
    setMessage(null);
    try {
      await configureAdAccount(configuringAccount, {
        pageId: configPageId || null,
        pixelId: configPixelId || null,
        businessType: configBusinessType || null,
      });
      setConfiguringAccount(null);
      await loadAdAccounts();
      await refreshStatus();
      setMessage({ type: 'success', text: 'Account configuration saved.' });
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save configuration.' });
    }
  };

  const isConnected = metaStatus?.connected === true;
  const isExpired = metaStatus?.status === 'expired';
  const statusLabel = isConnected ? 'Connected' : isExpired ? 'Token Expired' : 'Not Connected';
  const statusClass = isConnected ? 'connected' : isExpired ? 'expired' : 'disconnected';

  // Track whether config has unsaved changes
  const hasUnsavedChanges = isConnected && (
    selectedAccountId !== (metaStatus?.adAccountId || '') ||
    selectedPageId !== (metaStatus?.pageId || '') ||
    selectedPixelId !== (metaStatus?.pixelId || '')
  );

  // Build list of available (not yet activated) accounts
  const activatedAccountIds = new Set(
    (adAccountData?.accounts || []).map(a => a.ad_account_id)
  );
  const availableForActivation = (metaStatus?.availableAccounts || []).filter(
    acct => !activatedAccountIds.has(acct.id)
  );
  const isUnlimitedSeats = (adAccountData?.seats ?? 1) === -1;
  const seatsRemaining = isUnlimitedSeats ? Infinity : (adAccountData?.seats || 1) - (adAccountData?.seatsUsed || 0);

  if (loading) {
    return <Loading size="large" message="ConversionIQ™ syncing channels..." />;
  }

  return (
    <div className="integrations-page">
      <SEO title="Integrations | Conversion Intelligence" noindex />

      <div className="integrations-header">
        <h1>Integrations</h1>
        <p>Manage your connected advertising platforms</p>
      </div>

      {message && (
        <div className={`integration-message ${message.type}`}>
          {message.type === 'success' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="integrations-list">
        {/* Meta Ads Integration */}
        <div className="integration-card">
          <div className="integration-card-header">
            <div className="integration-icon meta">
              <svg viewBox="0 0 24 24" fill="white">
                <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.93 3.78-3.93 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z"/>
              </svg>
            </div>
            <div className="integration-title-row">
              <h3>
                Meta Ads
                <span className={`integration-status-badge ${statusClass}`}>
                  <span className={`status-dot ${statusClass}`} />
                  {statusLabel}
                </span>
              </h3>
              <p>Connect your Meta ad account to analyze creatives and publish ads</p>
            </div>
          </div>

          {/* Configuration Dropdowns (single-account mode only) */}
          {isConnected && !supportsMultiAccount && (
            <div className="integration-config">
              {metaStatus?.availableAccounts && metaStatus.availableAccounts.length > 0 && (
                <div className="config-form">
                  <div className="config-group">
                    <label>Ad Account</label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                    >
                      <option value="">-- Select ad account --</option>
                      {metaStatus.availableAccounts.map((acct) => (
                        <option key={acct.id} value={acct.id}>
                          {acct.name} ({acct.id}) — {acct.currency}
                        </option>
                      ))}
                    </select>
                  </div>

                  {metaStatus?.availablePages && metaStatus.availablePages.length > 0 && (
                    <div className="config-group">
                      <label>Facebook Page</label>
                      <select
                        value={selectedPageId}
                        onChange={(e) => setSelectedPageId(e.target.value)}
                      >
                        <option value="">-- Select page --</option>
                        {metaStatus.availablePages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.name} ({page.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {availablePixels.length > 0 && (
                    <div className="config-group">
                      <label>Meta Pixel</label>
                      <select
                        value={selectedPixelId}
                        onChange={(e) => setSelectedPixelId(e.target.value)}
                      >
                        <option value="">-- Select pixel --</option>
                        {availablePixels.map((pixel) => (
                          <option key={pixel.id} value={pixel.id}>
                            {pixel.name} ({pixel.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {hasUnsavedChanges && (
                    <div className="integration-actions">
                      <button
                        className="save-config-button"
                        onClick={handleSaveConfig}
                        disabled={!selectedAccountId || savingConfig}
                      >
                        {savingConfig && <span className="btn-spinner" />}
                        {savingConfig ? 'Saving...' : 'Save Configuration'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="integration-actions">
            {!isConnected && !isExpired && (
              <button className="connect-button" onClick={handleConnect}>
                <svg viewBox="0 0 24 24" fill="white">
                  <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.93 3.78-3.93 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z"/>
                </svg>
                Connect via Facebook
              </button>
            )}
            {isExpired && (
              <button className="connect-button" onClick={handleConnect}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Reconnect
              </button>
            )}
            {isConnected && (
              <button className="reauthorize-button" onClick={handleReauthorize}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6"/>
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  <path d="M3 22v-6h6"/>
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                Update Permissions
              </button>
            )}
            {(isConnected || isExpired) && (
              <button
                className="disconnect-button"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting && <span className="btn-spinner" />}
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            )}
          </div>
          {isConnected && (
            <p className="integration-hint">
              Don't see all your pages or ad accounts? Click <strong>Update Permissions</strong> to re-authorize and grant access to additional assets.
            </p>
          )}
        </div>

        {/* ── Ad Accounts (multi-account management) ──────────────────────────── */}
        {supportsMultiAccount && isConnected && (
          <div className="integration-card">
            <div className="integration-card-header">
              <div className="integration-icon ad-accounts">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 3h-8l-2 4h12l-2-4z" />
                </svg>
              </div>
              <div className="integration-title-row">
                <h3>
                  Ad Accounts
                  {adAccountData && (
                    <span className="seat-badge">
                      {adAccountData.seats === -1
                        ? `${adAccountData.seatsUsed} seats · Unlimited`
                        : `${adAccountData.seatsUsed} of ${adAccountData.seats} seats`}
                    </span>
                  )}
                </h3>
                <p>Manage which ad accounts are active in your workspace</p>
              </div>
            </div>

            {accountsLoading ? (
              <Loading size="small" message="ConversionIQ™ syncing accounts..." />
            ) : (
              <>
                {/* Activated accounts */}
                {adAccountData && adAccountData.accounts.length > 0 && (
                  <div className="ad-accounts-list">
                    {adAccountData.accounts.map((account) => (
                      <div key={account.ad_account_id} className="ad-account-row">
                        <div className="ad-account-row-main">
                          <span
                            className="ad-account-dot"
                            style={{
                              background: account.page_id && account.pixel_id ? '#22c55e' : '#f59e0b',
                            }}
                          />
                          <div className="ad-account-row-info">
                            <span className="ad-account-row-name">
                              {account.ad_account_name || account.ad_account_id}
                            </span>
                            <span className="ad-account-row-detail">
                              {account.ad_account_id}
                              {account.currency ? ` · ${account.currency}` : ''}
                              {account.business_type ? ` · ${account.business_type === 'leadgen' ? 'Lead Gen' : 'E-Commerce'}` : ''}
                              {account.page_id ? '' : ' · Needs page setup'}
                              {account.pixel_id ? '' : ' · Needs pixel setup'}
                            </span>
                          </div>
                          <div className="ad-account-row-actions">
                            <button
                              className="ad-account-config-btn"
                              onClick={() => handleStartConfigure(account)}
                            >
                              Configure
                            </button>
                            <button
                              className="ad-account-deactivate-btn"
                              onClick={() => handleDeactivateAccount(account.ad_account_id, account.ad_account_name)}
                            >
                              Deactivate
                            </button>
                          </div>
                        </div>

                        {/* Inline configure panel */}
                        {configuringAccount === account.ad_account_id && (
                          <div className="ad-account-configure-panel">
                            <div className="config-group">
                              <div className="config-label-row">
                                <label>Facebook Page</label>
                                <button
                                  className="config-refresh-btn"
                                  onClick={handleRefreshAvailable}
                                  disabled={refreshingAvailable}
                                  title="Refresh available pages from Meta"
                                >
                                  {refreshingAvailable ? (
                                    <span className="btn-spinner" />
                                  ) : (
                                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M14 2v4h-4"/>
                                      <path d="M2 8a6 6 0 0 1 10.3-4.2L14 6"/>
                                      <path d="M2 14v-4h4"/>
                                      <path d="M14 8a6 6 0 0 1-10.3 4.2L2 10"/>
                                    </svg>
                                  )}
                                  Refresh
                                </button>
                              </div>
                              {metaStatus?.availablePages && metaStatus.availablePages.length > 0 ? (
                                <select
                                  value={configPageId}
                                  onChange={(e) => setConfigPageId(e.target.value)}
                                >
                                  <option value="">-- Select page --</option>
                                  {metaStatus.availablePages.map((page) => (
                                    <option key={page.id} value={page.id}>
                                      {page.name} ({page.id})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <p className="config-empty-hint">
                                  No pages available. Click <strong>Refresh</strong> or <strong>Update Permissions</strong> above to grant access to your Facebook Pages.
                                </p>
                              )}
                            </div>
                            <div className="config-group">
                              <label>Meta Pixel <span className="config-required">*</span></label>
                              {configPixelsLoading ? (
                                <p className="config-empty-hint">Loading available pixels...</p>
                              ) : configPixels.length > 0 ? (
                                <select
                                  value={configPixelId}
                                  onChange={(e) => setConfigPixelId(e.target.value)}
                                >
                                  <option value="">-- Select pixel --</option>
                                  {configPixels.map((pixel) => (
                                    <option key={pixel.id} value={pixel.id}>
                                      {pixel.name} ({pixel.id})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <p className="config-empty-hint">
                                  No pixels found for this ad account. Create a pixel in Meta Events Manager first.
                                </p>
                              )}
                              <p className="config-hint">Required for conversion tracking and campaign optimization</p>
                            </div>
                            <div className="config-group">
                              <label>Business Type</label>
                              <select
                                value={configBusinessType}
                                onChange={(e) => setConfigBusinessType(e.target.value as BusinessType | '')}
                              >
                                <option value="">Use organization default ({organization?.business_type === 'leadgen' ? 'Lead Gen' : 'E-Commerce'})</option>
                                <option value="ecommerce">E-Commerce</option>
                                <option value="leadgen">Lead Generation</option>
                              </select>
                              <p className="config-hint">
                                Controls ConversionIQ™ metrics, labels, and AI analysis for this account
                              </p>
                            </div>
                            <div className="ad-account-configure-actions">
                              <button
                                className="save-config-button"
                                onClick={handleSaveAccountConfig}
                              >
                                Save
                              </button>
                              <button
                                className="cancel-config-button"
                                onClick={() => setConfiguringAccount(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Available accounts (not yet activated) */}
                {availableForActivation.length > 0 && (
                  <div className="ad-accounts-available">
                    <div className="ad-accounts-available-header">Available Accounts</div>
                    {availableForActivation.map((acct) => (
                      <div key={acct.id} className="ad-account-row available">
                        <div className="ad-account-row-main">
                          <span className="ad-account-dot" style={{ background: '#94a3b8' }} />
                          <div className="ad-account-row-info">
                            <span className="ad-account-row-name">{acct.name}</span>
                            <span className="ad-account-row-detail">
                              {acct.id} · {acct.currency}
                            </span>
                          </div>
                          <div className="ad-account-row-actions">
                            {seatsRemaining > 0 ? (
                              <button
                                className="ad-account-activate-btn"
                                onClick={() => handleActivateAccount(acct.id)}
                                disabled={activatingAccount === acct.id}
                              >
                                {activatingAccount === acct.id ? (
                                  <><span className="btn-spinner" /> Activating...</>
                                ) : (
                                  'Activate'
                                )}
                              </button>
                            ) : (
                              <span className="ad-account-seats-full">No seats available</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Seat limit notice — show block purchase options */}
                {seatsRemaining <= 0 && availableForActivation.length > 0 && (
                  <div className="ad-accounts-upgrade-prompt">
                    <span className="upgrade-prompt-title">Need more seats?</span>
                    <div className="account-block-options">
                      {([
                        { size: '5' as const, seats: 5, price: 20 },
                        { size: '10' as const, seats: 10, price: 40 },
                        { size: '25' as const, seats: 25, price: 75 },
                      ]).map((block) => (
                        <button
                          key={block.size}
                          className="account-block-btn"
                          onClick={() => purchaseAccountBlock(block.size)}
                        >
                          +{block.seats} seats — ${block.price}/mo
                        </button>
                      ))}
                    </div>
                    <Link to="/billing" className="upgrade-link">Or upgrade your plan</Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Google Ads — Coming Soon */}
        <div className="integration-card coming-soon">
          <div className="integration-card-header">
            <div className="integration-icon google">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            <div className="integration-title-row">
              <h3>
                Google Ads
                <span className="coming-soon-badge">Coming Soon</span>
              </h3>
              <p>Import Google Ads campaign data for cross-channel analysis</p>
            </div>
          </div>
        </div>

        {/* TikTok Ads — Coming Soon */}
        <div className="integration-card coming-soon">
          <div className="integration-card-header">
            <div className="integration-icon tiktok">
              <svg viewBox="0 0 24 24" fill="var(--text-secondary)">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88A2.89 2.89 0 0 1 9.5 12.4c.31 0 .61.05.89.13V9.04a6.26 6.26 0 0 0-.89-.06 6.33 6.33 0 0 0-6.33 6.33 6.33 6.33 0 0 0 6.33 6.34A6.33 6.33 0 0 0 15.83 15.31V8.97a8.21 8.21 0 0 0 4.83 1.56V7.08a4.85 4.85 0 0 1-1.07-.39z"/>
              </svg>
            </div>
            <div className="integration-title-row">
              <h3>
                TikTok Ads
                <span className="coming-soon-badge">Coming Soon</span>
              </h3>
              <p>Connect TikTok Ads Manager for creative performance insights</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Integrations;
