-- FIX: Add missing UPDATE policy for profiles table
-- Run this in your Supabase SQL Editor

-- 1. Allow users to update their own profile
create policy "Users can update own profile"
on profiles for update
using (auth.uid() = auth_id);

-- Optional: If you want to confirm it works, you can check policies:
-- select * from pg_policies where tablename = 'profiles';
