import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useOrganization } from './OrganizationContext';
import type { BusinessType } from '../types/organization';
import {
  getOrgMetaIds,
  setCurrentAdAccount as setMetaCurrentAccount,
  onOrgMetaChange,
  fetchAdAccounts,
  activateAdAccount as apiActivateAdAccount,
  clearOrgMetaCache,
  loadOrgMetaCredentials,
  type AdAccountInfo,
  type AvailableAdAccount,
} from '../services/metaApi';
import { setScopedAccountId, migrateToScoped } from '../lib/scopedStorage';

// localStorage keys that need migration when upgrading from single to multi-account
const SCOPED_KEYS = [
  'channel_analysis_cache',
  'convertra_products',
  'conversion_intelligence_generated_ads',
  'conversion_intelligence_image_cache',
  'ci_ad_library_inspirations',
  'ci_publish_presets',
  'ci_publish_pixel_id',
];

export interface SeatInfo {
  seats: number;
  seatsUsed: number;
  maxAccounts: number;
}

export interface AdAccountContextValue {
  /** All activated ad accounts for the org */
  accounts: AdAccountInfo[];
  /** The currently selected ad account (null if none) */
  currentAccount: AdAccountInfo | null;
  /** Switch to a different ad account */
  switchAccount: (adAccountId: string) => void;
  /** Whether the org has more than one activated account */
  isMultiAccount: boolean;
  /** Whether we're in the process of switching accounts */
  isSwitching: boolean;
  /** All available accounts from Meta Business Manager (includes non-activated) */
  availableAccounts: AvailableAdAccount[];
  /** Seat usage info for the org */
  seatInfo: SeatInfo | null;
  /** Activate an available account inline (returns after refresh + auto-switch) */
  activateAccount: (adAccountId: string) => Promise<void>;
  /** The ad account ID currently being activated (loading state) */
  activatingAccountId: string | null;
  /** Resolved business type: per-account override > org default > 'ecommerce' */
  accountBusinessType: BusinessType;
}

const AdAccountContext = createContext<AdAccountContextValue | undefined>(undefined);

export function AdAccountProvider({ children }: { children: React.ReactNode }) {
  const { organization } = useOrganization();
  const [accounts, setAccounts] = useState<AdAccountInfo[]>([]);
  const [currentAccount, setCurrentAccount] = useState<AdAccountInfo | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [metaVersion, setMetaVersion] = useState(0);
  const [availableAccounts, setAvailableAccounts] = useState<AvailableAdAccount[]>([]);
  const [seatInfo, setSeatInfo] = useState<SeatInfo | null>(null);
  const [activatingAccountId, setActivatingAccountId] = useState<string | null>(null);

  // Subscribe to meta credential load/clear events so we re-read after async load
  useEffect(() => {
    return onOrgMetaChange(() => setMetaVersion(v => v + 1));
  }, []);

  // Load accounts — first from cached orgMeta, then fetch fresh from the
  // dedicated ad-accounts endpoint to ensure we have the complete list.
  // The status endpoint's adAccounts can be stale or silently empty on errors.
  useEffect(() => {
    const orgMeta = getOrgMetaIds();
    if (!orgMeta) {
      setAccounts([]);
      setCurrentAccount(null);
      setMetaCurrentAccount(null);
      setScopedAccountId(null);
      setAvailableAccounts([]);
      setSeatInfo(null);
      return;
    }

    // If Meta isn't connected, nothing to do
    if (!orgMeta.connected) {
      setAccounts([]);
      setCurrentAccount(null);
      setMetaCurrentAccount(null);
      setScopedAccountId(null);
      setAvailableAccounts([]);
      setSeatInfo(null);
      return;
    }

    // Populate available accounts from cached status
    setAvailableAccounts(orgMeta.availableAccounts || []);

    // Helper to apply an account list (shared by fast path and fresh fetch)
    const orgId = organization?.id || '';
    const applyAccounts = (adAccounts: AdAccountInfo[]) => {
      setAccounts(adAccounts);

      if (adAccounts.length === 0) {
        // No activated accounts — fall back to default credential row values
        if (orgMeta.adAccountId) {
          const defaultAccount: AdAccountInfo = {
            id: '',
            ad_account_id: orgMeta.adAccountId,
            ad_account_name: orgMeta.accountName,
            page_id: orgMeta.pageId || null,
            pixel_id: orgMeta.pixelId || null,
            is_active: true,
            account_status: null,
            currency: null,
            business_type: null,
            products: null,
            reference_image_metadata: null,
          };
          setCurrentAccount(defaultAccount);
          setMetaCurrentAccount(defaultAccount);
          setScopedAccountId(null);
        } else {
          // Connected but no ad account configured — clear all state
          setCurrentAccount(null);
          setMetaCurrentAccount(null);
          setScopedAccountId(null);
        }
        return;
      }

      // Restore last selected account from localStorage
      const savedAccountId = localStorage.getItem(`ci_current_ad_account_${orgId}`);
      const savedAccount = savedAccountId
        ? adAccounts.find(a => a.ad_account_id === savedAccountId)
        : null;
      const activeAccount = savedAccount || adAccounts[0];

      setCurrentAccount(activeAccount);
      setScopedAccountId(activeAccount.ad_account_id);
      setMetaCurrentAccount(activeAccount);

      // Migrate unscoped data for the first account (single→multi upgrade path)
      for (const key of SCOPED_KEYS) {
        migrateToScoped(key, activeAccount.ad_account_id);
      }
    };

    // Fast path: apply cached adAccounts from status endpoint immediately
    const cachedAccounts = orgMeta.adAccounts || [];
    applyAccounts(cachedAccounts);

    // Then fetch fresh from dedicated ad-accounts endpoint (authoritative source).
    // This catches cases where the status endpoint's adAccounts query silently failed
    // or returned stale data (e.g., missing newly activated accounts or outdated page_id).
    let cancelled = false;
    fetchAdAccounts()
      .then((data) => {
        if (cancelled) return;
        const freshAccounts = (data.accounts || []).filter(a => a.is_active);
        setSeatInfo({ seats: data.seats, seatsUsed: data.seatsUsed, maxAccounts: data.maxAccounts });
        // Build a fingerprint that captures both the account list and key config fields
        const fingerprint = (accts: AdAccountInfo[]) =>
          accts.map(a => `${a.ad_account_id}:${a.page_id || ''}:${a.pixel_id || ''}:${a.business_type || ''}:${JSON.stringify(a.products || [])}`).sort().join(',');
        if (fingerprint(freshAccounts) !== fingerprint(cachedAccounts)) {
          applyAccounts(freshAccounts);
        }
      })
      .catch(() => {
        // Fresh fetch failed — cached data is still applied, no action needed
      });

    return () => { cancelled = true; };
  }, [organization?.id, metaVersion]); // Re-run when org changes or meta credentials load

  const switchAccount = useCallback((adAccountId: string) => {
    const account = accounts.find(a => a.ad_account_id === adAccountId);
    if (!account || account.ad_account_id === currentAccount?.ad_account_id) return;

    setIsSwitching(true);
    setCurrentAccount(account);
    setScopedAccountId(account.ad_account_id);
    setMetaCurrentAccount(account);

    // Persist selection
    const orgId = organization?.id || '';
    if (orgId) {
      localStorage.setItem(`ci_current_ad_account_${orgId}`, account.ad_account_id);
    }

    // Migrate unscoped data for this account too (in case it hasn't been migrated)
    for (const key of SCOPED_KEYS) {
      migrateToScoped(key, account.ad_account_id);
    }

    // Brief delay to allow the switching overlay to render before re-fetches start
    setTimeout(() => {
      setIsSwitching(false);
    }, 400);
  }, [accounts, currentAccount, organization?.id]);

  const activateAccount = useCallback(async (adAccountId: string) => {
    setActivatingAccountId(adAccountId);
    try {
      // 1. Activate the account via API
      await apiActivateAdAccount(adAccountId);

      // 2. Refresh org meta so availableAccounts is current
      clearOrgMetaCache();
      const freshMeta = await loadOrgMetaCredentials();
      if (freshMeta) {
        setAvailableAccounts(freshMeta.availableAccounts || []);
      }

      // 3. Reload activated accounts from dedicated endpoint
      const freshData = await fetchAdAccounts();
      const freshAccounts = (freshData.accounts || []).filter(a => a.is_active);
      setAccounts(freshAccounts);
      setSeatInfo({ seats: freshData.seats, seatsUsed: freshData.seatsUsed, maxAccounts: freshData.maxAccounts });

      // 4. Auto-switch to the newly activated account
      const newAccount = freshAccounts.find(a => a.ad_account_id === adAccountId);
      if (newAccount) {
        setCurrentAccount(newAccount);
        setScopedAccountId(newAccount.ad_account_id);
        setMetaCurrentAccount(newAccount);

        const orgId = organization?.id || '';
        if (orgId) {
          localStorage.setItem(`ci_current_ad_account_${orgId}`, newAccount.ad_account_id);
        }

        for (const key of SCOPED_KEYS) {
          migrateToScoped(key, newAccount.ad_account_id);
        }
      }
    } finally {
      setActivatingAccountId(null);
    }
  }, [organization?.id]);

  const isMultiAccount = accounts.length > 1;

  const { businessType: orgBusinessType } = useOrganization();
  const accountBusinessType: BusinessType = useMemo(
    () => currentAccount?.business_type || orgBusinessType || 'ecommerce',
    [currentAccount?.business_type, orgBusinessType]
  );

  return (
    <AdAccountContext.Provider
      value={{
        accounts,
        currentAccount,
        switchAccount,
        isMultiAccount,
        isSwitching,
        availableAccounts,
        seatInfo,
        activateAccount,
        activatingAccountId,
        accountBusinessType,
      }}
    >
      {children}
    </AdAccountContext.Provider>
  );
}

export function useAdAccount(): AdAccountContextValue {
  const context = useContext(AdAccountContext);
  if (!context) {
    throw new Error('useAdAccount must be used within an AdAccountProvider');
  }
  return context;
}
