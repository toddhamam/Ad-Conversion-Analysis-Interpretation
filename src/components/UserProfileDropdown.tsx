import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get user data from localStorage
  const getUserData = (): UserData => {
    const stored = localStorage.getItem('convertra_user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Fallback if parsing fails
      }
    }
    // Default fallback for demo
    return {
      fullName: 'Demo User',
      companyName: 'Demo Company',
      email: 'demo@company.com',
    };
  };

  const userData = getUserData();

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

  const handleSignOut = () => {
    localStorage.removeItem('convertra_authenticated');
    localStorage.removeItem('convertra_user');
    navigate('/login');
  };

  const handleAccountSettings = () => {
    setIsOpen(false);
    navigate('/account');
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
