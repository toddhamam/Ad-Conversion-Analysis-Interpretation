import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import Loading from '../../components/Loading';
import type { Organization, User, OrganizationInvitation } from '../../types/organization';

interface MetaCredential {
  id: string;
  provider: string;
  ad_account_id: string | null;
  status: string;
  token_expires_at: string | null;
  metadata?: {
    selected_account_name?: string;
    connected_at?: string;
  };
}

function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [metaCredential, setMetaCredential] = useState<MetaCredential | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'settings'>('overview');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
      setMetaCredential(null); // No Meta connection in dev mode
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

      // Load Meta credentials
      const { data: metaCred } = await supabase
        .from('organization_credentials')
        .select('id, provider, ad_account_id, status, token_expires_at, metadata')
        .eq('organization_id', id)
        .eq('provider', 'meta')
        .single();

      setMetaCredential(metaCred as MetaCredential | null);
    } catch (error) {
      console.error('Failed to load organization:', error);
    } finally {
      setLoading(false);
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

    if (!isSupabaseConfigured()) {
      setMetaCredential(null);
      setNotification({ type: 'success', message: 'Meta Ads disconnected' });
      return;
    }

    try {
      const { error } = await supabase
        .from('organization_credentials')
        .delete()
        .eq('organization_id', id)
        .eq('provider', 'meta');

      if (error) throw error;
      setMetaCredential(null);
      setNotification({ type: 'success', message: 'Meta Ads disconnected successfully' });
    } catch (error) {
      console.error('Failed to disconnect Meta:', error);
      setNotification({ type: 'error', message: 'Failed to disconnect Meta Ads' });
    }
  };

  const isMetaConnected = metaCredential && metaCredential.status === 'active';
  const isMetaExpired = metaCredential && (metaCredential.status === 'expired' || (metaCredential.token_expires_at && new Date(metaCredential.token_expires_at) < new Date()));

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
        {(['overview', 'users', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent-violet)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab ? 600 : 500,
              fontSize: '14px',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
                        Connected{metaCredential?.metadata?.selected_account_name ? ` • ${metaCredential.metadata.selected_account_name}` : ''}
                      </div>
                    ) : isMetaExpired ? (
                      <div style={{ fontSize: '13px', color: '#f59e0b' }}>Token expired - reconnect required</div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Not connected</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isMetaConnected && (
                    <button onClick={handleDisconnectMeta} className="admin-btn admin-btn-secondary" style={{ padding: '8px 16px' }}>
                      Disconnect
                    </button>
                  )}
                  <button
                    onClick={handleConnectMeta}
                    className={isMetaConnected ? 'admin-btn admin-btn-secondary' : 'admin-btn admin-btn-primary'}
                    style={{ padding: '8px 16px' }}
                  >
                    {isMetaConnected ? 'Reconnect' : isMetaExpired ? 'Reconnect' : 'Connect'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Setup Status */}
          {!organization.setup_completed && (
            <div className="admin-card" style={{ borderColor: 'var(--accent-violet)', background: 'rgba(168, 85, 247, 0.05)' }}>
              <div className="admin-card-header">
                <h2 className="admin-card-title">Setup Checklist</h2>
                <span className="admin-badge-pill" style={{ background: 'var(--accent-violet)', color: 'white' }}>
                  In Progress
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked disabled style={{ width: '18px', height: '18px' }} />
                  <span>Organization created</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={invitations.length === 0 && users.length > 0} disabled style={{ width: '18px', height: '18px' }} />
                  <span>Owner invitation accepted</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!isMetaConnected} disabled style={{ width: '18px', height: '18px' }} />
                  <span>Meta Ads connected</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!organization.stripe_customer_id} disabled style={{ width: '18px', height: '18px' }} />
                  <span>Billing configured</span>
                </label>
              </div>
            </div>
          )}
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
