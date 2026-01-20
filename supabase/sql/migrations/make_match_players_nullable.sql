-- Migration manually applied by user on 2026-01-20
-- Purpose: Allow player columns in matches table to be NULL.
-- This is necessary to support the 'ON DELETE SET NULL' behavior when a user is deleted,
-- preventing database integrity errors and allowing matches to persist with "Unknown" players.

ALTER TABLE public.matches ALTER COLUMN team1_p1 DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN team1_p2 DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN team2_p1 DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN team2_p2 DROP NOT NULL;
