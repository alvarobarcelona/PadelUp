-- Fix permissions and grants for tournament-related tables
-- This ensures the API is enabled for these tables in the local environment

-- 1. Grant permissions to authenticated, anon and service_role roles
-- This resolves the "API DISABLED" warning and 403 Forbidden errors
GRANT ALL ON TABLE public.tournaments TO authenticated;
GRANT ALL ON TABLE public.tournaments TO service_role;
GRANT SELECT ON TABLE public.tournaments TO anon;

GRANT ALL ON TABLE public.tournament_participants TO authenticated;
GRANT ALL ON TABLE public.tournament_participants TO service_role;
GRANT SELECT ON TABLE public.tournament_participants TO anon;

GRANT ALL ON TABLE public.tournament_matches TO authenticated;
GRANT ALL ON TABLE public.tournament_matches TO service_role;
GRANT SELECT ON TABLE public.tournament_matches TO anon;

-- 2. Grant permissions on sequences (required for identity columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 3. Ensure RLS is enabled (just in case)
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- 4. Re-verify policies for tournament_participants to ensure no gaps
-- Everyone can select
DROP POLICY IF EXISTS "Public can view participants" ON public.tournament_participants;
CREATE POLICY "Public can view participants" ON public.tournament_participants FOR SELECT USING (true);

-- Creator can do anything else
DROP POLICY IF EXISTS "Tournament creators can manage participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "Tournament creators can insert participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "Tournament creators can update participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "Tournament creators can delete participants" ON public.tournament_participants;

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
