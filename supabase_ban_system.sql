-- Add banned_until column to profiles table to support temporary bans
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP WITH TIME ZONE;

-- Add comment to explain usage
COMMENT ON COLUMN profiles.banned_until IS 'If set, user is banned until this timestamp. If null, strict "banned" flag applies or user is active.';
