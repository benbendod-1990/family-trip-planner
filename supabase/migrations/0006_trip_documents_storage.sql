-- Travel documents (e-tickets, vouchers, booking PDFs) pulled from Gmail
-- attachments or uploaded by hand.
--
-- The files live in Storage; their metadata rides along inside the trip JSON
-- (TripPlan.documents), so it syncs between the two phones through the same
-- path everything else already uses. That keeps this migration to one thing:
-- a private bucket whose objects only trip members can touch.
--
-- Object key layout is `<trip_id>/<document_id>-<filename>`, so the first path
-- segment is the trip id and RLS can authorise straight off it with the
-- existing is_trip_member() helper from 0003.

insert into storage.buckets (id, name, public)
values ('trip-documents', 'trip-documents', false)
on conflict (id) do nothing;

-- storage.foldername() splits the key on '/', so [1] is the trip id. It is
-- text, hence the cast — a malformed key raises rather than leaking, which is
-- the failure direction we want.
create policy "trip members read documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'trip-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );

create policy "trip members upload documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trip-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );

create policy "trip members update documents"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'trip-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );

create policy "trip members delete documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'trip-documents'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );
