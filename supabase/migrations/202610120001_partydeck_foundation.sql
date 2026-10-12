-- PartyDeck persistence foundation. All authoritative writes must go through
-- trusted server/Edge Function code; no guest client receives direct table access.
create extension if not exists pgcrypto;
create schema if not exists partydeck_private;
revoke all on schema partydeck_private from public, anon, authenticated;

create table if not exists public.game_nights (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{5,6}$'),
  name text not null check (char_length(name) between 1 and 60),
  host_player_id uuid not null,
  status text not null default 'lobby' check(status in ('lobby','playing','between_games','ended')),
  settings jsonb not null default '{}'::jsonb,
  settings_revision integer not null default 1,
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.game_nights(id) on delete cascade,
  display_name text not null check(char_length(display_name) between 1 and 24),
  balance bigint not null default 0 check(balance >= 0),
  approval_revision integer,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  unique(night_id, display_name)
);
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.game_nights(id) on delete cascade,
  player_id uuid not null references public.players(id),
  amount bigint not null,
  reason text not null,
  game text,
  event_id uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.game_nights(id) on delete cascade,
  game text not null,
  summary jsonb not null,
  completed_at timestamptz not null default now()
);
-- Store only a hash of each reconnect secret. Secret material is returned once
-- by trusted server code and never placed in Realtime/public lobby payloads.
create table if not exists partydeck_private.reconnect_credentials (
  player_id uuid primary key references public.players(id) on delete cascade,
  token_hash bytea not null,
  expires_at timestamptz not null,
  rotated_at timestamptz not null default now()
);
create table if not exists partydeck_private.poker_hands (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.game_nights(id) on delete cascade,
  hand_number integer not null,
  state jsonb not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique(night_id, hand_number)
);
create table if not exists partydeck_private.poker_private_cards (
  hand_id uuid not null references partydeck_private.poker_hands(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  cards jsonb not null,
  primary key(hand_id, player_id)
);

alter table public.game_nights enable row level security;
alter table public.players enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.game_results enable row level security;
alter table partydeck_private.reconnect_credentials enable row level security;
alter table partydeck_private.poker_hands enable row level security;
alter table partydeck_private.poker_private_cards enable row level security;
-- Fail closed until scoped read policies and server endpoints are deployed.
revoke all on public.game_nights, public.players, public.ledger_entries, public.game_results from anon, authenticated;
revoke all on all tables in schema partydeck_private from public, anon, authenticated;
