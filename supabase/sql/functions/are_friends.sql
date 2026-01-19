-- Fix for "role mutable search_path" vulnerability
-- We explicitly set the search_path to 'public' to prevent malicious code execution from other schemas.

DROP FUNCTION IF EXISTS public.are_friends(uuid, uuid);

CREATE OR REPLACE FUNCTION public.are_friends(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public -- FIX: Explicit search_path
AS $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
    and (
      (user_id_1 = u1 and user_id_2 = u2) or
      (user_id_1 = u2 and user_id_2 = u1)
    )
  );
$$;
