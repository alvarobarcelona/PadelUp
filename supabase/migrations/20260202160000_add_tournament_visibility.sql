-- Add visibility column to tournaments table
ALTER TABLE public.tournaments 
ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public' CHECK (visibility IN ('public', 'friends', 'private'));

-- Comment on column
COMMENT ON COLUMN public.tournaments.visibility IS 'Visibility setting: public, friends, or private';
