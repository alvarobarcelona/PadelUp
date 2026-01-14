-- Drop table to ensure clean state for new DM feature
drop table if exists public.messages;

-- Create messages table with receiver_id
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  sender_id uuid references public.profiles(id) not null default auth.uid(),
  receiver_id uuid references public.profiles(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.messages enable row level security;

-- Policies
create policy "Users can view their own messages"
  on public.messages for select
  using ( auth.uid() = sender_id or auth.uid() = receiver_id );

create policy "Authenticated users can insert messages"
  on public.messages for insert
  with check ( auth.uid() = sender_id );

-- Realtime
alter publication supabase_realtime add table public.messages;
