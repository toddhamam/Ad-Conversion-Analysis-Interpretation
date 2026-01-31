import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AdminLayout.css';

const AdminLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const { signOut } = useAuth();

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile nav is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  return (
    <div className={`admin-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile Header */}
      <header className="admin-mobile-header">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
        <div className="admin-mobile-title">
          <span className="admin-badge">Admin</span>
          <span>Convertra</span>
        </div>
      </header>

      {/* Mobile overlay */}
      <div
        className={`admin-sidebar-overlay ${mobileNavOpen ? 'visible' : ''}`}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="admin-sidebar-header">
          <Link to="/admin" className="admin-logo-link" onClick={() => setMobileNavOpen(false)}>
            {sidebarCollapsed ? (
              <div className="admin-logo-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
            ) : (
              <>
                <img src="/convertra-logo.png" alt="Convertra" className="admin-logo" />
                <span className="admin-badge">Admin</span>
              </>
            )}
          </Link>
          {/* Mobile close button */}
          <button className="mobile-close-btn" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <nav className="admin-nav">
          <NavLink to="/admin" end className="admin-nav-item" title="Dashboard" onClick={() => setMobileNavOpen(false)}>
            <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span className="admin-nav-label">Dashboard</span>
          </NavLink>

          <NavLink to="/admin/organizations" className="admin-nav-item" title="Organizations" onClick={() => setMobileNavOpen(false)}>
            <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span className="admin-nav-label">Organizations</span>
          </NavLink>

          <NavLink to="/admin/organizations/new" className="admin-nav-item admin-nav-cta" title="New Organization" onClick={() => setMobileNavOpen(false)}>
            <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <span className="admin-nav-label">New Organization</span>
          </NavLink>
        </nav>

        <div className="admin-sidebar-footer">
          <Link to="/dashboard" className="admin-nav-item" title="Back to App" onClick={() => setMobileNavOpen(false)}>
            <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            <span className="admin-nav-label">Back to App</span>
          </Link>

          <button className="admin-nav-item" title="Sign Out" onClick={handleSignOut}>
            <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span className="admin-nav-label">Sign Out</span>
          </button>

          <button className="collapse-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg className="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarCollapsed ? (
                <polyline points="9 18 15 12 9 6"/>
              ) : (
                <polyline points="15 18 9 12 15 6"/>
              )}
            </svg>
            {!sidebarCollapsed && <span className="collapse-label">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        <Outlet key={location.pathname} />
      </main>
    </div>
  );
};

export default AdminLayout;
