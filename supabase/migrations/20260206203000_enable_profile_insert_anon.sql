-- Enable anon INSERT access to profiles
-- This is required when profile creation happens client-side immediately after sign-up
-- but before the session is fully established (or if email confirmation is pending, leaving the user as anon).

-- 1. Grant INSERT permission to anon
GRANT INSERT ON public.profiles TO anon;

-- 2. Ensure RLS Policy allows insert
-- We drop to ensure no conflict
DROP POLICY IF EXISTS "Public profiles are insertable by everyone" ON public.profiles;

CREATE POLICY "Public profiles are insertable by everyone" 
ON public.profiles FOR INSERT 
WITH CHECK (true);
-- Note: Ideally we should restrict this to `auth.uid() = id` but for anon inserts we can't check auth.uid().
-- The client must rely on the backend constraints (foreign key to auth.users) or we trust the flow for now.
-- In a stricter setup, we would use a Postgres function with SECURITY DEFINER or a webhook.
