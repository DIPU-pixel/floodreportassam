-- Assam Flood Watch — community help board
-- Run this in your Supabase project: SQL Editor → paste → Run.
-- Everything is reached through our Next.js server routes using the SERVICE
-- ROLE key, so Row Level Security stays fully closed (no anon/public access).

create extension if not exists "pgcrypto";

create table if not exists help_posts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- Posts auto-expire so the map shows the CURRENT emergency, not old ones.
  expires_at    timestamptz not null default now() + interval '48 hours',
  status        text not null default 'open' check (status in ('open','resolved','hidden')),

  help_type     text not null check (help_type in
                  ('rescue','boat','medical','food','water','shelter','other')),
  message       text not null check (char_length(message) between 1 and 600),
  poster_name   text check (poster_name is null or char_length(poster_name) <= 60),
  -- Revealed only by the server when a helper taps "I can help".
  poster_phone  text not null check (char_length(poster_phone) between 4 and 20),

  -- Precise location — server-side only, returned on reveal.
  lat           double precision not null,
  lng           double precision not null,
  -- Rounded (~1 km) location used for PUBLIC pins so a home isn't pinpointed.
  approx_lat    double precision not null,
  approx_lng    double precision not null,
  district      text,

  photo_paths   text[] not null default '{}',   -- objects in the private bucket
  reports       int  not null default 0,
  helper_views  int  not null default 0
);

create index if not exists help_posts_active_idx on help_posts (status, expires_at);

alter table help_posts enable row level security;
-- No policies on purpose: only the service_role key (used server-side) can touch
-- this table. The browser never reads it directly.

-- Private storage bucket for photos (server uploads; helpers get signed URLs).
insert into storage.buckets (id, name, public)
values ('help-photos', 'help-photos', false)
on conflict (id) do nothing;

-- Simple, free visitor counter (one row per visit). Read only by the admin
-- dashboard via the service key; RLS stays closed.
create table if not exists visits (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path       text,
  referrer   text
);
create index if not exists visits_created_idx on visits (created_at);
alter table visits enable row level security;

-- Aggregation helpers for the admin analytics dashboard (called via the
-- service key, which bypasses RLS).
create or replace function visits_daily(days int default 30)
returns table(day text, count bigint) language sql stable as $$
  select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::bigint
  from visits where created_at >= (now() - make_interval(days => days))
  group by 1 order by 1;
$$;

create or replace function visits_top_referrers(lim int default 8)
returns table(referrer text, count bigint) language sql stable as $$
  select coalesce(nullif(referrer, ''), '(direct)') as referrer, count(*)::bigint
  from visits group by 1 order by 2 desc limit lim;
$$;

create or replace function visits_top_paths(lim int default 8)
returns table(path text, count bigint) language sql stable as $$
  select coalesce(nullif(path, ''), '/') as path, count(*)::bigint
  from visits group by 1 order by 2 desc limit lim;
$$;
