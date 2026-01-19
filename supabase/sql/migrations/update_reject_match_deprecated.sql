-- UDPATE reject_match TO DELETE INSTEAD OF UPDATE
-- The user requested that rejecting a match should completely delete it.

CREATE OR REPLACE FUNCTION public.reject_match(match_id bigint)
RETURNS void AS $$
BEGIN
  -- Perform a hard delete of the match
  DELETE FROM public.matches WHERE id = match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
