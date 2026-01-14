-- Fix for "role mutable search_path" vulnerability in handle_new_user
-- We explicitly set the search_path to 'public'.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, approved)
  VALUES (new.id, new.raw_user_meta_data->>'username', new.email, false);
  RETURN new;
END;
$$;
