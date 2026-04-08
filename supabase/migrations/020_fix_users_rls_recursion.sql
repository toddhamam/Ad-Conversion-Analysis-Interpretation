-- Fix "infinite recursion detected in policy for relation 'users'"
--
-- The original policy "Users can view org members" queries the users table
-- from within a policy ON the users table, causing infinite recursion.
--
-- All frontend queries filter by auth_id = auth.uid() (own row only).
-- Backend API routes use the service role key (bypasses RLS entirely).
-- So the policy just needs to allow users to read their own row.

-- Drop the recursive policy and its SECURITY DEFINER function (if previously attempted)
DROP POLICY IF EXISTS "Users can view org members" ON users;
DROP FUNCTION IF EXISTS public.current_user_organization_id();

-- Simple non-recursive replacement: users can read their own row
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth_id = auth.uid());

-- Force PostgREST to see the changes
NOTIFY pgrst, 'reload schema';
