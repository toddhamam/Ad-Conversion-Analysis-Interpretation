import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdAccount } from '../contexts/AdAccountContext';
import './AccountSwitcher.css';

interface AccountSwitcherProps {
  collapsed?: boolean;
  onCloseMobile?: () => void;
}

export default function AccountSwitcher({ collapsed = false, onCloseMobile }: AccountSwitcherProps) {
  const { accounts, currentAccount, switchAccount, isMultiAccount } = useAdAccount();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on outside click — must be called unconditionally (Rules of Hooks)
  useEffect(() => {
    if (!isOpen || !isMultiAccount) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isMultiAccount]);

  // Don't render for single-account orgs (after all hooks)
  if (!isMultiAccount) return null;

  const getStatusColor = (account: typeof currentAccount) => {
    if (!account) return 'var(--text-muted)';
    if (!account.page_id || !account.pixel_id) return '#f59e0b'; // amber — needs config
    return '#22c55e'; // green — fully configured
  };

  const truncateId = (id: string) => {
    if (id.length <= 15) return id;
    return `${id.slice(0, 7)}...${id.slice(-3)}`;
  };

  const handleSwitch = (adAccountId: string) => {
    switchAccount(adAccountId);
    setIsOpen(false);
    onCloseMobile?.();
  };

  const handleManage = () => {
    setIsOpen(false);
    onCloseMobile?.();
    navigate('/integrations');
  };

  // Collapsed sidebar — show icon only
  if (collapsed) {
    return (
      <div className="account-switcher-collapsed" ref={dropdownRef}>
        <button
          className="account-switcher-icon-btn"
          onClick={() => setIsOpen(!isOpen)}
          title={currentAccount?.ad_account_name || 'Switch account'}
        >
          <span
            className="account-dot"
            style={{ backgroundColor: getStatusColor(currentAccount) }}
          />
          <span className="account-initial">
            {(currentAccount?.ad_account_name || 'A').charAt(0).toUpperCase()}
          </span>
        </button>

        {isOpen && (
          <div className="account-switcher-dropdown floating">
            <AccountDropdownContent
              accounts={accounts}
              currentAccount={currentAccount}
              getStatusColor={getStatusColor}
              truncateId={truncateId}
              onSwitch={handleSwitch}
              onManage={handleManage}
            />
          </div>
        )}
      </div>
    );
  }

  // Expanded sidebar — full trigger button
  return (
    <div className="account-switcher" ref={dropdownRef}>
      <button
        className={`account-switcher-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span
          className="account-dot"
          style={{ backgroundColor: getStatusColor(currentAccount) }}
        />
        <div className="account-trigger-text">
          <span className="account-trigger-name">
            {currentAccount?.ad_account_name || 'Select Account'}
          </span>
          <span className="account-trigger-id">
            {currentAccount ? truncateId(currentAccount.ad_account_id) : ''}
          </span>
        </div>
        <svg
          className={`account-trigger-chevron ${isOpen ? 'open' : ''}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 6 L8 10 L12 6" />
        </svg>
      </button>

      {isOpen && (
        <div className="account-switcher-dropdown">
          <AccountDropdownContent
            accounts={accounts}
            currentAccount={currentAccount}
            getStatusColor={getStatusColor}
            truncateId={truncateId}
            onSwitch={handleSwitch}
            onManage={handleManage}
          />
        </div>
      )}
    </div>
  );
}

// ── Dropdown content (shared between expanded and collapsed modes) ──

function AccountDropdownContent({
  accounts,
  currentAccount,
  getStatusColor,
  truncateId,
  onSwitch,
  onManage,
}: {
  accounts: Array<{ ad_account_id: string; ad_account_name: string | null; page_id: string | null; pixel_id: string | null; currency: string | null; account_status: number | null; id: string; is_active: boolean }>;
  currentAccount: typeof accounts[0] | null;
  getStatusColor: (account: typeof accounts[0] | null) => string;
  truncateId: (id: string) => string;
  onSwitch: (adAccountId: string) => void;
  onManage: () => void;
}) {
  const activeAccounts = accounts.filter(a => a.is_active);

  return (
    <>
      <div className="dropdown-header">Switch Account</div>

      <div className="dropdown-accounts">
        {activeAccounts.map(account => {
          const isCurrent = account.ad_account_id === currentAccount?.ad_account_id;
          return (
            <button
              key={account.ad_account_id}
              className={`dropdown-account-item ${isCurrent ? 'current' : ''}`}
              onClick={() => onSwitch(account.ad_account_id)}
            >
              <div className="dropdown-account-info">
                <span className="dropdown-account-name">
                  {isCurrent && (
                    <svg className="check-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8 L6.5 11.5 L13 4.5" />
                    </svg>
                  )}
                  {account.ad_account_name || account.ad_account_id}
                </span>
                <span className="dropdown-account-detail">
                  {truncateId(account.ad_account_id)}
                  {account.currency ? ` \u00B7 ${account.currency}` : ''}
                </span>
              </div>
              <span
                className="account-dot"
                style={{ backgroundColor: getStatusColor(account) }}
              />
            </button>
          );
        })}
      </div>

      <div className="dropdown-footer">
        <button className="dropdown-manage-btn" onClick={onManage}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
          </svg>
          Manage Accounts
        </button>
        <span className="dropdown-seat-count">
          {activeAccounts.length} of {accounts.length} seats used
        </span>
      </div>
    </>
  );
}
