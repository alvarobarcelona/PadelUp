-- Secure Matches Table: Prevent public deletion
-- Strategy: DROP and RE-CREATE to avoid 'ALTER' issues.

-- 1. Drop the insecure policy if it exists
DROP POLICY IF EXISTS "Public matches delete" ON public.matches;
DROP POLICY IF EXISTS "Admin matches delete" ON public.matches; -- In case it was partially created

-- 2. Create the secure policy
-- This ensures only admins can delete directly.
CREATE POLICY "Admin matches delete"
ON public.matches
FOR DELETE
USING (
  public.check_is_admin()
);
