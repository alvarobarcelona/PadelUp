-- FIX: Allow Admins to delete data and handle dependencies
-- Run this in your Supabase SQL Editor

-- 1. Relax RLS Policies for DELETE
-- Allow anyone to delete matches (secured by UI only for now, or you can add "using (true)")
create policy "Public matches delete" on matches for delete using (true);

-- Allow anyone to delete profiles (secured by UI only)
create policy "Public profiles delete" on profiles for delete using (true);


-- 2. Fix Foreign Keys to CASCADE (Delete matches when player is deleted)
-- Verify constraint names first if this fails, but these are standard names.

alter table matches drop constraint if exists matches_team1_p1_fkey;
alter table matches drop constraint if exists matches_team1_p2_fkey;
alter table matches drop constraint if exists matches_team2_p1_fkey;
alter table matches drop constraint if exists matches_team2_p2_fkey;

alter table matches 
  add constraint matches_team1_p1_fkey 
  foreign key (team1_p1) references profiles(id) on delete cascade;

alter table matches 
  add constraint matches_team1_p2_fkey 
  foreign key (team1_p2) references profiles(id) on delete cascade;

alter table matches 
  add constraint matches_team2_p1_fkey 
  foreign key (team2_p1) references profiles(id) on delete cascade;

alter table matches 
  add constraint matches_team2_p2_fkey 
  foreign key (team2_p2) references profiles(id) on delete cascade;
