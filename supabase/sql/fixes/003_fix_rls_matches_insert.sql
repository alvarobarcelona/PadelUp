-- Secure Matches Table: Prevent public inserts
-- Only authenticated users should be able to create matches.
-- And they must identify themselves as the creator.

-- 1. Drop the insecure policy
DROP POLICY IF EXISTS "Public matches insert" ON public.matches;

-- 2. Create the secure policy
CREATE POLICY "Authenticated matches insert"
ON public.matches
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated' AND
  auth.uid() = created_by
);
