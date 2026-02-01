-- Migration: Enable Safe User Deletion (Ghost Players)
-- Date: 2026-01-31
-- Purpose: Allow deleting users without breaking match history.
-- Action: Set all player FKs to ON DELETE SET NULL.

BEGIN;

-- 1. Ensure columns are NULLABLE (Safeguard)
ALTER TABLE public.matches ALTER COLUMN team1_p1 DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN team1_p2 DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN team2_p1 DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN team2_p2 DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN created_by DROP NOT NULL;

-- 2. Drop existing Foreign Key constraints
-- Note: Supabase/Postgres default naming is table_column_fkey
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_team1_p1_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_team1_p2_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_team2_p1_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_team2_p2_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_created_by_fkey;

-- 3. Re-create constraints with ON DELETE SET NULL
ALTER TABLE public.matches
    ADD CONSTRAINT matches_team1_p1_fkey
    FOREIGN KEY (team1_p1)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

ALTER TABLE public.matches
    ADD CONSTRAINT matches_team1_p2_fkey
    FOREIGN KEY (team1_p2)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

ALTER TABLE public.matches
    ADD CONSTRAINT matches_team2_p1_fkey
    FOREIGN KEY (team2_p1)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

ALTER TABLE public.matches
    ADD CONSTRAINT matches_team2_p2_fkey
    FOREIGN KEY (team2_p2)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

ALTER TABLE public.matches
    ADD CONSTRAINT matches_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

COMMIT;
