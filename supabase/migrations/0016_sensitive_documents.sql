-- Sensitive travel documents (passport scans) + shared trip photos.
--
-- Why a second bucket: trip-documents currently allows authenticated SELECT
-- for members, and createSignedUrl is a SELECT. A member (or stolen session)
-- can mint a URL with an arbitrary TTL from the browser console. Passports
-- must not ride that path.
--
-- trip-sensitive-documents is private, not public, and has INSERT + DELETE
-- for trip members but NO SELECT. Bytes are served only via a short-TTL
-- signed URL minted by the Worker after a session + membership check.
-- list_trip_documents() lets members see passport *slots* (filename, person)
-- while redacting the storage path of any uploaded file.
--
-- Idempotent — safe to re-run. Numbered 0016 because live 0015 is already
-- the admin registered-users feature. The agent cannot apply this; paste into
-- the Supabase SQL editor.

-- ── Regular bucket: stay private, members still read boarding passes ────────
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

drop policy if exists "trip members read sensitive documents"   on storage.objects;
drop policy if exists "trip members upload sensitive documents" on storage.objects;
drop policy if exists "trip members update sensitive documents" on storage.objects;
drop policy if exists "trip members delete sensitive documents" on storage.objects;

-- Deliberately no SELECT policy. createSignedUrl from the browser requires
-- SELECT, so members cannot mint passport URLs themselves.
create policy "trip members upload sensitive documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-sensitive-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );

create policy "trip members delete sensitive documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-sensitive-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
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

-- Members can list rows (including passport placeholders). The RPC below
-- redacts storage paths for uploaded passports so the key does not sit in
-- localStorage / the other phone's trip JSON.
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
  where d.trip_id = _trip_id;
$$;

revoke all on function public.list_trip_documents(uuid) from public, anon;
grant execute on function public.list_trip_documents(uuid) to authenticated;

-- Worker-only helper: given a document id, confirm the caller is a member and
-- return the real storage key. EXECUTE is revoked from anon + authenticated
-- so the path never goes out the Data API; the Worker uses the service role.
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
      where m.trip_id = d.trip_id and m.user_id = _user_id
    )
    and d.path is not null
    and d.path not like 'pending:%'
    and d.path not like 'external:%';
end;
$$;

revoke all on function public.sensitive_document_locator(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sensitive_document_locator(uuid, uuid) to service_role;
