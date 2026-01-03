-- PEER VERIFICATION SYSTEM MIGRATION

-- 1. Modify MATCHES table
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
ADD COLUMN IF NOT EXISTS auto_confirm_at timestamp with time zone DEFAULT (now() + interval '24 hours'),
ADD COLUMN IF NOT EXISTS elo_snapshot jsonb;

-- 2. Create ELO Calculation Helper (PL/pgSQL)
-- We need to replicate the JS ELO logic in SQL or just trust the inputs if we calculated snapshots in JS?
-- BETTER APPROACH: The frontend calculates the potential ELO changes and saves them in 'elo_snapshot' when creating the match.
-- The 'confirm_match' function simply applies these snapshot values. This avoids re-implementing complex ELO math in SQL.

-- 3. Function: Confirm Match
CREATE OR REPLACE FUNCTION public.confirm_match(match_id bigint)
RETURNS void AS $$
DECLARE
  m record;
  snap jsonb;
BEGIN
  -- Get match data
  SELECT * INTO m FROM public.matches WHERE id = match_id;
  
  -- Validation
  IF m.status != 'pending' THEN
    RAISE EXCEPTION 'Match is not pending.';
  END IF;

  snap := m.elo_snapshot;

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

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function: Reject Match
CREATE OR REPLACE FUNCTION public.reject_match(match_id bigint)
RETURNS void AS $$
BEGIN
  UPDATE public.matches SET status = 'rejected' WHERE id = match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function: Process Expired Matches (Auto-Accept)
CREATE OR REPLACE FUNCTION public.process_expired_matches()
RETURNS void AS $$
DECLARE
  m record;
BEGIN
  -- Find all pending matches that have passed their auto_confirm_at time
  FOR m IN SELECT id FROM public.matches WHERE status = 'pending' AND auto_confirm_at < now() LOOP
    PERFORM public.confirm_match(m.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
