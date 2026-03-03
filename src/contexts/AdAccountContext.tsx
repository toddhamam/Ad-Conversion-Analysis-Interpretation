import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useOrganization } from './OrganizationContext';
import {
  getOrgMetaIds,
  setCurrentAdAccount as setMetaCurrentAccount,
  onOrgMetaChange,
  type AdAccountInfo,
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
}

const AdAccountContext = createContext<AdAccountContextValue | undefined>(undefined);

export function AdAccountProvider({ children }: { children: React.ReactNode }) {
  const { organization } = useOrganization();
  const [accounts, setAccounts] = useState<AdAccountInfo[]>([]);
  const [currentAccount, setCurrentAccount] = useState<AdAccountInfo | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [metaVersion, setMetaVersion] = useState(0);

  // Subscribe to meta credential load/clear events so we re-read after async load
  useEffect(() => {
    return onOrgMetaChange(() => setMetaVersion(v => v + 1));
  }, []);

  // Load accounts from the cached org meta IDs — re-runs on org change AND after meta load completes
  useEffect(() => {
    const orgMeta = getOrgMetaIds();
    if (!orgMeta) {
      setAccounts([]);
      setCurrentAccount(null);
      setScopedAccountId(null);
      return;
    }

    const adAccounts = orgMeta.adAccounts || [];
    setAccounts(adAccounts);

    if (adAccounts.length === 0) {
      // Single-account org or no accounts — use the default credential row values
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
        };
        setCurrentAccount(defaultAccount);
        // Don't scope storage for single-account orgs (backwards compatible)
        setScopedAccountId(null);
      }
      return;
    }

    // Multi-account org — restore the last selected account from localStorage
    const orgId = organization?.id || '';
    const savedAccountId = localStorage.getItem(`ci_current_ad_account_${orgId}`);
    const savedAccount = savedAccountId
      ? adAccounts.find(a => a.ad_account_id === savedAccountId)
      : null;
    const activeAccount = savedAccount || adAccounts[0];

    setCurrentAccount(activeAccount);
    setScopedAccountId(activeAccount.ad_account_id);
    setMetaCurrentAccount(activeAccount);

    // Migrate unscoped data for the first account (single→multi upgrade path)
    if (adAccounts.length > 0) {
      for (const key of SCOPED_KEYS) {
        migrateToScoped(key, activeAccount.ad_account_id);
      }
    }
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

  const isMultiAccount = accounts.length > 1;

  return (
    <AdAccountContext.Provider
      value={{ accounts, currentAccount, switchAccount, isMultiAccount, isSwitching }}
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
