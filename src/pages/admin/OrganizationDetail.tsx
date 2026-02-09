import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getAuthToken } from '../../lib/authToken';
import Loading from '../../components/Loading';
import type { Organization, User, OrganizationInvitation } from '../../types/organization';

interface MetaCredentialStatus {
  connected: boolean;
  status: string;
  adAccountId: string | null;
  pageId: string | null;
  pixelId: string | null;
  businessId: string | null;
  tokenExpiresAt: string | null;
  scopes: string[] | null;
  lastError: string | null;
  accountName: string | null;
  connectedAt: string | null;
}

interface ValidationResult {
  valid: boolean;
  tokenInfo?: {
    appId: string;
    type: string;
    scopes: string[];
    expiresAt: string | null;
    isValid: boolean;
  };
  accountInfo?: {
    id: string;
    name: string;
    accountStatus: number;
    currency: string;
  };
  errors: string[];
}

function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [metaStatus, setMetaStatus] = useState<MetaCredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'meta' | 'settings'>('overview');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Meta Setup tab state
  const [manualToken, setManualToken] = useState('');
  const [manualAdAccountId, setManualAdAccountId] = useState('');
  const [manualPageId, setManualPageId] = useState('');
  const [manualPixelId, setManualPixelId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (id) {
      loadOrganizationData();
    }
  }, [id]);

  // Handle OAuth callback query params
  useEffect(() => {
    const metaConnected = searchParams.get('meta_connected');
    const adAccount = searchParams.get('ad_account');
    const error = searchParams.get('error');
    const message = searchParams.get('message');

    if (metaConnected === 'true') {
      setNotification({
        type: 'success',
        message: `Meta Ads connected successfully${adAccount ? ` (${adAccount})` : ''}`,
      });
      // Clear query params
      setSearchParams({});
    } else if (error) {
      setNotification({
        type: 'error',
        message: message || 'Failed to connect Meta Ads',
      });
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const loadOrganizationData = async () => {
    if (!isSupabaseConfigured()) {
      // Mock data for development
      setOrganization({
        id: id || '1',
        name: 'Acme Corp',
        slug: 'acme-corp',
        logo_url: null,
        primary_color: '#d4e157',
        secondary_color: '#a855f7',
        stripe_customer_id: 'cus_abc123',
        plan_tier: 'enterprise',
        billing_interval: 'monthly',
        subscription_status: 'active',
        subscription_id: 'sub_abc123',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        setup_mode: 'white_glove',
        setup_completed: false,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      });
      setUsers([
        {
          id: 'u1',
          auth_id: 'auth1',
          email: 'jane@acme.com',
          full_name: 'Jane Smith',
          avatar_url: null,
          organization_id: id || '1',
          role: 'owner',
          is_super_admin: false,
          status: 'active',
          last_login_at: '2024-03-15T14:30:00Z',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
      ]);
      setInvitations([]);
      setMetaStatus(null);
      setLoading(false);
      return;
    }

    try {
      // Load organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id)
        .single();

      if (orgError) throw orgError;
      setOrganization(org as Organization);

      // Load users
      const { data: orgUsers } = await supabase
        .from('users')
        .select('*')
        .eq('organization_id', id);

      setUsers((orgUsers as User[]) || []);

      // Load pending invitations
      const { data: orgInvites } = await supabase
        .from('organization_invitations')
        .select('*')
        .eq('organization_id', id)
        .is('accepted_at', null);

      setInvitations((orgInvites as OrganizationInvitation[]) || []);

      // Load Meta credential status via admin API
      await loadMetaStatus();
    } catch (error) {
      console.error('Failed to load organization:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMetaStatus = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch(`/api/admin/credentials/status?organizationId=${id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMetaStatus(data as MetaCredentialStatus);
      }
    } catch (err) {
      console.error('Failed to load Meta status:', err);
    }
  };

  const handleConnectMeta = () => {
    // Redirect to Meta OAuth flow
    const returnUrl = `/admin/organizations/${id}`;
    window.location.href = `/api/auth/meta/connect?organizationId=${id}&returnUrl=${encodeURIComponent(returnUrl)}`;
  };

  const handleDisconnectMeta = async () => {
    if (!confirm('Are you sure you want to disconnect Meta Ads? You will need to reconnect to access ad data.')) {
      return;
    }

    try {
      const token = await getAuthToken();
      if (!token) {
        setMetaStatus(null);
        setNotification({ type: 'success', message: 'Meta Ads disconnected' });
        return;
      }

      const res = await fetch(`/api/admin/credentials/disconnect?organizationId=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to disconnect');
      setMetaStatus(null);
      setValidationResult(null);
      setNotification({ type: 'success', message: 'Meta Ads disconnected successfully' });
    } catch (error) {
      console.error('Failed to disconnect Meta:', error);
      setNotification({ type: 'error', message: 'Failed to disconnect Meta Ads' });
    }
  };

  const handleValidateCredentials = async () => {
    if (!manualToken) {
      setNotification({ type: 'error', message: 'Access token is required' });
      return;
    }

    setValidating(true);
    setValidationResult(null);

    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/credentials/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          accessToken: manualToken,
          adAccountId: manualAdAccountId || undefined,
        }),
      });

      const result = await res.json();
      setValidationResult(result as ValidationResult);

      if (result.valid) {
        setNotification({ type: 'success', message: 'Credentials validated successfully' });
        // Auto-populate account name if available
        if (result.accountInfo?.name && !manualAdAccountId) {
          setManualAdAccountId(result.accountInfo.id);
        }
      } else {
        setNotification({ type: 'error', message: result.errors?.[0] || 'Validation failed' });
      }
    } catch (error) {
      console.error('Validation failed:', error);
      setNotification({ type: 'error', message: 'Failed to validate credentials' });
    } finally {
      setValidating(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!manualToken) {
      setNotification({ type: 'error', message: 'Access token is required' });
      return;
    }

    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/credentials/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          organizationId: id,
          accessToken: manualToken,
          adAccountId: manualAdAccountId || undefined,
          pageId: manualPageId || undefined,
          pixelId: manualPixelId || undefined,
          accountName: validationResult?.accountInfo?.name || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }

      setNotification({ type: 'success', message: 'Meta credentials saved successfully' });
      setManualToken('');
      setManualAdAccountId('');
      setManualPageId('');
      setManualPixelId('');
      setValidationResult(null);
      setShowToken(false);
      await loadMetaStatus();
    } catch (error) {
      console.error('Save failed:', error);
      setNotification({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save credentials' });
    } finally {
      setSaving(false);
    }
  };

  const isMetaConnected = metaStatus?.connected === true;
  const isMetaExpired = metaStatus?.status === 'expired';

  const handleDeleteOrganization = async () => {
    if (!confirm('Are you sure you want to delete this organization? This action cannot be undone.')) {
      return;
    }

    if (!isSupabaseConfigured()) {
      navigate('/admin/organizations');
      return;
    }

    try {
      const { error } = await supabase.from('organizations').delete().eq('id', id);
      if (error) throw error;
      navigate('/admin/organizations');
    } catch (error) {
      console.error('Failed to delete organization:', error);
      alert('Failed to delete organization. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
        <Loading size="large" message="ConversionIQ™ loading organization..." />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="admin-card" style={{ textAlign: 'center', padding: '60px' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Organization not found</p>
        <Link to="/admin/organizations" className="admin-btn admin-btn-secondary">
          Back to Organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="admin-org-detail">
      {/* Breadcrumb Navigation */}
      <nav className="admin-breadcrumb" style={{ marginBottom: '20px' }}>
        <Link to="/admin" className="admin-breadcrumb-link">Dashboard</Link>
        <span className="admin-breadcrumb-separator">/</span>
        <Link to="/admin/organizations" className="admin-breadcrumb-link">Organizations</Link>
        <span className="admin-breadcrumb-separator">/</span>
        <span className="admin-breadcrumb-current">{organization.name}</span>
      </nav>

      {/* Notification Banner */}
      {notification && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '24px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: notification.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${notification.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
            color: notification.type === 'success' ? '#22c55e' : '#dc2626',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'inherit',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {organization.logo_url ? (
            <img
              src={organization.logo_url}
              alt={organization.name}
              style={{ width: '64px', height: '64px', borderRadius: '12px', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '12px',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--text-muted)',
              }}
            >
              {organization.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="admin-page-title" style={{ marginBottom: '4px' }}>{organization.name}</h1>
            <p className="admin-page-subtitle" style={{ marginBottom: '0' }}>
              <a
                href={`https://${organization.slug}.convertra.io`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-violet)' }}
              >
                {organization.slug}.convertra.io
              </a>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span className={`admin-badge-pill ${organization.plan_tier}`}>
            {organization.plan_tier.charAt(0).toUpperCase() + organization.plan_tier.slice(1)}
          </span>
          <span className={`admin-badge-pill ${organization.subscription_status === 'active' ? 'active' : 'inactive'}`}>
            {organization.subscription_status}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '0' }}>
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'meta', label: 'Meta Setup' },
          { key: 'users', label: 'Users' },
          { key: 'settings', label: 'Settings' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent-violet)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.key ? 600 : 500,
              fontSize: '14px',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
            {tab.key === 'meta' && (
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                marginLeft: '8px',
                background: isMetaConnected ? '#22c55e' : isMetaExpired ? '#f59e0b' : '#94a3b8',
              }} />
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Quick Stats */}
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-icon users">
                <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                </svg>
              </div>
              <div className="admin-stat-content">
                <div className="admin-stat-value">{users.length}</div>
                <div className="admin-stat-label">Team Members</div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon active">
                <svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <div className="admin-stat-content">
                <div className="admin-stat-value">0</div>
                <div className="admin-stat-label">Creatives Generated</div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon organizations">
                <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              </div>
              <div className="admin-stat-content">
                <div className="admin-stat-value">0</div>
                <div className="admin-stat-label">Analyses Run</div>
              </div>
            </div>
          </div>

          {/* Integrations */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h2 className="admin-card-title">Integrations</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: isMetaConnected ? 'rgba(34, 197, 94, 0.05)' : isMetaExpired ? 'rgba(251, 191, 36, 0.05)' : 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: isMetaConnected ? '1px solid rgba(34, 197, 94, 0.2)' : isMetaExpired ? '1px solid rgba(251, 191, 36, 0.2)' : '1px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Meta Ads Manager</div>
                    {isMetaConnected ? (
                      <div style={{ fontSize: '13px', color: '#22c55e' }}>
                        Connected{metaStatus?.accountName ? ` — ${metaStatus.accountName}` : ''}
                      </div>
                    ) : isMetaExpired ? (
                      <div style={{ fontSize: '13px', color: '#f59e0b' }}>Token expired — reconnect required</div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Not connected</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('meta')}
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '8px 16px' }}
                >
                  {isMetaConnected ? 'Manage' : 'Set Up'}
                </button>
              </div>
            </div>
          </div>

          {/* Setup Status */}
          {!organization.setup_completed && (() => {
            const ownerActive = users.some(u => u.role === 'owner' && u.status === 'active');
            const hasPageId = !!metaStatus?.pageId;
            const hasPixelId = !!metaStatus?.pixelId;
            const checklist = [
              { label: 'Organization created', done: true },
              { label: 'Owner account active', done: ownerActive, tab: 'users' as const },
              { label: 'Meta Ads connected', done: !!isMetaConnected, tab: 'meta' as const },
              { label: 'Ad Account ID configured', done: !!metaStatus?.adAccountId, tab: 'meta' as const },
              { label: 'Page ID configured', done: hasPageId, tab: 'meta' as const },
              { label: 'Pixel ID configured (optional)', done: hasPixelId, tab: 'meta' as const },
            ];
            const requiredDone = checklist.filter((_, i) => i < 5).every(c => c.done);

            return (
              <div className="admin-card" style={{ borderColor: 'var(--accent-violet)', background: 'rgba(168, 85, 247, 0.05)' }}>
                <div className="admin-card-header">
                  <h2 className="admin-card-title">Setup Checklist</h2>
                  <span className="admin-badge-pill" style={{ background: requiredDone ? '#22c55e' : 'var(--accent-violet)', color: 'white' }}>
                    {requiredDone ? 'Ready' : 'In Progress'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {checklist.map((item, i) => (
                    <div
                      key={i}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: item.tab ? 'pointer' : 'default' }}
                      onClick={item.tab ? () => setActiveTab(item.tab!) : undefined}
                    >
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        background: item.done ? '#22c55e' : 'transparent',
                        border: item.done ? 'none' : '2px solid var(--border-primary)',
                      }}>
                        {item.done && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span style={{
                        fontSize: '14px',
                        color: item.done ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: item.done ? 'line-through' : 'none',
                      }}>
                        {item.label}
                      </span>
                      {!item.done && item.tab && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Meta Setup Tab */}
      {activeTab === 'meta' && (
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Connection Status */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h2 className="admin-card-title">Connection Status</h2>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '100px',
                fontSize: '12px',
                fontWeight: 600,
                background: isMetaConnected ? 'rgba(34, 197, 94, 0.1)' : isMetaExpired ? 'rgba(251, 191, 36, 0.1)' : 'var(--bg-secondary)',
                color: isMetaConnected ? '#16a34a' : isMetaExpired ? '#d97706' : 'var(--text-muted)',
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isMetaConnected ? '#22c55e' : isMetaExpired ? '#f59e0b' : '#94a3b8',
                }} />
                {isMetaConnected ? 'Connected' : isMetaExpired ? 'Expired' : 'Not Connected'}
              </span>
            </div>

            {isMetaConnected || isMetaExpired ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Account Name</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {metaStatus?.accountName || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Ad Account ID</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {metaStatus?.adAccountId || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Page ID</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {metaStatus?.pageId || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Pixel ID</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {metaStatus?.pixelId || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Token Expires</div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: isMetaExpired ? '#dc2626' : 'var(--text-primary)',
                  }}>
                    {metaStatus?.tokenExpiresAt
                      ? new Date(metaStatus.tokenExpiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Connected</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {metaStatus?.connectedAt
                      ? new Date(metaStatus.connectedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                No Meta Ads connection configured. Use one of the methods below to connect.
              </p>
            )}

            {(isMetaConnected || isMetaExpired) && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-primary)', display: 'flex', gap: '8px' }}>
                <button onClick={handleDisconnectMeta} className="admin-btn admin-btn-danger" style={{ padding: '8px 16px' }}>
                  Disconnect
                </button>
              </div>
            )}

            {metaStatus?.lastError && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#dc2626',
              }}>
                Last error: {metaStatus.lastError}
              </div>
            )}
          </div>

          {/* Connect via OAuth */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h2 className="admin-card-title">Option 1: Connect via Facebook</h2>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              Quick setup for clients who can authorize via Facebook login. This grants access through OAuth and automatically configures the ad account.
            </p>
            <button onClick={handleConnectMeta} className="admin-btn admin-btn-primary" style={{ padding: '10px 20px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1e293b" style={{ marginRight: '4px' }}>
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              {isMetaConnected ? 'Reconnect via Facebook' : 'Connect via Facebook'}
            </button>
          </div>

          {/* Manual Entry */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h2 className="admin-card-title">Option 2: Manual Credential Entry</h2>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              For System User tokens from Meta Business Manager. Use this when you have the client's credentials directly.
            </p>

            <div className="admin-form">
              {/* Access Token */}
              <div className="admin-form-group">
                <label className="admin-form-label">Access Token *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showToken ? 'text' : 'password'}
                    className="admin-form-input"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="System User token from Meta Business Manager"
                    style={{ paddingRight: '48px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                </div>
                <span className="admin-form-help">The token is encrypted at rest and never exposed to the client's browser.</span>
              </div>

              {/* Ad Account ID + Page ID */}
              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label className="admin-form-label">Ad Account ID</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    value={manualAdAccountId}
                    onChange={(e) => setManualAdAccountId(e.target.value)}
                    placeholder="act_XXXXXXXXX"
                  />
                  <span className="admin-form-help">Business Settings &rarr; Ad Accounts</span>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Page ID</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    value={manualPageId}
                    onChange={(e) => setManualPageId(e.target.value)}
                    placeholder="XXXXXXXXXXXXXXXXX"
                  />
                  <span className="admin-form-help">Facebook Page &rarr; About &rarr; Page ID</span>
                </div>
              </div>

              {/* Pixel ID */}
              <div className="admin-form-group">
                <label className="admin-form-label">Pixel ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="text"
                  className="admin-form-input"
                  value={manualPixelId}
                  onChange={(e) => setManualPixelId(e.target.value)}
                  placeholder="XXXXXXXXXXXXXXXXX"
                  style={{ maxWidth: '400px' }}
                />
                <span className="admin-form-help">Events Manager &rarr; Data Sources &rarr; Pixel &rarr; Settings</span>
              </div>

              {/* Validation Result */}
              {validationResult && (
                <div style={{
                  padding: '16px',
                  borderRadius: '8px',
                  background: validationResult.valid ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${validationResult.valid ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: validationResult.valid ? '#16a34a' : '#dc2626', marginBottom: '8px' }}>
                    {validationResult.valid ? 'Validation Passed' : 'Validation Failed'}
                  </div>

                  {validationResult.tokenInfo && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      <div>Token type: <strong>{validationResult.tokenInfo.type}</strong></div>
                      <div>Scopes: {validationResult.tokenInfo.scopes.join(', ') || 'none'}</div>
                      {validationResult.tokenInfo.expiresAt && (
                        <div>Expires: {new Date(validationResult.tokenInfo.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                      )}
                    </div>
                  )}

                  {validationResult.accountInfo && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      <div>Account: <strong>{validationResult.accountInfo.name}</strong> ({validationResult.accountInfo.id})</div>
                      <div>Currency: {validationResult.accountInfo.currency}</div>
                    </div>
                  )}

                  {validationResult.errors.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: '20px', fontSize: '13px', color: '#dc2626' }}>
                      {validationResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handleValidateCredentials}
                  className="admin-btn admin-btn-secondary"
                  disabled={validating || !manualToken}
                  style={{ padding: '10px 20px' }}
                >
                  {validating ? 'Validating...' : 'Validate'}
                </button>
                <button
                  onClick={handleSaveCredentials}
                  className="admin-btn admin-btn-primary"
                  disabled={saving || !manualToken}
                  style={{ padding: '10px 20px' }}
                >
                  {saving ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </div>
          </div>

          {/* Setup Guide */}
          <div className="admin-card">
            <button
              onClick={() => setGuideOpen(!guideOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <h2 className="admin-card-title" style={{ margin: 0 }}>Setup Guide</h2>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-muted)"
                strokeWidth="2"
                style={{ transform: guideOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {guideOpen && (
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Getting a Token */}
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                    Getting a Meta Access Token
                  </h3>
                  <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    <li>Go to <strong>business.facebook.com</strong> &rarr; Business Settings &rarr; System Users</li>
                    <li>Create a System User with <strong>Admin</strong> role (not Employee)</li>
                    <li>Click <strong>"Generate New Token"</strong> and select your app</li>
                    <li>Grant these scopes: <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>ads_management</code>, <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>ads_read</code>, <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>pages_read_engagement</code>, <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>business_management</code>, <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>read_insights</code></li>
                    <li>Assign the System User access to: the <strong>Ad Account</strong>, the <strong>Page</strong>, and the <strong>Pixel</strong></li>
                    <li>Accept the <strong>Non-Discrimination Policy</strong></li>
                  </ol>
                </div>

                {/* Finding Ad Account ID */}
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    Finding the Ad Account ID
                  </h3>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Business Manager &rarr; Business Settings &rarr; Accounts &rarr; Ad Accounts. The ID starts with <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>act_</code> followed by numbers.
                  </p>
                </div>

                {/* Finding Page ID */}
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    Finding the Page ID
                  </h3>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Go to the Facebook Page &rarr; About &rarr; Page Transparency section &rarr; Page ID. It's a long numeric string.
                  </p>
                </div>

                {/* Finding Pixel ID */}
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    Finding the Pixel ID
                  </h3>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Events Manager &rarr; Data Sources &rarr; select your Pixel &rarr; Settings. The Pixel ID is a numeric string. This is optional but required for conversion tracking with Sales campaigns.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h2 className="admin-card-title">Team Members</h2>
          </div>

          {/* Active Users */}
          {users.length > 0 ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: 'var(--bg-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {user.full_name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{user.full_name}</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize' }}>{user.role}</span>
                    </td>
                    <td>
                      <span className={`admin-badge-pill ${user.status === 'active' ? 'active' : 'inactive'}`}>
                        {user.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
              No users yet
            </p>
          )}

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '24px 0 12px', color: 'var(--text-primary)' }}>
                Pending Invitations
              </h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td style={{ textTransform: 'capitalize' }}>{invite.role}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {new Date(invite.expires_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Branding Settings */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h2 className="admin-card-title">Branding</h2>
            </div>
            <div className="admin-form">
              <div className="admin-form-group">
                <label className="admin-form-label">Logo URL</label>
                <input
                  type="url"
                  className="admin-form-input"
                  defaultValue={organization.logo_url || ''}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label className="admin-form-label">Primary Color</label>
                  <div className="admin-color-picker">
                    <input type="color" className="admin-color-swatch" defaultValue={organization.primary_color} />
                    <input type="text" className="admin-form-input admin-color-input" defaultValue={organization.primary_color} />
                  </div>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Secondary Color</label>
                  <div className="admin-color-picker">
                    <input type="color" className="admin-color-swatch" defaultValue={organization.secondary_color} />
                    <input type="text" className="admin-form-input admin-color-input" defaultValue={organization.secondary_color} />
                  </div>
                </div>
              </div>
              <button className="admin-btn admin-btn-primary" style={{ alignSelf: 'flex-start' }}>
                Save Branding
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="admin-card" style={{ borderColor: '#fecaca' }}>
            <div className="admin-card-header">
              <h2 className="admin-card-title" style={{ color: '#dc2626' }}>Danger Zone</h2>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Deleting this organization will permanently remove all data, users, and integrations.
              This action cannot be undone.
            </p>
            <button onClick={handleDeleteOrganization} className="admin-btn admin-btn-danger">
              Delete Organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrganizationDetail;
