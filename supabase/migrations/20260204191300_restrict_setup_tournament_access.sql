-- Restrict access to tournaments in 'setup' status
-- Only the creator (and admins) can view tournaments that are still being configured

-- Drop the existing public view policy
DROP POLICY IF EXISTS "Public can view tournaments" ON public.tournaments;

-- Create new policy that restricts setup tournaments to creators only
CREATE POLICY "Public can view tournaments"
ON public.tournaments FOR SELECT
USING (
  -- Allow if tournament is NOT in setup status (normal visibility rules apply via frontend)
  status != 'setup'
  OR
  -- Allow if user is the creator
  auth.uid() = created_by
  OR
  -- Allow if user is an admin
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);
