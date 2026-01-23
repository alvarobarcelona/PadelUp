-- 1. Add columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text;

-- 2. Update the handle_new_user trigger function to capture metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (auth_id, username, email, first_name, last_name, elo)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'username', 
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    1200
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (auth_id, username, first_name, last_name, elo)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'username', 
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    1150
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
