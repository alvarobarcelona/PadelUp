-- FIX ADMIN POLICY (RLS RECURSION ISSUE)
-- The previous policy likely caused infinite recursion or silent failure.

-- 1. Create a Secure Function to check Admin Status
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if the current user (auth.uid()) exists in profiles with is_admin = true
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid() 
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SECURITY DEFINER means this function runs with the privileges of the creator (postgres), bypassing RLS.

-- 2. Drop the old problematic policy
DROP POLICY IF EXISTS "Admins can update anyone" ON profiles;

-- 3. Create the new clean Policy
CREATE POLICY "Admins can update anyone"
ON profiles
FOR UPDATE
USING ( public.check_is_admin() );

-- 4. Also ensure Admins can DELETE users if needed (e.g. banning)
DROP POLICY IF EXISTS "Admins can delete users" ON profiles;
CREATE POLICY "Admins can delete users"
ON profiles
FOR DELETE
USING ( public.check_is_admin() );
