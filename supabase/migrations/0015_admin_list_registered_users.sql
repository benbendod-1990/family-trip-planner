-- Admin roster: who registered (auth.users) + which trips they belong to.
--
-- SECURITY DEFINER so the function can read auth.users without granting that
-- table to clients. Authorization is the family-catalog allowlist
-- (is_family_catalog_email) — same two emails as the full trip catalog
-- (benbendod@gmail.com, shechter.gal@gmail.com). Invitees (Libi, …) get
-- forbidden and never see other users' emails.
--
-- Do NOT add RLS on auth.users for the anon/authenticated roles. Do NOT call
-- this with the Supabase service key from the browser.
--
-- Depends on 0011 (trip_invites + is_family_catalog_email). Idempotent:
-- CREATE OR REPLACE + revoke/grant. Merging this file does NOT apply it to
-- production — paste into the Supabase SQL editor.

create or replace function public.is_family_catalog_email(_email text)
returns boolean
language sql
immutable
parallel safe
as $$
  select lower(trim(coalesce(_email, ''))) in (
    'benbendod@gmail.com',
    'shechter.gal@gmail.com'
  );
$$;

create or replace function public.admin_list_registered_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _payload jsonb;
begin
  if _uid is null then
    raise exception 'unauthenticated: sign in to view registered users';
  end if;

  select au.email::text
    into _email
  from auth.users au
  where au.id = _uid;

  if not public.is_family_catalog_email(_email) then
    raise exception 'forbidden: family catalog only';
  end if;

  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(user_row order by (user_row->>'registered_at')::timestamptz desc)
      from (
        select jsonb_build_object(
          'user_id', registered.id,
          'email', registered.email::text,
          'registered_at', registered.created_at,
          'trips', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'trip_id', t.id,
                'trip_name', t.name,
                'role', tm.role
              )
              order by t.start_date, t.name
            )
            from public.trip_members tm
            join public.trips t on t.id = tm.trip_id
            where tm.user_id = registered.id
          ), '[]'::jsonb)
        ) as user_row
        from auth.users registered
        where registered.email is not null
      ) roster
    ), '[]'::jsonb),
    'pending_invites', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'email', ti.email,
          'trip_id', t.id,
          'trip_name', t.name,
          'role', ti.role,
          'invited_at', ti.created_at
        )
        order by ti.created_at desc
      )
      from public.trip_invites ti
      join public.trips t on t.id = ti.trip_id
      where ti.claimed_at is null
    ), '[]'::jsonb)
  )
  into _payload;

  return coalesce(
    _payload,
    jsonb_build_object('users', '[]'::jsonb, 'pending_invites', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_registered_users() from public, anon;
grant execute on function public.admin_list_registered_users() to authenticated;
