-- Sensitive travel documents (passport scans) + shared trip photos.
--
-- Hardening (PR 38):
-- 1. No authenticated SELECT on either bucket — createSignedUrl from the
--    browser is a SELECT, so the client cannot mint URLs. The Worker mints
--    short-TTL URLs after JWT + (for passports) a server-verified WebAuthn
--    assertion.
-- 2. Passport metadata and the sensitive bucket are trip-owner only.
--    Ordinary members / share-link joiners do not list slots or files.
--    Photos and regular travel docs stay member-shared.
-- 3. WebAuthn credential / challenge / unlock tables, Worker-only (service
--    role). Client Face ID is UX; the Worker is the authorization boundary.
--
-- Idempotent — safe to re-run. Numbered 0016 because live 0015 is already
-- the admin registered-users feature. The agent cannot apply this; paste into
-- the Supabase SQL editor.

-- ── Regular bucket: private, members upload, nobody SELECTs from the client ─
insert into storage.buckets (id, name, public)
values ('trip-documents', 'trip-documents', false)
on conflict (id) do update set public = false;

-- ── Sensitive bucket: private, no listing, no client-minted signed URLs ─────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-sensitive-documents',
  'trip-sensitive-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Drop every storage policy this feature has ever used, including the
-- original 0006/0007 member SELECT on trip-documents (that is the
-- createSignedUrl leak).
drop policy if exists "trip members read documents"              on storage.objects;
drop policy if exists "trip members upload documents"            on storage.objects;
drop policy if exists "trip members update documents"            on storage.objects;
drop policy if exists "trip members delete documents"            on storage.objects;
drop policy if exists "trip members read sensitive documents"    on storage.objects;
drop policy if exists "trip members upload sensitive documents"  on storage.objects;
drop policy if exists "trip members update sensitive documents"  on storage.objects;
drop policy if exists "trip members delete sensitive documents"  on storage.objects;
drop policy if exists "trip owners upload sensitive documents"   on storage.objects;
drop policy if exists "trip owners update sensitive documents"   on storage.objects;
drop policy if exists "trip owners delete sensitive documents"   on storage.objects;

-- Deliberately no SELECT policy on either bucket. createSignedUrl from the
-- browser requires SELECT, so neither members nor owners can mint URLs
-- themselves. Uploads still need INSERT (and UPDATE for replace).

create policy "trip members upload documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );

create policy "trip members update documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trip-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'trip-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );

create policy "trip members delete documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );

create policy "trip owners upload sensitive documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-sensitive-documents'
    and public.is_trip_owner((storage.foldername(name))[1]::uuid)
  );

create policy "trip owners update sensitive documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trip-sensitive-documents'
    and public.is_trip_owner((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'trip-sensitive-documents'
    and public.is_trip_owner((storage.foldername(name))[1]::uuid)
  );

create policy "trip owners delete sensitive documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-sensitive-documents'
    and public.is_trip_owner((storage.foldername(name))[1]::uuid)
  );

-- ── Metadata: passport + photo kinds, bucket + person columns ───────────────
alter table public.trip_documents
  add column if not exists storage_bucket text not null default 'trip-documents';

alter table public.trip_documents
  add column if not exists person_id uuid;

alter table public.trip_documents
  drop constraint if exists trip_documents_kind_check;

alter table public.trip_documents
  add constraint trip_documents_kind_check
  check (kind in ('flight', 'hotel', 'car', 'activity', 'other', 'passport', 'photo'));

alter table public.trip_documents
  drop constraint if exists trip_documents_bucket_check;

alter table public.trip_documents
  add constraint trip_documents_bucket_check
  check (storage_bucket in ('trip-documents', 'trip-sensitive-documents'));

alter table public.trip_documents
  drop constraint if exists trip_documents_passport_bucket_check;

alter table public.trip_documents
  add constraint trip_documents_passport_bucket_check
  check (kind <> 'passport' or storage_bucket = 'trip-sensitive-documents');

-- Passports are owner-only rows. Members keep photos + boarding passes.
drop policy if exists "trip members select documents"   on public.trip_documents;
drop policy if exists "trip members insert documents"   on public.trip_documents;
drop policy if exists "trip members update documents"   on public.trip_documents;
drop policy if exists "trip members delete documents"   on public.trip_documents;
drop policy if exists "trip documents select"           on public.trip_documents;
drop policy if exists "trip documents insert"           on public.trip_documents;
drop policy if exists "trip documents update"           on public.trip_documents;
drop policy if exists "trip documents delete"           on public.trip_documents;

create policy "trip documents select" on public.trip_documents
  for select using (
    public.is_trip_member(trip_id)
    and (kind <> 'passport' or public.is_trip_owner(trip_id))
  );

create policy "trip documents insert" on public.trip_documents
  for insert with check (
    public.is_trip_member(trip_id)
    and (kind <> 'passport' or public.is_trip_owner(trip_id))
  );

create policy "trip documents update" on public.trip_documents
  for update
  using (
    public.is_trip_member(trip_id)
    and (kind <> 'passport' or public.is_trip_owner(trip_id))
  )
  with check (
    public.is_trip_member(trip_id)
    and (kind <> 'passport' or public.is_trip_owner(trip_id))
  );

create policy "trip documents delete" on public.trip_documents
  for delete using (
    public.is_trip_member(trip_id)
    and (kind <> 'passport' or public.is_trip_owner(trip_id))
  );

-- Invoker so RLS above applies. Owners see passport slots with the storage
-- path redacted; members do not see passport rows at all.
create or replace function public.list_trip_documents(_trip_id uuid)
returns table (
  id uuid,
  trip_id uuid,
  path text,
  filename text,
  mime_type text,
  size bigint,
  kind text,
  sha256 text,
  source_message_id text,
  source_subject text,
  source_from text,
  added_at timestamptz,
  created_at timestamptz,
  storage_bucket text,
  person_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id,
    d.trip_id,
    case
      when d.kind = 'passport'
        and d.path not like 'pending:%'
        and d.path not like 'external:%'
      then null
      else d.path
    end as path,
    d.filename,
    d.mime_type,
    d.size,
    d.kind,
    d.sha256,
    d.source_message_id,
    d.source_subject,
    d.source_from,
    d.added_at,
    d.created_at,
    d.storage_bucket,
    d.person_id
  from public.trip_documents d
  where d.trip_id = _trip_id
    and (
      d.kind <> 'passport'
      or public.is_trip_owner(_trip_id)
    );
$$;

revoke all on function public.list_trip_documents(uuid) from public, anon;
grant execute on function public.list_trip_documents(uuid) to authenticated;

-- Worker-only helper: members may locate regular files; only a trip owner
-- may locate a passport. EXECUTE is revoked from anon + authenticated so
-- the path never goes out the Data API; the Worker uses the service role.
create or replace function public.sensitive_document_locator(_document_id uuid, _user_id uuid)
returns table (
  document_id uuid,
  trip_id uuid,
  kind text,
  path text,
  storage_bucket text,
  filename text,
  mime_type text
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if _user_id is null then
    raise exception 'not_authenticated';
  end if;

  return query
  select
    d.id,
    d.trip_id,
    d.kind,
    d.path,
    d.storage_bucket,
    d.filename,
    d.mime_type
  from public.trip_documents d
  where d.id = _document_id
    and exists (
      select 1 from public.trip_members m
      where m.trip_id = d.trip_id
        and m.user_id = _user_id
        and (
          d.kind <> 'passport'
          or m.role = 'owner'
        )
    )
    and d.path is not null
    and d.path not like 'pending:%'
    and d.path not like 'external:%';
end;
$$;

revoke all on function public.sensitive_document_locator(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sensitive_document_locator(uuid, uuid) to service_role;

-- ── WebAuthn (Worker-only) ──────────────────────────────────────────────────
create table if not exists public.webauthn_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  credential_id text not null,
  public_key    jsonb not null,
  cose_alg      integer not null,
  sign_count    bigint not null default 0,
  transports    text[],
  created_at    timestamptz not null default now(),
  unique (credential_id)
);

create index if not exists webauthn_credentials_user_idx
  on public.webauthn_credentials (user_id);

create table if not exists public.webauthn_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  challenge   text not null,
  purpose     text not null check (purpose in ('register', 'assert')),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists webauthn_challenges_lookup_idx
  on public.webauthn_challenges (user_id, challenge)
  where consumed_at is null;

create table if not exists public.webauthn_unlocks (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.webauthn_credentials enable row level security;
alter table public.webauthn_challenges enable row level security;
alter table public.webauthn_unlocks enable row level security;

-- No authenticated policies: the browser never reads these. Worker uses
-- service_role, which bypasses RLS.
revoke all on table public.webauthn_credentials from public, anon, authenticated;
revoke all on table public.webauthn_challenges from public, anon, authenticated;
revoke all on table public.webauthn_unlocks from public, anon, authenticated;
grant all on table public.webauthn_credentials to service_role;
grant all on table public.webauthn_challenges to service_role;
grant all on table public.webauthn_unlocks to service_role;

create or replace function public.consume_webauthn_challenge(
  _user_id uuid,
  _challenge text,
  _purpose text
)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare n int;
begin
  update public.webauthn_challenges
     set consumed_at = now()
   where user_id = _user_id
     and challenge = _challenge
     and purpose = _purpose
     and consumed_at is null
     and expires_at > now();
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.has_webauthn_unlock(_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  return exists (
    select 1 from public.webauthn_unlocks u
    where u.user_id = _user_id and u.expires_at > now()
  );
end;
$$;

create or replace function public.touch_webauthn_unlock(_user_id uuid, _ttl_seconds int default 600)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.webauthn_unlocks (user_id, expires_at, updated_at)
  values (_user_id, now() + make_interval(secs => _ttl_seconds), now())
  on conflict (user_id) do update
    set expires_at = excluded.expires_at,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.consume_webauthn_challenge(uuid, text, text) from public, anon, authenticated;
revoke all on function public.has_webauthn_unlock(uuid) from public, anon, authenticated;
revoke all on function public.touch_webauthn_unlock(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_webauthn_challenge(uuid, text, text) to service_role;
grant execute on function public.has_webauthn_unlock(uuid) to service_role;
grant execute on function public.touch_webauthn_unlock(uuid, int) to service_role;
