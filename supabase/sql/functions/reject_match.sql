CREATE OR REPLACE FUNCTION public.reject_match(match_id bigint, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  snap jsonb;
  admin_id uuid;
  rejector_id uuid;
BEGIN
  -- Get match data
  SELECT * INTO m FROM public.matches WHERE id = match_id FOR UPDATE;
  
  -- Validation
  IF m.status != 'pending' THEN
    RAISE EXCEPTION 'Match is not pending.';
  END IF;

  snap := m.elo_snapshot;
  rejector_id := auth.uid();

  -- 1. Log to activity_logs
  INSERT INTO public.activity_logs (actor_id, action, target_id, details)
  VALUES (
    rejector_id, 
    'MATCH_REJECT', 
    match_id::text, 
    jsonb_build_object(
      'reason', reason,
      'match_snapshot', row_to_json(m)
    )
  );

  -- 2. Increment Rejection Counter for the user performing the action
  UPDATE public.profiles 
  SET matches_rejected = matches_rejected + 1 
  WHERE id = rejector_id;

  -- 3. Notify Admin (Internal Message)
  -- Find the first admin (or a specific system admin)
  SELECT id INTO admin_id FROM public.profiles WHERE is_admin = true LIMIT 1;
  
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.messages (content, sender_id, receiver_id)
    VALUES (
      'Match #' || match_id || ' was rejected by user. Reason: ' || reason, 
      rejector_id, -- Sender is the user rejecting
      admin_id
    );
  END IF;

  -- 4. Perform a hard delete of the match
  DELETE FROM public.matches WHERE id = match_id;
END;
$$;
