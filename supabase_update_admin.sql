
-- Add Admin column to profiles
alter table profiles 
add column if not exists is_admin boolean default false;

-- Policy: Admins can update any profile (already covered by public policy, but good to know)
-- Policy: Admins can delete matches (already covered by public policy for now)

-- OPTIONAL: Set a specific user as admin by username (REPLACE 'YourUsername' with actual username)
-- update profiles set is_admin = true where username = 'YourUsername';
