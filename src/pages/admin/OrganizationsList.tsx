import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import Loading from '../../components/Loading';
import type { Organization, PlanTier } from '../../types/organization';

function OrganizationsList() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanTier | 'all'>('all');

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    if (!isSupabaseConfigured()) {
      // Mock data for development
      setOrganizations([
        {
          id: '1',
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
          current_period_start: null,
          current_period_end: null,
          setup_mode: 'white_glove',
          setup_completed: true,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
        {
          id: '2',
          name: 'TechStart Inc',
          slug: 'techstart',
          logo_url: null,
          primary_color: '#d4e157',
          secondary_color: '#a855f7',
          stripe_customer_id: 'cus_def456',
          plan_tier: 'pro',
          billing_interval: 'yearly',
          subscription_status: 'active',
          subscription_id: 'sub_def456',
          current_period_start: null,
          current_period_end: null,
          setup_mode: 'self_service',
          setup_completed: true,
          created_at: '2024-02-20T14:30:00Z',
          updated_at: '2024-02-20T14:30:00Z',
        },
        {
          id: '3',
          name: 'Growth Labs',
          slug: 'growth-labs',
          logo_url: null,
          primary_color: '#d4e157',
          secondary_color: '#a855f7',
          stripe_customer_id: null,
          plan_tier: 'free',
          billing_interval: 'monthly',
          subscription_status: 'active',
          subscription_id: null,
          current_period_start: null,
          current_period_end: null,
          setup_mode: 'self_service',
          setup_completed: false,
          created_at: '2024-03-05T09:15:00Z',
          updated_at: '2024-03-05T09:15:00Z',
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrganizations((data as Organization[]) || []);
    } catch (error) {
      console.error('Failed to load organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrganizations = organizations.filter((org) => {
    const matchesSearch =
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlan = planFilter === 'all' || org.plan_tier === planFilter;
    return matchesSearch && matchesPlan;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
        <Loading size="large" message="ConversionIQ™ loading organizations..." />
      </div>
    );
  }

  return (
    <div className="admin-organizations">
      {/* Breadcrumb Navigation */}
      <nav className="admin-breadcrumb" style={{ marginBottom: '20px' }}>
        <Link to="/admin" className="admin-breadcrumb-link">Dashboard</Link>
        <span className="admin-breadcrumb-separator">/</span>
        <span className="admin-breadcrumb-current">Organizations</span>
      </nav>

      <div className="admin-page-header">
        <h1 className="admin-page-title">Organizations</h1>
        <p className="admin-page-subtitle">Manage all tenant organizations on the platform</p>
      </div>

      {/* Filters */}
      <div className="admin-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="admin-form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
            <input
              type="text"
              className="admin-form-input"
              placeholder="Search by name or slug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="admin-form-group" style={{ marginBottom: 0 }}>
            <select
              className="admin-form-select"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as PlanTier | 'all')}
            >
              <option value="all">All Plans</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <Link to="/admin/organizations/new" className="admin-btn admin-btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            New Organization
          </Link>
        </div>
      </div>

      {/* Organizations Table */}
      <div className="admin-card">
        {filteredOrganizations.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Setup</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrganizations.map((org) => (
                <tr
                  key={org.id}
                  onClick={() => navigate(`/admin/organizations/${org.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/organizations/${org.id}`)}
                >
                  <td>
                    <div className="admin-table-org">
                      {org.logo_url ? (
                        <img src={org.logo_url} alt={org.name} className="admin-table-org-logo" />
                      ) : (
                        <div className="admin-table-org-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{org.name.charAt(0)}</span>
                        </div>
                      )}
                      <div>
                        <div className="admin-table-org-name">{org.name}</div>
                        <div className="admin-table-org-slug">{org.slug}.convertra.io</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`admin-badge-pill ${org.plan_tier}`}>
                      {org.plan_tier.charAt(0).toUpperCase() + org.plan_tier.slice(1)}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-badge-pill ${org.subscription_status === 'active' ? 'active' : 'inactive'}`}>
                      {org.subscription_status}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', color: org.setup_completed ? 'var(--text-secondary)' : 'var(--accent-violet)' }}>
                      {org.setup_mode === 'white_glove' ? 'White Glove' : 'Self-Service'}
                      {!org.setup_completed && ' (Pending)'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <Link
                      to={`/admin/organizations/${org.id}`}
                      className="admin-btn admin-btn-secondary"
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: '16px' }}>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
              {searchQuery || planFilter !== 'all'
                ? 'No organizations match your filters'
                : 'No organizations yet'}
            </p>
            <Link to="/admin/organizations/new" className="admin-btn admin-btn-primary">
              Create First Organization
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default OrganizationsList;
