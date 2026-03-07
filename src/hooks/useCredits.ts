import { useState, useEffect, useCallback } from 'react';
import { fetchBillingData, creditsToShortReadable } from '../services/stripeApi';
import { useOrganization } from '../contexts/OrganizationContext';
import type { CreditActionType } from '../types/organization';
import { CREDIT_COSTS } from '../types/organization';

interface CreditState {
  creditsUsed: number;
  creditsLimit: number;
  bonusCredits: number;
  creditsRemaining: number;
  imageAdsGenerated: number;
  videoAdsGenerated: number;
  textAdsGenerated: number;
  loading: boolean;
  unlimited: boolean;
}

export function useCredits() {
  const { organization } = useOrganization();
  const [state, setState] = useState<CreditState>({
    creditsUsed: 0,
    creditsLimit: 0,
    bonusCredits: 0,
    creditsRemaining: 0,
    imageAdsGenerated: 0,
    videoAdsGenerated: 0,
    textAdsGenerated: 0,
    loading: true,
    unlimited: false,
  });

  const refresh = useCallback(async () => {
    try {
      const data = await fetchBillingData(organization?.id);
      const usage = data.usage;
      setState({
        creditsUsed: usage.creditsUsed ?? 0,
        creditsLimit: usage.creditsLimit ?? 0,
        bonusCredits: usage.bonusCredits ?? 0,
        creditsRemaining: usage.creditsRemaining ?? 0,
        imageAdsGenerated: usage.imageAdsGenerated ?? 0,
        videoAdsGenerated: usage.videoAdsGenerated ?? 0,
        textAdsGenerated: usage.textAdsGenerated ?? 0,
        loading: false,
        unlimited: usage.creditsLimit === -1,
      });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [organization?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const canAfford = useCallback((actionType: CreditActionType, quantity = 1): boolean => {
    if (state.unlimited) return true;
    const cost = CREDIT_COSTS[actionType] * quantity;
    return state.creditsRemaining >= cost;
  }, [state.unlimited, state.creditsRemaining]);

  const percentUsed = state.creditsLimit <= 0 || state.unlimited
    ? 0
    : Math.min(100, (state.creditsUsed / (state.creditsLimit + state.bonusCredits)) * 100);

  const colorClass = state.unlimited ? 'green'
    : percentUsed > 90 ? 'red'
    : percentUsed > 50 ? 'amber'
    : 'green';

  const humanReadable = creditsToShortReadable(state.creditsRemaining);

  return {
    ...state,
    refresh,
    canAfford,
    percentUsed,
    colorClass,
    humanReadable,
  };
}
