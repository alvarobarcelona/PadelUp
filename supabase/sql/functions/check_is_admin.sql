-- Fix for "role mutable search_path" vulnerability in check_is_admin
-- We explicitly set the search_path to 'public'.

CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the current user (auth.uid()) exists in profiles with is_admin = true
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() 
    AND is_admin = true
  );
END;
$$;
