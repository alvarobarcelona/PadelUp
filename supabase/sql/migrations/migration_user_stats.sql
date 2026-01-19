-- Add counters for match validation and rejection auditing
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS matches_validated integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS matches_rejected integer DEFAULT 0;
