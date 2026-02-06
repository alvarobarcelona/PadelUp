-- Enable anon access to profiles for username/email uniqueness checks during sign-up
-- This fixes the "permission denied" error when checking availability before auth.

-- 1. Grant SELECT permission to anon
GRANT SELECT ON public.profiles TO anon;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);

-- 3. Just in case, ensure the sequence (if any) is usable, though profiles usually use uuid from auth.users
-- No sequence for profiles usually.
