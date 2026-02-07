-- Migration: Fix RLS Policies for Matches Table
-- Date: 2026-02-07

-- 1. Ensure RLS is enabled (safe to re-run)
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- 2. Drop any potentially conflicting policies to ensure a clean slate
DROP POLICY IF EXISTS "Public matches access" ON public.matches;
DROP POLICY IF EXISTS "Authenticated matches insert" ON public.matches;
DROP POLICY IF EXISTS "Admin matches delete" ON public.matches;
DROP POLICY IF EXISTS "Admins can update matches" ON public.matches; -- In case it exists under this name
DROP POLICY IF EXISTS "Admins can manage matches" ON public.matches;

-- 3. Define Comprehensive Policies

-- SELECT: Public can view matches (needed for public rankings, history, etc.)
CREATE POLICY "Public matches access"
ON public.matches FOR SELECT
USING (true);

-- INSERT: Authenticated users can create matches (e.g., logging a game)
CREATE POLICY "Authenticated matches insert"
ON public.matches FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Admins can update ANY match
CREATE POLICY "Admins can update matches"
ON public.matches FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  )
);

-- DELETE: Admins can delete ANY match
CREATE POLICY "Admin matches delete"
ON public.matches FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  )
);

-- DELETE: Creator can delete their OWN match
-- User explicitly requested this policy for now.
CREATE POLICY "Creators can delete their matches"
ON public.matches FOR DELETE
USING (auth.uid() = created_by);
