-- Comprehensive fix for tournament RLS policies
-- This migration consolidates all tournament permission fixes

-- ============================================================================
-- STEP 1: Clean up ALL tournament-related policies to avoid conflicts
-- ============================================================================

-- Tournaments table
DROP POLICY IF EXISTS "Users can enable RLS for tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can insert their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can update their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can delete their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Participants can update tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Creators and participants can update tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Creators can update tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can create tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can update any tournament" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can delete any tournament" ON public.tournaments;

-- Tournament Participants table
DROP POLICY IF EXISTS "Public read access for tournament participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "Tournament creators can manage participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "Participants can update participant stats" ON public.tournament_participants;
DROP POLICY IF EXISTS "Admins can update tournament participants" ON public.tournament_participants;

-- Tournament Matches table
DROP POLICY IF EXISTS "Public read access for tournament matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Tournament creators can manage matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Participants can insert matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Participants can update matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Admins can update tournament matches" ON public.tournament_matches;

-- ============================================================================
-- STEP 2: Create clean, non-conflicting policies
-- ============================================================================

-- TOURNAMENTS TABLE
-- ----------------

-- SELECT: Everyone can view tournaments
CREATE POLICY "Public can view tournaments"
ON public.tournaments FOR SELECT
USING (true);

-- INSERT: Any authenticated user can create a tournament
CREATE POLICY "Authenticated users can create tournaments"
ON public.tournaments FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- UPDATE: Creator OR participants can update (for advancing rounds, finalizing)
CREATE POLICY "Creators and participants can update tournaments"
ON public.tournaments FOR UPDATE
USING (
  auth.uid() = created_by
  OR
  EXISTS (
    SELECT 1 FROM public.tournament_participants
    WHERE tournament_participants.tournament_id = tournaments.id
    AND tournament_participants.player_id = auth.uid()
  )
);

-- DELETE: Only creator can delete
CREATE POLICY "Creators can delete tournaments"
ON public.tournaments FOR DELETE
USING (auth.uid() = created_by);

-- TOURNAMENT PARTICIPANTS TABLE
-- -----------------------------

-- SELECT: Everyone can view participants
CREATE POLICY "Public can view participants"
ON public.tournament_participants FOR SELECT
USING (true);

-- INSERT/UPDATE/DELETE: Only tournament creator can manage participants
CREATE POLICY "Tournament creators can manage participants"
ON public.tournament_participants FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = tournament_participants.tournament_id
    AND tournaments.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = tournament_participants.tournament_id
    AND tournaments.created_by = auth.uid()
  )
);

-- UPDATE: Participants can update their own stats (via RPC, but policy allows it)
CREATE POLICY "Participants can update stats"
ON public.tournament_participants FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tournament_participants tp
    WHERE tp.tournament_id = tournament_participants.tournament_id
    AND tp.player_id = auth.uid()
  )
);

-- TOURNAMENT MATCHES TABLE
-- ------------------------

-- SELECT: Everyone can view matches
CREATE POLICY "Public can view matches"
ON public.tournament_matches FOR SELECT
USING (true);

-- INSERT: Creator OR participants can insert matches
CREATE POLICY "Creators and participants can insert matches"
ON public.tournament_matches FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tournament_participants
    WHERE tournament_participants.tournament_id = tournament_matches.tournament_id
    AND tournament_participants.player_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = tournament_matches.tournament_id
    AND tournaments.created_by = auth.uid()
  )
);

-- UPDATE: Creator OR participants can update matches (for scoring)
CREATE POLICY "Creators and participants can update matches"
ON public.tournament_matches FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tournament_participants
    WHERE tournament_participants.tournament_id = tournament_matches.tournament_id
    AND tournament_participants.player_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = tournament_matches.tournament_id
    AND tournaments.created_by = auth.uid()
  )
);

-- DELETE: Only creator can delete matches
CREATE POLICY "Creators can delete matches"
ON public.tournament_matches FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = tournament_matches.tournament_id
    AND tournaments.created_by = auth.uid()
  )
);
