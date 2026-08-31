-- Add 'other' to the event_category enum.
--
-- The seed JSON and front-end already use this value for logistics events
-- (shopping runs, misc blocks) that don't fit the original five categories.
-- Without it, save_trip() silently drops those events when pushing to
-- Supabase.
--
-- Idempotent — safe to re-run.
-- Paste into the Supabase SQL editor; no CLI / Management API needed.

do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'other'
      and enumtypid = 'public.event_category'::regtype
  ) then
    alter type public.event_category add value 'other';
  end if;
end $$;
