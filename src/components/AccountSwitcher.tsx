import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAdAccount } from '../contexts/AdAccountContext';
import type { AdAccountInfo, AvailableAdAccount } from '../services/metaApi';
import './AccountSwitcher.css';

interface AccountSwitcherProps {
  variant?: 'desktop' | 'mobile';
  onCloseMobile?: () => void;
}

export default function AccountSwitcher({ variant = 'desktop', onCloseMobile }: AccountSwitcherProps) {
  const {
    accounts,
    currentAccount,
    switchAccount,
    availableAccounts,
    seatInfo,
    activateAccount,
    activatingAccountId,
  } = useAdAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  // Clear activation error after 5 seconds
  useEffect(() => {
    if (!activationError) return;
    const timer = setTimeout(() => setActivationError(null), 5000);
    return () => clearTimeout(timer);
  }, [activationError]);

  if (!currentAccount) return null;

  const getStatusColor = (account: AdAccountInfo | null) => {
    if (!account) return 'var(--text-muted)';
    if (!account.page_id) return '#f59e0b';
    return '#22c55e';
  };

  const handleSwitch = (adAccountId: string) => {
    switchAccount(adAccountId);
    setIsOpen(false);
    onCloseMobile?.();
  };

  const handleActivate = async (adAccountId: string) => {
    setActivationError(null);
    try {
      await activateAccount(adAccountId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to activate account';
      setActivationError(msg);
    }
  };

  const handleManage = () => {
    setIsOpen(false);
    onCloseMobile?.();
    navigate('/integrations');
  };

  // Build active accounts list
  const activeAccounts = accounts.filter((a) => a.is_active);
  const hasCurrentInActiveList = activeAccounts.some(
    (account) => account.ad_account_id === currentAccount.ad_account_id
  );
  const displayActiveAccounts = hasCurrentInActiveList
    ? activeAccounts
    : [currentAccount, ...activeAccounts];

  // Available but not yet activated accounts
  const activatedIds = new Set(accounts.map(a => a.ad_account_id));
  const availableForActivation = availableAccounts.filter(
    a => !activatedIds.has(a.id)
  );

  // Seat math
  const isUnlimitedSeats = (seatInfo?.maxAccounts ?? 1) === -1;
  const seatsRemaining = isUnlimitedSeats
    ? Infinity
    : (seatInfo?.maxAccounts || 1) - (seatInfo?.seatsUsed || 0);

  // If only 1 active account and nothing available to activate, show static label
  const hasDropdown = displayActiveAccounts.length > 1 || availableForActivation.length > 0;

  const isMobile = variant === 'mobile';

  return (
    <div
      className={`account-switcher-topbar ${isMobile ? 'mobile' : ''}`}
      ref={dropdownRef}
    >
      <button
        className={`account-switcher-trigger ${isOpen ? 'active' : ''} ${!hasDropdown ? 'static' : ''}`}
        onClick={() => hasDropdown && setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        style={{ cursor: hasDropdown ? 'pointer' : 'default' }}
      >
        <span
          className="account-dot"
          style={{ backgroundColor: getStatusColor(currentAccount) }}
        />
        <span className="account-trigger-name">
          {currentAccount?.ad_account_name || 'Select Account'}
        </span>
        {hasDropdown && (
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
        )}
      </button>

      {isOpen && hasDropdown && (
        <div className={`account-switcher-dropdown ${isMobile ? 'mobile-sheet' : ''}`}>
          {/* Active Accounts */}
          <div className="dropdown-section-header">Active Accounts</div>
          <div className="dropdown-accounts" role="listbox">
            {displayActiveAccounts.map(account => {
              const isCurrent = account.ad_account_id === currentAccount?.ad_account_id;
              return (
                <button
                  key={account.ad_account_id}
                  className={`dropdown-account-item ${isCurrent ? 'current' : ''}`}
                  onClick={() => handleSwitch(account.ad_account_id)}
                  role="option"
                  aria-selected={isCurrent}
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
                      {account.currency || 'No currency set'}
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

          {/* Available Accounts (not yet activated) */}
          {availableForActivation.length > 0 && (
            <>
              <div className="dropdown-divider" />
              <div className="dropdown-section-header">Available Accounts</div>
              <div className="dropdown-accounts">
                {availableForActivation.map(account => (
                  <AvailableAccountRow
                    key={account.id}
                    account={account}
                    seatsRemaining={seatsRemaining}
                    isActivating={activatingAccountId === account.id}
                    isAnyActivating={activatingAccountId !== null}
                    onActivate={handleActivate}
                  />
                ))}
              </div>
            </>
          )}

          {/* Activation error */}
          {activationError && (
            <div className="dropdown-error">
              {activationError}
            </div>
          )}

          {/* Footer */}
          <div className="dropdown-footer">
            <button className="dropdown-manage-btn" onClick={handleManage}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="2.5" />
                <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
              </svg>
              Manage Accounts
            </button>
            <span className="dropdown-seat-count">
              {seatInfo
                ? isUnlimitedSeats
                  ? `${seatInfo.seatsUsed} seats`
                  : `${seatInfo.seatsUsed} of ${seatInfo.maxAccounts} seats`
                : `${displayActiveAccounts.length} active`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Available account row with activate button ──

function AvailableAccountRow({
  account,
  seatsRemaining,
  isActivating,
  isAnyActivating,
  onActivate,
}: {
  account: AvailableAdAccount;
  seatsRemaining: number;
  isActivating: boolean;
  isAnyActivating: boolean;
  onActivate: (adAccountId: string) => void;
}) {
  const atLimit = seatsRemaining <= 0;

  return (
    <div className="dropdown-available-item">
      <div className="dropdown-account-info">
        <span className="dropdown-account-name available">
          {account.name || account.account_id}
        </span>
        <span className="dropdown-account-detail">
          {account.currency || 'Meta Ad Account'}
        </span>
      </div>
      {atLimit ? (
        <Link
          to="/billing"
          className="dropdown-upgrade-link"
          onClick={(e) => e.stopPropagation()}
        >
          Upgrade
        </Link>
      ) : (
        <button
          className="dropdown-activate-btn"
          onClick={() => onActivate(account.id)}
          disabled={isActivating || isAnyActivating}
        >
          {isActivating ? (
            <span className="activate-spinner" />
          ) : (
            'Activate'
          )}
        </button>
      )}
    </div>
  );
}
