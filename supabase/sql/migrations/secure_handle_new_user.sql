-- Secure handle_new_user by setting search_path


CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (auth_id, username, email, first_name, last_name, main_club_id, elo)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    NULLIF(new.raw_user_meta_data->>'main_club_id', '')::integer,
    1150
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
