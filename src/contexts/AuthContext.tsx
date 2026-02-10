import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface SignUpMetadata {
  full_name: string;
  company_name: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, metadata: SignUpMetadata) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>;
  isConfigured: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();

  useEffect(() => {
    if (!isConfigured) {
      // Fall back to localStorage-based auth for backwards compatibility
      const isAuthenticated = localStorage.getItem('convertra_authenticated') === 'true';
      if (isAuthenticated) {
        // Create a mock user from localStorage data
        const userData = localStorage.getItem('convertra_user');
        if (userData) {
          const parsed = JSON.parse(userData);
          setUser({
            id: 'local-user',
            email: parsed.email,
            user_metadata: {
              full_name: parsed.fullName,
              company_name: parsed.companyName,
            },
          } as unknown as User);
        }
      }
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isConfigured]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isConfigured) {
      // Fallback to localStorage auth
      localStorage.setItem('convertra_authenticated', 'true');
      const existingUser = localStorage.getItem('convertra_user');
      if (!existingUser) {
        // Create basic user data from email
        const namePart = email.split('@')[0].replace(/[._]/g, ' ');
        const fullName = namePart.split(' ').map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(' ');
        const companyName = email.split('@')[1]?.split('.')[0] || 'Company';
        localStorage.setItem('convertra_user', JSON.stringify({
          fullName,
          companyName: companyName.charAt(0).toUpperCase() + companyName.slice(1),
          email,
        }));
      }
      setUser({
        id: 'local-user',
        email,
        user_metadata: {},
      } as unknown as User);
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, [isConfigured]);

  const signUp = useCallback(async (email: string, password: string, metadata: SignUpMetadata) => {
    if (!isConfigured) {
      // Fallback to localStorage auth
      localStorage.setItem('convertra_authenticated', 'true');
      localStorage.setItem('convertra_user', JSON.stringify({
        fullName: metadata.full_name,
        companyName: metadata.company_name,
        email,
      }));
      setUser({
        id: 'local-user',
        email,
        user_metadata: metadata,
      } as unknown as User);
      return { error: null };
    }

    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: metadata.full_name,
          company_name: metadata.company_name,
        },
      },
    });

    if (error) {
      return { error };
    }

    // After successful signup, create organization and user records
    if (data.user) {
      try {
        await createOrganizationAndUser(data.user.id, email, metadata);
      } catch (err) {
        console.error('Failed to create organization:', err);
        // Don't return error - auth succeeded, org creation can be retried
      }
    }

    return { error: null };
  }, [isConfigured]);

  const signOut = useCallback(async () => {
    if (!isConfigured) {
      localStorage.removeItem('convertra_authenticated');
      localStorage.removeItem('convertra_user');
      setUser(null);
      setSession(null);
      return;
    }

    await supabase.auth.signOut();
  }, [isConfigured]);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    if (!isConfigured) {
      // For localStorage fallback, we can't actually send emails
      // Return success to not reveal account existence
      return { error: null };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  }, [isConfigured]);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!isConfigured) {
      // For localStorage fallback, just acknowledge the request
      return { error: null };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  }, [isConfigured]);

  const value: AuthContextValue = {
    session,
    user,
    loading,
    signIn,
    signUp,
    signOut,
    resetPasswordForEmail,
    updatePassword,
    isConfigured,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper function to create organization and user records after signup
async function createOrganizationAndUser(
  authId: string,
  email: string,
  metadata: SignUpMetadata
) {
  // Generate slug from company name
  const slug = metadata.company_name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Create organization on free plan — Stripe checkout will activate the trial
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: metadata.company_name,
      slug: `${slug}-${Date.now().toString(36)}`, // Ensure uniqueness
      setup_mode: 'self_service',
      plan_tier: 'free',
      subscription_status: 'incomplete',
    })
    .select()
    .single();

  if (orgError) {
    throw new Error(`Failed to create organization: ${orgError.message}`);
  }

  // Create user linked to organization
  const { error: userError } = await supabase
    .from('users')
    .insert({
      auth_id: authId,
      email,
      full_name: metadata.full_name,
      organization_id: org.id,
      role: 'owner',
      status: 'active',
    });

  if (userError) {
    // Rollback organization creation
    await supabase.from('organizations').delete().eq('id', org.id);
    throw new Error(`Failed to create user: ${userError.message}`);
  }
}
