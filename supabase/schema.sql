-- VibeCheck schema for Supabase (PostgreSQL)
-- Run this in the Supabase SQL Editor or via `supabase db push` after linking a project.

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_city_idx on public.users (city);

-- ---------------------------------------------------------------------------
-- Events (parties / listings)
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  city text not null,
  description text,
  venue text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists events_city_idx on public.events (city);
create index if not exists events_starts_at_idx on public.events (starts_at);

-- ---------------------------------------------------------------------------
-- Check-ins (user at an event)
-- ---------------------------------------------------------------------------
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create index if not exists checkins_event_id_idx on public.checkins (event_id);
create index if not exists checkins_user_id_idx on public.checkins (user_id);

-- ---------------------------------------------------------------------------
-- Snaps (ephemeral photos tied to an event)
-- ---------------------------------------------------------------------------
create table if not exists public.snaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  photo_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists snaps_event_id_idx on public.snaps (event_id);
create index if not exists snaps_expires_at_idx on public.snaps (expires_at);

-- ---------------------------------------------------------------------------
-- User profiles (username + metadata)
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id text primary key,
  username text unique,
  email text unique,
  display_name text,
  avatar_url text,
  city text,
  created_at timestamptz default now()
);

-- For databases that pre-date the email column.
alter table public.user_profiles add column if not exists email text unique;

create index if not exists user_profiles_username_idx on public.user_profiles (username);
create index if not exists user_profiles_email_idx on public.user_profiles (email);

-- ---------------------------------------------------------------------------
-- Friend requests
-- ---------------------------------------------------------------------------
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id text not null,
  receiver_id text not null,
  status text not null default 'pending',
  created_at timestamptz default now(),
  constraint friend_requests_no_self check (sender_id <> receiver_id),
  unique (sender_id, receiver_id)
);

create index if not exists friend_requests_receiver_id_idx on public.friend_requests (receiver_id);
create index if not exists friend_requests_sender_id_idx on public.friend_requests (sender_id);
create index if not exists friend_requests_status_idx on public.friend_requests (status);

-- ---------------------------------------------------------------------------
-- Direct messages between users
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id text not null,
  receiver_id text not null,
  content text not null,
  snap_url text,
  created_at timestamptz default now()
);

-- For databases that pre-date snap_url on messages.
alter table public.messages add column if not exists snap_url text;

create index if not exists messages_sender_receiver_created_at_idx on public.messages (sender_id, receiver_id, created_at asc);
create index if not exists messages_receiver_sender_created_at_idx on public.messages (receiver_id, sender_id, created_at asc);

-- ---------------------------------------------------------------------------
-- Row Level Security (anon key used from this API)
-- Tighten these policies when you add Supabase Auth or move to service role.
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.events enable row level security;
alter table public.checkins enable row level security;
alter table public.snaps enable row level security;
alter table public.user_profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.messages enable row level security;

-- Allow the anon role to perform operations this backend needs.
-- For production, prefer SUPABASE_SERVICE_ROLE_KEY on the server and stricter RLS.

create policy "users_select_anon" on public.users for select to anon using (true);
create policy "users_update_anon" on public.users for update to anon using (true) with check (true);

create policy "events_select_anon" on public.events for select to anon using (true);

create policy "checkins_insert_anon" on public.checkins for insert to anon with check (true);
create policy "checkins_select_anon" on public.checkins for select to anon using (true);

create policy "snaps_select_anon" on public.snaps for select to anon using (true);
create policy "snaps_insert_anon" on public.snaps for insert to anon with check (true);

create policy "user_profiles_select_anon" on public.user_profiles for select to anon using (true);
create policy "user_profiles_upsert_anon" on public.user_profiles for insert to anon with check (true);
create policy "user_profiles_update_anon" on public.user_profiles for update to anon using (true) with check (true);

create policy "friend_requests_select_anon" on public.friend_requests for select to anon using (true);
create policy "friend_requests_insert_anon" on public.friend_requests for insert to anon with check (true);
create policy "friend_requests_update_anon" on public.friend_requests for update to anon using (true) with check (true);
create policy "friend_requests_delete_anon" on public.friend_requests for delete to anon using (true);

create policy "messages_select_anon" on public.messages for select to anon using (true);
create policy "messages_insert_anon" on public.messages for insert to anon with check (true);

-- ---------------------------------------------------------------------------
-- Grants (anon key used by this API)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon;

grant select, update on public.users to anon;
grant select on public.events to anon;
grant select, insert on public.checkins to anon;
grant select, insert on public.snaps to anon;
grant select, insert, update on public.user_profiles to anon;
grant select, insert, update, delete on public.friend_requests to anon;
grant select, insert on public.messages to anon;
