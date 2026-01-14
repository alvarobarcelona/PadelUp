-- Fix for "role mutable search_path" vulnerability in confirm_match
-- AND Implementation of Validation Counter logic
-- We explicitly set the search_path to 'public'.

CREATE OR REPLACE FUNCTION public.confirm_match(match_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  snap jsonb;
  confirmator_id uuid;
BEGIN
  -- Get match data
  SELECT * INTO m FROM public.matches WHERE id = match_id;
  
  -- Validation
  IF m.status != 'pending' THEN
    RAISE EXCEPTION 'Match is not pending.';
  END IF;

  snap := m.elo_snapshot;
  confirmator_id := auth.uid();

  -- Update Players ELO from the snapshot
  -- Snapshot format expected: { "t1p1": 1200, "t1p2": 1150, ... } (Calculated NEW ELOs)
  
  -- Team 1
  UPDATE public.profiles SET elo = (snap->>'t1p1')::int WHERE id = m.team1_p1;
  UPDATE public.profiles SET elo = (snap->>'t1p2')::int WHERE id = m.team1_p2;
  
  -- Team 2
  UPDATE public.profiles SET elo = (snap->>'t2p1')::int WHERE id = m.team2_p1;
  UPDATE public.profiles SET elo = (snap->>'t2p2')::int WHERE id = m.team2_p2;

  -- Mark as Confirmed
  UPDATE public.matches SET status = 'confirmed' WHERE id = match_id;

  -- Increment Validation Counter for the user confirming
  -- Note: If triggered by system (auto-confirm), auth.uid() might be null or system user.
  -- We only increment if a real user is performing the action.
  IF confirmator_id IS NOT NULL THEN
      UPDATE public.profiles 
      SET matches_validated = matches_validated + 1 
      WHERE id = confirmator_id;
  END IF;

END;
$$;
