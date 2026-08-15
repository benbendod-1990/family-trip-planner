-- Travel documents, part 2: give them a table of their own.
--
-- 0006 created the Storage bucket and said the metadata "rides inside the trip
-- JSON, so it syncs between the two phones through the same path everything
-- else already uses". That was wrong. The sync path is save_trip(), which
-- decomposes a trip into normalised child tables — and it has no `documents`
-- key, so every document dropped on the floor the moment a trip was pushed.
-- The uploading device kept them in localStorage and the other phone never saw
-- a thing.
--
-- So: a real table, read and written directly rather than through save_trip().
-- Keeping it out of that RPC is deliberate — save_trip() nukes-and-replaces its
-- children, which would mean a phone pushing a stale trip could wipe documents
-- the Mac had just filed. Documents only ever accumulate; nothing but an
-- explicit delete removes one.
--
-- Idempotent — safe to re-run, and safe to run whether or not 0006 ever was.

-- ── Bucket (from 0006, restated so this file stands alone) ──────────────────
insert into storage.buckets (id, name, public)
values ('trip-documents', 'trip-documents', false)
on conflict (id) do nothing;

drop policy if exists "trip members read documents"   on storage.objects;
drop policy if exists "trip members upload documents" on storage.objects;
drop policy if exists "trip members update documents" on storage.objects;
drop policy if exists "trip members delete documents" on storage.objects;

-- storage.foldername() splits the key on '/', so [1] is the trip id. It is
-- text, hence the cast — a malformed key raises rather than leaking, which is
-- the failure direction we want.
create policy "trip members read documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'trip-documents' and public.is_trip_member((storage.foldername(name))[1]::uuid));

create policy "trip members upload documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-documents' and public.is_trip_member((storage.foldername(name))[1]::uuid));

create policy "trip members update documents"
  on storage.objects for update to authenticated
  using (bucket_id = 'trip-documents' and public.is_trip_member((storage.foldername(name))[1]::uuid));

create policy "trip members delete documents"
  on storage.objects for delete to authenticated
  using (bucket_id = 'trip-documents' and public.is_trip_member((storage.foldername(name))[1]::uuid));

-- ── Metadata table ─────────────────────────────────────────────────────────
create table if not exists public.trip_documents (
  id                uuid primary key,
  trip_id           uuid not null references public.trips(id) on delete cascade,
  -- Object key in the bucket: `<trip_id>/<id>-<filename>`.
  path              text not null,
  filename          text not null,
  mime_type         text not null,
  size              bigint not null default 0,
  kind              text not null default 'other'
                      check (kind in ('flight', 'hotel', 'car', 'activity', 'other')),
  -- SHA-256 of the bytes. The dedup key: the same e-ticket reaches us from the
  -- airline and again from a forward, under two message ids and often two
  -- filenames, but the bytes are identical.
  sha256            text,
  source_message_id text,
  source_subject    text,
  source_from       text,
  added_at          timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists trip_documents_trip_idx on public.trip_documents(trip_id);

-- One copy of any given file per trip. Partial, because a hand-uploaded
-- document from before this migration may have no hash yet.
create unique index if not exists trip_documents_dedup_idx
  on public.trip_documents(trip_id, sha256) where sha256 is not null;

-- Cheap pre-check for the puller: skip an attachment we already filed without
-- downloading its bytes first.
create unique index if not exists trip_documents_source_idx
  on public.trip_documents(trip_id, source_message_id, filename)
  where source_message_id is not null;

alter table public.trip_documents enable row level security;

drop policy if exists "trip members select documents" on public.trip_documents;
create policy "trip members select documents" on public.trip_documents
  for select using (public.is_trip_member(trip_id));

drop policy if exists "trip members insert documents" on public.trip_documents;
create policy "trip members insert documents" on public.trip_documents
  for insert with check (public.is_trip_member(trip_id));

drop policy if exists "trip members update documents" on public.trip_documents;
create policy "trip members update documents" on public.trip_documents
  for update using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists "trip members delete documents" on public.trip_documents;
create policy "trip members delete documents" on public.trip_documents
  for delete using (public.is_trip_member(trip_id));
