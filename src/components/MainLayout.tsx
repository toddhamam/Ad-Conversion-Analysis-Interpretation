import { useState, useEffect } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import UserProfileDropdown from './UserProfileDropdown';
import TrialBanner from './TrialBanner';
import SubscriptionGate from './SubscriptionGate';
import { useOrganization } from '../contexts/OrganizationContext';
import './MainLayout.css';

const MainLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const { organization } = useOrganization();

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

  // Determine which logo to show (tenant logo or default Convertra logo)
  const logoUrl = organization?.logo_url || '/convertra-logo.png';
  const logoAlt = organization?.name || 'Convertra';

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile Header */}
      <header className="mobile-header">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
        <img src={logoUrl} alt={logoAlt} className="mobile-logo" />
        <UserProfileDropdown />
      </header>

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        logoUrl={logoUrl}
        logoAlt={logoAlt}
      />
      <div className="main-area">
        <header className="top-bar">
          <div className="top-bar-spacer"></div>
          <UserProfileDropdown />
        </header>
        <TrialBanner />
        <main className="main-content">
          <SubscriptionGate>
            <Outlet />
          </SubscriptionGate>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
