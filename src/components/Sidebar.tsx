import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import './Sidebar.css';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar = ({ collapsed = false, onToggleCollapse }: SidebarProps) => {
  const [channelsExpanded, setChannelsExpanded] = useState(true);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
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
            <img src="/convertra-logo.png" alt="Convertra" className="sidebar-logo" />
            <p className="sidebar-subtitle">ConversionIQ™ Intelligence</p>
          </>
        )}
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className="nav-item" end title="Dashboard">
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
              <NavLink to="/channels/meta-ads" className="nav-subitem">
                <span className="nav-bullet"></span>
                <span>Meta Ads</span>
              </NavLink>
            </div>
          )}
        </div>

        <NavLink to="/funnels" className="nav-item" title="Funnels">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
          </svg>
          <span className="nav-label">Funnels</span>
        </NavLink>

        <NavLink to="/creatives" className="nav-item" title="Creatives">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span className="nav-label">Creatives</span>
        </NavLink>

        <NavLink to="/publish" className="nav-item" title="Publisher">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          <span className="nav-label">Publisher</span>
        </NavLink>

        <NavLink to="/concepts" className="nav-item" title="Concepts">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          <span className="nav-label">Concepts</span>
        </NavLink>

        <NavLink to="/insights" className="nav-item" title="Insights">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <span className="nav-label">Insights</span>
        </NavLink>
      </nav>

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
  );
};

export default Sidebar;
