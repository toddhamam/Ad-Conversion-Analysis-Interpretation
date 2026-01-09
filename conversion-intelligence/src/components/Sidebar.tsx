import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import './Sidebar.css';

const Sidebar = () => {
  const [channelsExpanded, setChannelsExpanded] = useState(true);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">Conversion Intelligence</h1>
        <p className="sidebar-subtitle">Decision Support System</p>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <button
            className={`nav-item nav-item-expandable ${channelsExpanded ? 'expanded' : ''}`}
            onClick={() => setChannelsExpanded(!channelsExpanded)}
          >
            <span className="nav-icon">↩</span>
            <span className="nav-label">Channels</span>
            <span className="nav-arrow">{channelsExpanded ? '⌄' : '›'}</span>
          </button>
          {channelsExpanded && (
            <div className="nav-submenu">
              <NavLink to="/channels/meta-ads" className="nav-subitem">
                <span className="nav-bullet">●</span>
                <span>Meta Ads</span>
              </NavLink>
            </div>
          )}
        </div>

        <NavLink to="/creatives" className="nav-item">
          <span className="nav-icon">🖼</span>
          <span className="nav-label">Creatives</span>
        </NavLink>

        <NavLink to="/concepts" className="nav-item">
          <span className="nav-icon">💡</span>
          <span className="nav-label">Concepts</span>
        </NavLink>

        <NavLink to="/products" className="nav-item">
          <span className="nav-icon">📦</span>
          <span className="nav-label">Products</span>
        </NavLink>

        <NavLink to="/insights" className="nav-item">
          <span className="nav-icon">📈</span>
          <span className="nav-label">Insights</span>
        </NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
