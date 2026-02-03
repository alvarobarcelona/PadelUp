-- Allow Admins to Update Any Tournament
create policy "Admins can update any tournament"
  on public.tournaments for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and is_admin = true
    )
  );
