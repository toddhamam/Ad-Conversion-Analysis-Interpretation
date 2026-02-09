// Multi-Tenant Organization Types

export type PlanTier = 'free' | 'pro' | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
export type UserStatus = 'active' | 'invited' | 'suspended';
export type SetupMode = 'self_service' | 'white_glove';
export type CredentialStatus = 'active' | 'expired' | 'revoked' | 'error';
export type CredentialProvider = 'meta' | 'google' | 'tiktok';

// Organization (Tenant)
export interface Organization {
  id: string;
  name: string;
  slug: string;

  // Branding
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;

  // Billing
  stripe_customer_id: string | null;
  plan_tier: PlanTier;
  billing_interval: BillingInterval;
  subscription_status: SubscriptionStatus;
  subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;

  // Setup
  setup_mode: SetupMode;
  setup_completed: boolean;

  // Metadata
  created_at: string;
  updated_at: string;
}

// User linked to Organization
export interface User {
  id: string;
  auth_id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;

  // Organization membership
  organization_id: string;
  role: UserRole;

  // Platform admin flag
  is_super_admin: boolean;

  // Status
  status: UserStatus;

  // Metadata
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

// User with organization data (joined)
export interface UserWithOrganization extends User {
  organization: Organization;
}

// Organization Credentials (API tokens)
export interface OrganizationCredential {
  id: string;
  organization_id: string;
  provider: CredentialProvider;

  // Provider-specific fields (tokens are encrypted, not exposed to frontend)
  ad_account_id: string | null;
  page_id: string | null;
  pixel_id: string | null;
  business_id: string | null;

  // Token management
  token_expires_at: string | null;
  last_refreshed_at: string | null;
  scopes: string[] | null;

  // Status
  status: CredentialStatus;
  last_error: string | null;

  created_at: string;
  updated_at: string;
}

// Organization Invitation
export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: UserRole;
  invited_by: string | null;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

// Usage Tracking
export interface UsageTracking {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  creatives_generated: number;
  analyses_run: number;
  api_calls: number;
  created_at: string;
  updated_at: string;
}

// Audit Log Entry
export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_type: 'user' | 'super_admin' | 'system';
  action: string;
  resource_type: string;
  resource_id: string | null;
  organization_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// Plan Limits
export interface PlanLimits {
  creativesLimit: number;  // -1 for unlimited
  analysesLimit: number;   // -1 for unlimited
  channelsLimit: number;
  teamMembersLimit: number;
  hasPrioritySupport: boolean;
  hasCustomBranding: boolean;
  hasApiAccess: boolean;
  hasDedicatedManager: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    creativesLimit: 10,
    analysesLimit: 5,
    channelsLimit: 1,
    teamMembersLimit: 1,
    hasPrioritySupport: false,
    hasCustomBranding: false,
    hasApiAccess: false,
    hasDedicatedManager: false,
  },
  pro: {
    creativesLimit: 100,
    analysesLimit: 50,
    channelsLimit: 3,
    teamMembersLimit: 5,
    hasPrioritySupport: true,
    hasCustomBranding: false,
    hasApiAccess: true,
    hasDedicatedManager: false,
  },
  enterprise: {
    creativesLimit: -1,  // Unlimited
    analysesLimit: -1,   // Unlimited
    channelsLimit: -1,   // Unlimited
    teamMembersLimit: -1, // Unlimited
    hasPrioritySupport: true,
    hasCustomBranding: true,
    hasApiAccess: true,
    hasDedicatedManager: true,
  },
};

// API Request/Response types for Admin Portal

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;  // Auto-generated if not provided
  plan_tier: PlanTier;
  setup_mode: SetupMode;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  owner_email: string;  // Email to send invitation to
  owner_name: string;
}

export interface CreateOrganizationResponse {
  organization: Organization;
  invitation: OrganizationInvitation;
}

export interface UpdateOrganizationRequest {
  name?: string;
  slug?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  plan_tier?: PlanTier;
  setup_completed?: boolean;
}

export interface CreateInvitationRequest {
  organization_id: string;
  email: string;
  role: UserRole;
}

export interface AcceptInvitationRequest {
  token: string;
  full_name: string;
  password: string;
}

// Context types

export interface OrganizationContextValue {
  organization: Organization | null;
  user: User | null;
  isOwner: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isTrialing: boolean;
  isSubscriptionValid: boolean;
  trialDaysRemaining: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export interface AuthContextValue {
  session: unknown | null;  // Supabase Session
  user: unknown | null;     // Supabase User (from auth.users)
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, metadata: SignUpMetadata) => Promise<void>;
  signOut: () => Promise<void>;
}

export interface SignUpMetadata {
  full_name: string;
  company_name: string;
}
