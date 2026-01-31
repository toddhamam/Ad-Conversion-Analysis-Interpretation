-- Multi-Tenant Schema for Convertra
-- This migration creates the foundation for multi-tenant SaaS with:
-- - Organizations (tenants) with branding and billing
-- - Users linked to organizations with roles
-- - Encrypted API credentials per tenant
-- - Team invitation system
-- - Row Level Security for data isolation

-- =============================================================================
-- ORGANIZATIONS TABLE (Tenants)
-- =============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,  -- URL-friendly identifier for subdomain: {slug}.convertra.io

  -- Branding
  logo_url TEXT,
  primary_color TEXT DEFAULT '#d4e157',   -- Lime accent (default Convertra brand)
  secondary_color TEXT DEFAULT '#a855f7', -- Violet accent

  -- Billing (linked to Stripe)
  stripe_customer_id TEXT UNIQUE,
  plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
  billing_interval TEXT DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Setup mode
  setup_mode TEXT DEFAULT 'self_service' CHECK (setup_mode IN ('self_service', 'white_glove')),
  setup_completed BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON organizations(stripe_customer_id);

-- =============================================================================
-- USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE NOT NULL,  -- Supabase Auth UID (from auth.users)
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,

  -- Organization membership
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),

  -- Platform admin flag (for Convertra staff)
  is_super_admin BOOLEAN DEFAULT false,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),

  -- Metadata
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- =============================================================================
-- ORGANIZATION CREDENTIALS TABLE (Encrypted API tokens)
-- =============================================================================
CREATE TABLE IF NOT EXISTS organization_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,  -- 'meta', 'google', 'tiktok', etc.

  -- Encrypted credential storage (encrypt at application level before storing)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,

  -- Provider-specific fields
  ad_account_id TEXT,      -- Meta: act_XXXXXXXXX
  page_id TEXT,            -- Meta: Facebook page ID
  business_id TEXT,        -- Meta: Business Manager ID

  -- Token management
  token_expires_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  scopes TEXT[],           -- Array of granted OAuth scopes

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One credential per provider per organization
  UNIQUE(organization_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_credentials_organization ON organization_credentials(organization_id);

-- =============================================================================
-- ORGANIZATION INVITATIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by UUID REFERENCES users(id),

  -- Invitation token (secure, time-limited)
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One pending invitation per email per organization
  UNIQUE(organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_organization ON organization_invitations(organization_id);

-- =============================================================================
-- USAGE TRACKING TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Usage counts (reset each billing period)
  creatives_generated INTEGER DEFAULT 0,
  analyses_run INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One record per organization per billing period
  UNIQUE(organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_organization ON usage_tracking(organization_id);

-- =============================================================================
-- AUDIT LOG TABLE (Track admin actions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'super_admin', 'system')),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,  -- 'organization', 'user', 'credential', 'invitation', etc.
  resource_id UUID,
  organization_id UUID REFERENCES organizations(id),
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_organization ON audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- =============================================================================
-- ADD ORGANIZATION_ID TO EXISTING FUNNEL_EVENTS TABLE
-- =============================================================================
-- Note: Run this only if funnel_events table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'funnel_events') THEN
    IF NOT EXISTS (SELECT FROM information_schema.columns
                   WHERE table_name = 'funnel_events' AND column_name = 'organization_id') THEN
      ALTER TABLE funnel_events ADD COLUMN organization_id UUID REFERENCES organizations(id);
      CREATE INDEX IF NOT EXISTS idx_funnel_events_organization ON funnel_events(organization_id);
      CREATE INDEX IF NOT EXISTS idx_funnel_events_org_date ON funnel_events(organization_id, created_at);
    END IF;
  END IF;
END $$;

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all tenant tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can view their own organization
CREATE POLICY "Users can view own organization" ON organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

-- Organizations: Owners can update their organization
CREATE POLICY "Owners can update own organization" ON organizations
  FOR UPDATE USING (
    id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid() AND role = 'owner')
  );

-- Users: Can see other users in same organization
CREATE POLICY "Users can view org members" ON users
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

-- Users: Can update own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth_id = auth.uid());

-- Credentials: Only admins/owners can view credentials
CREATE POLICY "Admins can view org credentials" ON organization_credentials
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Credentials: Only owners can manage credentials
CREATE POLICY "Owners can manage credentials" ON organization_credentials
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role = 'owner'
    )
  );

-- Invitations: Admins can view org invitations
CREATE POLICY "Admins can view org invitations" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Invitations: Admins can create invitations
CREATE POLICY "Admins can create invitations" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Usage: Users can view org usage
CREATE POLICY "Users can view org usage" ON usage_tracking
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to generate URL-safe slug from organization name
CREATE OR REPLACE FUNCTION generate_slug(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at
  BEFORE UPDATE ON organization_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_updated_at
  BEFORE UPDATE ON usage_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- NOTES FOR SUPER ADMIN ACCESS
-- =============================================================================
-- Super admins bypass RLS by using the SUPABASE_SERVICE_ROLE_KEY in API routes.
-- The service role key has full access to all tables regardless of RLS policies.
-- All admin API routes (/api/admin/*) should use the service role key.
