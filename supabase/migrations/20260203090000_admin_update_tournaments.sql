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

-- Allow Admins to Update Tournament Matches
create policy "Admins can update tournament matches"
  on public.tournament_matches for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and is_admin = true
    )
  );

-- Allow Admins to Update Tournament Participants
create policy "Admins can update tournament participants"
  on public.tournament_participants for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and is_admin = true
    )
  );
