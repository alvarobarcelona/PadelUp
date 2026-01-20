-- Fix handle_new_user to correctly handle empty or '0' main_club_id
-- This prevents FK violations when no club is selected during signup

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  _main_club_id integer;
BEGIN
  -- Parse main_club_id: treat empty string, '0', or null as NULL
  _main_club_id := NULLIF(NULLIF(new.raw_user_meta_data->>'main_club_id', ''), '0')::integer;

  INSERT INTO public.profiles (auth_id, username, email, first_name, last_name, main_club_id, elo)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    _main_club_id,
    1150
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
