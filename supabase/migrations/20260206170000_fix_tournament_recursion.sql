-- Surgical fix for Tournament RLS recursion
-- This migration splits the "FOR ALL" policy on participants to avoid circular loops during SELECT operations.

-- 1. Split participants policy
DROP POLICY IF EXISTS "Tournament creators can manage participants" ON public.tournament_participants;

CREATE POLICY "Tournament creators can insert participants"
ON public.tournament_participants FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = tournament_participants.tournament_id
    AND tournaments.created_by = auth.uid()
  )
);

CREATE POLICY "Tournament creators can update participants"
ON public.tournament_participants FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = tournament_participants.tournament_id
    AND tournaments.created_by = auth.uid()
  )
);

CREATE POLICY "Tournament creators can delete participants"
ON public.tournament_participants FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tournaments.id = tournament_participants.tournament_id
    AND tournaments.created_by = auth.uid()
  )
);

-- Note: "Public read access for tournament participants" (SELECT) remains as is (USING true), which breaks the loop. index
