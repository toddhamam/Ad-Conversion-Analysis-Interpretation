import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import './UserProfileDropdown.css';

interface UserData {
  fullName: string;
  companyName: string;
  companyLogo?: string;
  email: string;
  role?: string;
}

const UserProfileDropdown = () => {
  const navigate = useNavigate();
  const { signOut, user: authUser } = useAuth();
  const { user: orgUser, organization } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Resolve user data: OrganizationContext > Auth metadata > localStorage > fallback
  const userData = useMemo((): UserData => {
    // Primary source: organization context (loaded from Supabase users/organizations tables)
    if (orgUser && organization) {
      return {
        fullName: orgUser.full_name || authUser?.email || 'User',
        companyName: organization.name || 'My Company',
        companyLogo: organization.logo_url || undefined,
        email: orgUser.email || authUser?.email || '',
        role: orgUser.role || undefined,
      };
    }

    // Secondary source: auth user metadata
    if (authUser) {
      return {
        fullName: authUser.user_metadata?.full_name || authUser.email || 'User',
        companyName: authUser.user_metadata?.company_name || 'My Company',
        email: authUser.email || '',
      };
    }

    // Tertiary source: localStorage (for backwards compatibility)
    const stored = localStorage.getItem('convertra_user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Fallback if parsing fails
      }
    }

    return {
      fullName: 'User',
      companyName: 'My Company',
      email: '',
    };
  }, [orgUser, organization, authUser]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    localStorage.removeItem('convertra_authenticated');
    localStorage.removeItem('convertra_user');
    navigate('/login', { replace: true });
  };

  const handleAccountSettings = () => {
    setIsOpen(false);
    navigate('/account');
  };

  const handleIntegrations = () => {
    setIsOpen(false);
    navigate('/integrations');
  };

  const handleBillingDetails = () => {
    setIsOpen(false);
    navigate('/billing');
  };

  // Generate initials from company name for the logo placeholder
  const getCompanyInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div className="user-profile-dropdown" ref={dropdownRef}>
      <button
        className={`user-profile-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="company-logo-container">
          {userData.companyLogo ? (
            <img
              src={userData.companyLogo}
              alt={userData.companyName}
              className="company-logo-img"
            />
          ) : (
            <div className="company-logo-placeholder">
              {getCompanyInitials(userData.companyName)}
            </div>
          )}
        </div>
        <div className="user-info">
          <span className="user-name">{userData.fullName}</span>
          <span className="company-name">{userData.companyName}</span>
        </div>
        <svg
          className={`dropdown-chevron ${isOpen ? 'rotated' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {isOpen && (
        <div className="user-profile-menu">
          <div className="menu-header">
            <div className="menu-user-info">
              <span className="menu-user-name">{userData.fullName}</span>
              <span className="menu-user-email">{userData.email}</span>
              {userData.role && <span className="menu-user-role">{userData.role}</span>}
            </div>
          </div>

          <div className="menu-divider"></div>

          <button className="menu-item" onClick={handleAccountSettings}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
            <span>Account Settings</span>
          </button>

          <button className="menu-item" onClick={handleIntegrations}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span>Integrations</span>
          </button>

          <button className="menu-item" onClick={handleBillingDetails}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            <span>Billing Details</span>
          </button>

          <div className="menu-divider"></div>

          <button className="menu-item menu-item-danger" onClick={handleSignOut}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UserProfileDropdown;
