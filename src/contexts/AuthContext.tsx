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
  signUp: (email: string, password: string, metadata: SignUpMetadata) => Promise<{ error: AuthError | null; confirmationPending?: boolean }>;
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
      // Fallback to localStorage auth — no email confirmation
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
      return { error: null, confirmationPending: false };
    }

    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: metadata.full_name,
          company_name: metadata.company_name,
        },
      },
    });

    if (error) {
      return { error };
    }

    // If session exists, email confirmation is disabled (dev mode) — proceed immediately
    if (data.session) {
      setSession(data.session);
      setUser(data.user);
      return { error: null, confirmationPending: false };
    }

    // Email confirmation required — do NOT set user/session state.
    // User will click the confirmation link, which redirects to /dashboard.
    // Supabase's detectSessionInUrl will establish the session at that point.
    return { error: null, confirmationPending: true };
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

