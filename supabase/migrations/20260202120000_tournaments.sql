-- Create Tournaments Table
create table public.tournaments (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete cascade not null,
  name text not null,
  mode text not null check (mode in ('americano', 'mexicano')),
  status text not null default 'setup' check (status in ('setup', 'playing', 'completed')),
  settings jsonb default '{}'::jsonb,
  current_round_number int default 0
);

-- Enable RLS for Tournaments
alter table public.tournaments enable row level security;

create policy "Users can enable RLS for tournaments"
  on public.tournaments for select
  using (true);

create policy "Users can insert their own tournaments"
  on public.tournaments for insert
  with check (auth.uid() = created_by);

create policy "Users can update their own tournaments"
  on public.tournaments for update
  using (auth.uid() = created_by);

create policy "Users can delete their own tournaments"
  on public.tournaments for delete
  using (auth.uid() = created_by);


-- Create Tournament Participants Table
create table public.tournament_participants (
  id bigint generated always as identity primary key,
  tournament_id bigint references public.tournaments(id) on delete cascade not null,
  player_id uuid references auth.users(id) on delete set null, -- Nullable for manual guests
  display_name text not null, -- Snapshot or manual name
  score int default 0,
  matches_played int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- Enable RLS for Participants
alter table public.tournament_participants enable row level security;

create policy "Public read access for tournament participants"
  on public.tournament_participants for select
  using (true);

create policy "Tournament creators can manage participants"
  on public.tournament_participants for all
  using (exists (
    select 1 from public.tournaments
    where id = tournament_participants.tournament_id
    and created_by = auth.uid()
  ));


-- Create Tournament Matches Table
create table public.tournament_matches (
  id bigint generated always as identity primary key,
  tournament_id bigint references public.tournaments(id) on delete cascade not null,
  round_number int not null,
  court_number int not null,
  
  -- Team 1
  team1_p1_text text not null,
  team1_p1_id uuid references auth.users(id) on delete set null,
  team1_p2_text text not null,
  team1_p2_id uuid references auth.users(id) on delete set null,

  -- Team 2
  team2_p1_text text not null,
  team2_p1_id uuid references auth.users(id) on delete set null,
  team2_p2_text text not null,
  team2_p2_id uuid references auth.users(id) on delete set null,

  score_team1 int default 0,
  score_team2 int default 0,
  completed boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS for Matches
alter table public.tournament_matches enable row level security;

create policy "Public read access for tournament matches"
  on public.tournament_matches for select
  using (true);

create policy "Tournament creators can manage matches"
  on public.tournament_matches for all
  using (exists (
    select 1 from public.tournaments
    where id = tournament_matches.tournament_id
    and created_by = auth.uid()
  ));
