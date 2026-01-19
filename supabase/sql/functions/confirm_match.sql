-- Refactored confirm_match to calculate ELO server-side
-- Fixes issue with sequential updates relying on stale snapshots
CREATE OR REPLACE FUNCTION public.confirm_match(match_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  confirmator_id uuid;
  
  -- Player Data
  p1_elo int; p2_elo int; p3_elo int; p4_elo int;
  p1_matches int; p2_matches int; p3_matches int; p4_matches int;
  
  -- Calculations
  k1 int; k2 int; k3 int; k4 int;
  t1_avg float; t2_avg float;
  t1_expected float; t2_expected float;
  t1_score float; t2_score float;
  
  -- New Ratings
  new_p1_elo int; new_p2_elo int; new_p3_elo int; new_p4_elo int;
  
  new_snapshot jsonb;
BEGIN
  -- 1. Get match data
  SELECT * INTO m FROM public.matches WHERE id = match_id;
  
  IF m.status != 'pending' THEN
    RAISE EXCEPTION 'Match is not pending.';
  END IF;

  confirmator_id := auth.uid();

  -- 2. Get Current Stats (ELO and Match Counts) for all players
  -- We assume 1150 if e.g. profile missing (shouldn't happen) or elo null
  
  -- Team 1 Player 1
  SELECT elo INTO p1_elo FROM public.profiles WHERE id = m.team1_p1;
  SELECT count(*) INTO p1_matches FROM public.matches 
  WHERE status = 'confirmed' AND (team1_p1 = m.team1_p1 OR team1_p2 = m.team1_p1 OR team2_p1 = m.team1_p1 OR team2_p2 = m.team1_p1);
  
  -- Team 1 Player 2
  SELECT elo INTO p2_elo FROM public.profiles WHERE id = m.team1_p2;
  SELECT count(*) INTO p2_matches FROM public.matches 
  WHERE status = 'confirmed' AND (team1_p1 = m.team1_p2 OR team1_p2 = m.team1_p2 OR team2_p1 = m.team1_p2 OR team2_p2 = m.team1_p2);

  -- Team 2 Player 1
  SELECT elo INTO p3_elo FROM public.profiles WHERE id = m.team2_p1;
  SELECT count(*) INTO p3_matches FROM public.matches 
  WHERE status = 'confirmed' AND (team1_p1 = m.team2_p1 OR team1_p2 = m.team2_p1 OR team2_p1 = m.team2_p1 OR team2_p2 = m.team2_p1);

  -- Team 2 Player 2
  SELECT elo INTO p4_elo FROM public.profiles WHERE id = m.team2_p2;
  SELECT count(*) INTO p4_matches FROM public.matches 
  WHERE status = 'confirmed' AND (team1_p1 = m.team2_p2 OR team1_p2 = m.team2_p2 OR team2_p1 = m.team2_p2 OR team2_p2 = m.team2_p2);

  -- Defaults
  p1_elo := COALESCE(p1_elo, 1150);
  p2_elo := COALESCE(p2_elo, 1150);
  p3_elo := COALESCE(p3_elo, 1150);
  p4_elo := COALESCE(p4_elo, 1150);

  -- 3. Calculate K-Factors
  k1 := public.get_k_factor(p1_matches);
  k2 := public.get_k_factor(p2_matches);
  k3 := public.get_k_factor(p3_matches);
  k4 := public.get_k_factor(p4_matches);

  -- 4. Calculate Averages
  t1_avg := (p1_elo + p2_elo) / 2.0;
  t2_avg := (p3_elo + p4_elo) / 2.0;

  -- 5. Calculate Expected Scores
  t1_expected := public.calculate_expected_score(round(t1_avg)::int, round(t2_avg)::int);
  t2_expected := public.calculate_expected_score(round(t2_avg)::int, round(t1_avg)::int);

  -- 6. Determine Actual Scores based on Winner
  IF m.winner_team = 1 THEN
    t1_score := 1.0;
    t2_score := 0.0;
  ELSE
    t1_score := 0.0;
    t2_score := 1.0;
  END IF;

  -- 7. Calculate New Ratings
  new_p1_elo := public.calculate_new_rating(p1_elo, t1_score, t1_expected, k1);
  new_p2_elo := public.calculate_new_rating(p2_elo, t1_score, t1_expected, k2);
  new_p3_elo := public.calculate_new_rating(p3_elo, t2_score, t2_expected, k3);
  new_p4_elo := public.calculate_new_rating(p4_elo, t2_score, t2_expected, k4);

  -- 8. Prepare Snapshot
  new_snapshot := jsonb_build_object(
    't1p1', new_p1_elo,
    't1p2', new_p2_elo,
    't2p1', new_p3_elo,
    't2p2', new_p4_elo
  );

  -- 9. Update Database

  -- Update Players
  UPDATE public.profiles SET elo = new_p1_elo WHERE id = m.team1_p1;
  UPDATE public.profiles SET elo = new_p2_elo WHERE id = m.team1_p2;
  UPDATE public.profiles SET elo = new_p3_elo WHERE id = m.team2_p1;
  UPDATE public.profiles SET elo = new_p4_elo WHERE id = m.team2_p2;

  -- Update Match (Status + New Snapshot)
  UPDATE public.matches 
  SET status = 'confirmed', elo_snapshot = new_snapshot 
  WHERE id = match_id;

  -- Increment Validation Counter (if real user)
  IF confirmator_id IS NOT NULL THEN
      UPDATE public.profiles 
      SET matches_validated = matches_validated + 1 
      WHERE id = confirmator_id;
  END IF;

END;
$$;
