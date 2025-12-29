-- APPROVAL SYSTEM MIGRATION
-- Run this in your Supabase SQL Editor

-- 1. Add 'approved' column (Default false for NEW users)
alter table profiles 
add column if not exists approved boolean default false;

-- 2. Approve all EXISTING users (so you don't lock yourself or friends out)
update profiles set approved = true where approved is null or approved = false;

-- 3. RLS: Ensure everyone can read their OWN profile status
-- (This is usually covered by "Public access" policies, but let's be safe)
-- Note: We generally kept 'select' public in previous steps, so unapproved users can still log in.
-- We will handle the "blocking" in the UI (Client-side redirect).

-- 4. Admin Management
-- Admins need to be able to Update this column.
-- The existing "Users can update own profile" is for SELF.
-- Admins need a policy to update OTHERS.

create policy "Admins can update anyone"
on profiles for update
using (
  auth.uid() in (select auth_id from profiles where is_admin = true)
);

-- Done! Now update the UI to check for 'approved'.
