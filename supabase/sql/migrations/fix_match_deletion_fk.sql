-- MIGRATION: Fix Match Deletion Behavior
-- Purpose: Prevent matches from being deleted when a player/user is deleted.
-- Change: Update Foreign Keys to ON DELETE SET NULL

BEGIN;

-- 1. Drop existing constraints (Foreign Keys)
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_team1_p1_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_team1_p2_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_team2_p1_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_team2_p2_fkey;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_created_by_fkey;

-- 2. Re-create constraints with ON DELETE SET NULL
-- This ensures if a profile is deleted, the match stays, but the player field becomes NULL.

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

-- Also fix created_by just in case (was NO ACTION)
ALTER TABLE public.matches
    ADD CONSTRAINT matches_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

COMMIT;
