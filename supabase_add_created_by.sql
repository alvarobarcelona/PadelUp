-- ADD created_by TO MATCHES
-- This is needed to prevent the creator (and their partner) from verifying their own match.

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id);

-- Optional: Update existing rows to have a created_by if possible?
-- We can't know for sure, but for pending matches created logic... 
-- Let's leave it null for old matches. Logic in UI will handle nulls (fallback to allow or just warn).
