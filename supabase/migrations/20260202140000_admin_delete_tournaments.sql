-- Allow Admins to Delete Tournaments
create policy "Admins can delete any tournament"
  on public.tournaments for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and is_admin = true
    )
  );

-- Allow Admins to View All Tournaments (if not already allowed by "Users can view tournaments")
-- The existing select policy is "using (true)", so admins can already VIEW all.
-- We only need DELETE permissions.
