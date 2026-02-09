import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getTenantSlug } from '../lib/tenant';
import { useAuth } from './AuthContext';
import { loadOrgMetaCredentials } from '../services/metaApi';
import type { Organization, User as AppUser, OrganizationContextValue } from '../types/organization';

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser, session, loading: authLoading, isConfigured } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizationData = useCallback(async () => {
    if (!authUser) {
      setOrganization(null);
      setUser(null);
      setLoading(false);
      return;
    }

    if (!isConfigured) {
      // Fallback: Load from localStorage for backwards compatibility
      const userData = localStorage.getItem('convertra_user');
      if (userData) {
        const parsed = JSON.parse(userData);
        // Create mock organization from localStorage data
        setOrganization({
          id: 'local-org',
          name: parsed.companyName || 'My Company',
          slug: 'local',
          logo_url: parsed.companyLogo || null,
          primary_color: '#d4e157',
          secondary_color: '#a855f7',
          stripe_customer_id: parsed.stripeCustomerId || null,
          plan_tier: 'free',
          billing_interval: 'monthly',
          subscription_status: 'active',
          subscription_id: null,
          current_period_start: null,
          current_period_end: null,
          setup_mode: 'self_service',
          setup_completed: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setUser({
          id: 'local-user',
          auth_id: authUser.id,
          email: parsed.email || authUser.email || '',
          full_name: parsed.fullName || 'User',
          avatar_url: null,
          organization_id: 'local-org',
          role: 'owner',
          is_super_admin: false, // Never grant super admin in fallback mode
          status: 'active',
          last_login_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check if we're on a tenant subdomain
      const tenantSlug = getTenantSlug();

      if (tenantSlug) {
        // Load organization by slug (subdomain routing)
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('slug', tenantSlug)
          .single();

        if (orgError || !org) {
          setError(`Organization "${tenantSlug}" not found`);
          setLoading(false);
          return;
        }

        // Load user's membership in this organization
        const { data: appUser, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('auth_id', authUser.id)
          .eq('organization_id', org.id)
          .single();

        if (userError || !appUser) {
          setError('You do not have access to this organization');
          setLoading(false);
          return;
        }

        setOrganization(org as Organization);
        setUser(appUser as AppUser);
      } else {
        // Load user's primary organization
        const { data: appUser, error: userError } = await supabase
          .from('users')
          .select(`
            *,
            organization:organizations(*)
          `)
          .eq('auth_id', authUser.id)
          .single();

        if (userError || !appUser) {
          // User exists in auth but not in users/organizations tables yet
          // Call backend API to provision (uses service role key to bypass RLS)
          console.log('No user record found, provisioning via backend API...', {
            authId: authUser.id,
            email: authUser.email,
            userError: userError?.message || null,
          });
          const meta = authUser.user_metadata || {};

          try {
            const provisionHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
              provisionHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }
            const provisionRes = await fetch('/api/seo-iq/provision-org', {
              method: 'POST',
              headers: provisionHeaders,
              body: JSON.stringify({
                authId: authUser.id,
                email: authUser.email || '',
                fullName: meta.full_name || authUser.email || 'User',
                companyName: meta.company_name || meta.full_name || 'My Company',
              }),
            });

            if (!provisionRes.ok) {
              const errData = await provisionRes.json().catch(() => ({}));
              console.error('Provision API error:', provisionRes.status, errData);
              setError(`Failed to set up organization (${provisionRes.status}). Please try again.`);
              setLoading(false);
              return;
            }

            const provisionData = await provisionRes.json();
            if (!provisionData.organization || !provisionData.user) {
              console.error('Provision response missing data:', provisionData);
              setError('Organization setup returned incomplete data. Please try again.');
              setLoading(false);
              return;
            }
            setOrganization(provisionData.organization as Organization);
            setUser(provisionData.user as AppUser);
          } catch (provisionErr) {
            console.error('Provision request failed:', provisionErr);
            setError('Failed to connect to server. Please check your connection and try again.');
            setLoading(false);
            return;
          }
        } else {
          setOrganization(appUser.organization as Organization);
          setUser({
            ...appUser,
            organization: undefined, // Remove nested org from user object
          } as AppUser);
        }
      }

    } catch (err) {
      console.error('Failed to load organization:', err);
      setError('Failed to load organization data');
    } finally {
      setLoading(false);
    }
  }, [authUser, session, isConfigured]);

  // Load organization data when auth user changes
  useEffect(() => {
    if (!authLoading) {
      loadOrganizationData();
    }
  }, [authUser, authLoading, loadOrganizationData]);

  // Apply branding and load Meta credentials when organization changes
  useEffect(() => {
    if (organization) {
      applyBranding(organization);
      loadOrgMetaCredentials();
    }
  }, [organization]);

  // Compute trial/subscription status
  const isTrialing = organization?.subscription_status === 'trialing';
  const trialEndDate = organization?.current_period_end ? new Date(organization.current_period_end) : null;
  const trialDaysRemaining = isTrialing && trialEndDate
    ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isSubscriptionValid =
    organization?.subscription_status === 'active' ||
    organization?.subscription_status === 'past_due' ||
    (isTrialing && trialDaysRemaining > 0);

  const value: OrganizationContextValue = {
    organization,
    user,
    isOwner: user?.role === 'owner',
    isAdmin: user?.role === 'owner' || user?.role === 'admin',
    isSuperAdmin: user?.is_super_admin ?? false,
    isTrialing,
    isSubscriptionValid,
    trialDaysRemaining,
    loading: authLoading || loading,
    error,
    refresh: loadOrganizationData,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

/**
 * Apply organization branding to CSS custom properties
 */
function applyBranding(org: Organization): void {
  const root = document.documentElement;

  // Only apply custom branding if organization has non-default colors
  if (org.primary_color && org.primary_color !== '#d4e157') {
    root.style.setProperty('--accent-primary', org.primary_color);
    root.style.setProperty('--accent-secondary', adjustBrightness(org.primary_color, -10));
    root.style.setProperty('--accent-glow', hexToRgba(org.primary_color, 0.3));
  }

  if (org.secondary_color && org.secondary_color !== '#a855f7') {
    root.style.setProperty('--accent-violet', org.secondary_color);
    root.style.setProperty('--accent-violet-glow', hexToRgba(org.secondary_color, 0.15));
  }
}

/**
 * Adjust hex color brightness
 */
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

/**
 * Convert hex color to rgba
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
