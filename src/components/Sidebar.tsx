import { NavLink, Link } from 'react-router-dom';
import { useState } from 'react';
import './Sidebar.css';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  logoUrl?: string;
  logoAlt?: string;
}

const Sidebar = ({
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
  logoUrl = '/convertra-logo.png',
  logoAlt = 'Convertra',
}: SidebarProps) => {
  const [channelsExpanded, setChannelsExpanded] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <Link to="/dashboard" className="sidebar-logo-link" onClick={onCloseMobile}>
          {collapsed ? (
            <div className="sidebar-logo-icon">
              <svg viewBox="0 0 64 64" className="logo-icon">
                <defs>
                  <linearGradient id="arrow-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#d4e157"/>
                    <stop offset="40%" stopColor="#c0ca33"/>
                    <stop offset="100%" stopColor="#a855f7"/>
                  </linearGradient>
                </defs>
                <path d="M8 28 L22 48 L30 48 L16 28 Z" fill="#d4e157"/>
                <path d="M22 48 L30 48 L54 14 L46 14 Z" fill="url(#arrow-gradient)"/>
                <path d="M42 4 L58 4 L58 20 L52 14 L46 14 L42 10 Z" fill="#a855f7"/>
              </svg>
            </div>
          ) : (
            <>
              <img src={logoUrl} alt={logoAlt} className="sidebar-logo" />
              <p className="sidebar-subtitle">ConversionIQ™ Intelligence</p>
            </>
          )}
        </Link>
        {/* Mobile close button */}
        <button className="mobile-close-btn" onClick={onCloseMobile} aria-label="Close menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className="nav-item" end title="Dashboard" onClick={onCloseMobile}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span className="nav-label">Dashboard</span>
        </NavLink>

        <div className="nav-section">
          <button
            className={`nav-item nav-item-expandable ${channelsExpanded ? 'expanded' : ''}`}
            onClick={() => !collapsed && setChannelsExpanded(!channelsExpanded)}
            title="Channels"
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span className="nav-label">Channels</span>
            {!collapsed && (
              <svg className="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            )}
          </button>
          {channelsExpanded && !collapsed && (
            <div className="nav-submenu">
              <NavLink to="/channels/meta-ads" className="nav-subitem" onClick={onCloseMobile}>
                <span className="nav-bullet"></span>
                <span>Meta Ads</span>
              </NavLink>
            </div>
          )}
        </div>

        <NavLink to="/funnels" className="nav-item" title="Funnels" onClick={onCloseMobile}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
          </svg>
          <span className="nav-label">Funnels</span>
        </NavLink>

        <NavLink to="/insights" className="nav-item" title="ConversionIQ™" onClick={onCloseMobile}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <span className="nav-label">ConversionIQ™</span>
        </NavLink>
      </nav>

      <div className="sidebar-cta">
        <NavLink to="/creatives" className="creative-cta" title="CreativeIQ™" onClick={onCloseMobile}>
          <svg className="creative-cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          {!collapsed && <span className="creative-cta-label">CreativeIQ™</span>}
        </NavLink>
      </div>

      <div className="sidebar-footer">
        <button className="collapse-toggle" onClick={onToggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <svg className="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? (
              <polyline points="9 18 15 12 9 6"/>
            ) : (
              <polyline points="15 18 9 12 15 6"/>
            )}
          </svg>
          {!collapsed && <span className="collapse-label">Collapse</span>}
        </button>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
