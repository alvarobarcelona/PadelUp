-- Allow participants to manage matches (Insert/Update/Delete)
-- This is necessary for "Friends" tournaments where everyone helps with scoring

-- 1. Fix MATCHES Permissions
-- Drop old restrictive policy
DROP POLICY IF EXISTS "Tournament creators can manage matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Participants can insert matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Participants can update matches" ON public.tournament_matches;

-- Allow INSERT if user is a participant
CREATE POLICY "Participants can insert matches"
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

-- Allow UPDATE if user is a participant
CREATE POLICY "Participants can update matches"
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

-- 2. Fix TOURNAMENT Permissions (for Next Round update)
DROP POLICY IF EXISTS "Users can update their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Participants can update tournaments" ON public.tournaments;

CREATE POLICY "Participants can update tournaments"
ON public.tournaments FOR UPDATE
USING (
  -- Creator
  auth.uid() = created_by
  OR
  -- Participant
  EXISTS (
    SELECT 1 FROM public.tournament_participants
    WHERE tournament_participants.tournament_id = tournaments.id
    AND tournament_participants.player_id = auth.uid()
  )
);

-- 3. Fix PARTICIPANT Permissions (Setup & Scoring)
DROP POLICY IF EXISTS "Tournament creators can manage participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "Participants can update participant stats" ON public.tournament_participants;

-- 3a. Creators can do EVERYTHING (needed for Setup: Add/Remove players)
CREATE POLICY "Tournament creators can manage participants"
ON public.tournament_participants FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = tournament_participants.tournament_id
    AND tournaments.created_by = auth.uid()
  )
);

-- 3b. Participants can UPDATE stats (needed for Scoring, though RPC handles it now, good to keep for consistency)
CREATE POLICY "Participants can update participant stats"
ON public.tournament_participants FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tournament_participants tp
    WHERE tp.tournament_id = tournament_participants.tournament_id
    AND tp.player_id = auth.uid()
  )
);

-- 4. RPC for Secure Score Recalculation (Bypasses RLS)
CREATE OR REPLACE FUNCTION recalculate_tournament_scores(t_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Reset scores
  UPDATE tournament_participants
  SET score = 0, matches_played = 0
  WHERE tournament_id = t_id;

  -- 2. Sum points from completed matches
  WITH match_stats AS (
    SELECT
      unnest(ARRAY[team1_p1_text, team1_p2_text, team2_p1_text, team2_p2_text]) as p_name,
      unnest(ARRAY[score_team1, score_team1, score_team2, score_team2]) as points
    FROM tournament_matches
    WHERE tournament_id = t_id AND completed = true
  ),
  aggregated AS (
    SELECT p_name, SUM(points) as total_score, COUNT(*) as total_matches
    FROM match_stats
    WHERE p_name IS NOT NULL
    GROUP BY p_name
  )
  -- 3. Update participants
  UPDATE tournament_participants tp
  SET
    score = COALESCE(a.total_score, 0),
    matches_played = COALESCE(a.total_matches, 0)
  FROM aggregated a
  WHERE tp.tournament_id = t_id AND tp.display_name = a.p_name;
END;
$$;
