-- Migration: Add commentary column to matches table
ALTER TABLE public.matches
ADD COLUMN commentary TEXT;
