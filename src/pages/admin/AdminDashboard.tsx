import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getAuthToken } from '../../lib/authToken';
import Loading from '../../components/Loading';
import type { Organization } from '../../types/organization';

interface DashboardStats {
  totalOrganizations: number;
  activeOrganizations: number;
  totalUsers: number;
  monthlyRevenue: number;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalOrganizations: 0,
    activeOrganizations: 0,
    totalUsers: 0,
    monthlyRevenue: 0,
  });
  const [recentOrgs, setRecentOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    if (!isSupabaseConfigured()) {
      // Mock data for development
      setStats({
        totalOrganizations: 12,
        activeOrganizations: 10,
        totalUsers: 47,
        monthlyRevenue: 5988,
      });
      setRecentOrgs([
        {
          id: '1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          logo_url: null,
          primary_color: '#d4e157',
          secondary_color: '#a855f7',
          stripe_customer_id: null,
          plan_tier: 'enterprise',
          billing_interval: 'monthly',
          subscription_status: 'active',
          subscription_id: null,
          current_period_start: null,
          current_period_end: null,
          setup_mode: 'white_glove',
          setup_completed: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'TechStart Inc',
          slug: 'techstart',
          logo_url: null,
          primary_color: '#d4e157',
          secondary_color: '#a855f7',
          stripe_customer_id: null,
          plan_tier: 'pro',
          billing_interval: 'monthly',
          subscription_status: 'active',
          subscription_id: null,
          current_period_start: null,
          current_period_end: null,
          setup_mode: 'self_service',
          setup_completed: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/credentials/dashboard-stats', {
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      });

      if (!res.ok) throw new Error('Failed to load dashboard data');
      const data = await res.json();

      setStats(data.stats);
      setRecentOrgs((data.recentOrgs as Organization[]) || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
        <Loading size="large" message="ConversionIQ™ loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Admin Dashboard</h1>
        <p className="admin-page-subtitle">Overview of all organizations and platform activity</p>
      </div>

      {/* Stats Grid */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon organizations">
            <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">{stats.totalOrganizations}</div>
            <div className="admin-stat-label">Total Organizations</div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon active">
            <svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">{stats.activeOrganizations}</div>
            <div className="admin-stat-label">Active Subscriptions</div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon users">
            <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">{stats.totalUsers}</div>
            <div className="admin-stat-label">Total Users</div>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon revenue">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div className="admin-stat-content">
            <div className="admin-stat-value">${stats.monthlyRevenue.toLocaleString()}</div>
            <div className="admin-stat-label">Monthly Revenue</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="admin-card" style={{ marginBottom: '24px' }}>
        <div className="admin-card-header">
          <h2 className="admin-card-title">Quick Actions</h2>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/admin/organizations/new" className="admin-btn admin-btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            New Organization
          </Link>
          <Link to="/admin/organizations" className="admin-btn admin-btn-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            View All Organizations
          </Link>
        </div>
      </div>

      {/* Recent Organizations */}
      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Recent Organizations</h2>
          <Link to="/admin/organizations" style={{ fontSize: '14px', color: 'var(--accent-violet)' }}>
            View all
          </Link>
        </div>
        {recentOrgs.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentOrgs.map((org) => (
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
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
            No organizations yet. Create your first one to get started.
          </p>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
