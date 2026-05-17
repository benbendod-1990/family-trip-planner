-- Gmail OAuth credentials per user.
--
-- Supabase's auth.session.provider_token only survives until the first
-- JWT refresh (~1h) and is never refreshed automatically. To keep Gmail
-- sync working long-term we store Google's refresh_token here ourselves,
-- and let the Worker mint a fresh access_token on demand via Google's
-- token endpoint.
--
-- RLS: each user can only see/update their own row. The Worker uses the
-- service_role key (bypasses RLS) when it needs to refresh tokens during
-- a scheduled cron run where there is no user session.
--
-- Idempotent — safe to re-run.

create table if not exists public.gmail_credentials (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  refresh_token  text not null,
  access_token   text,
  expires_at     timestamptz,
  scope          text,
  updated_at     timestamptz not null default now()
);

alter table public.gmail_credentials enable row level security;

drop policy if exists "own row select" on public.gmail_credentials;
create policy "own row select" on public.gmail_credentials
  for select using (user_id = auth.uid());

drop policy if exists "own row upsert" on public.gmail_credentials;
create policy "own row upsert" on public.gmail_credentials
  for insert with check (user_id = auth.uid());

drop policy if exists "own row update" on public.gmail_credentials;
create policy "own row update" on public.gmail_credentials
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own row delete" on public.gmail_credentials;
create policy "own row delete" on public.gmail_credentials
  for delete using (user_id = auth.uid());
