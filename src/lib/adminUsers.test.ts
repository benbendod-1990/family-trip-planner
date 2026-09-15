import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FAMILY_CATALOG_EMAILS } from './familyCatalog.ts'
import {
  adminRosterFailureStatus,
  canViewAdminUsers,
  parseAdminRoster,
} from './adminUsers.ts'

const SQL_PATH = new URL('../../supabase/migrations/0015_admin_list_registered_users.sql', import.meta.url)
const PUBLIC_SQL_PATH = new URL('../../public/migrations/0015_admin_list_registered_users.sql', import.meta.url)

describe('admin users allowlist gate', () => {
  it('is the family catalog — Ben and Gal only, not Libi', () => {
    assert.deepEqual([...FAMILY_CATALOG_EMAILS], ['benbendod@gmail.com', 'shechter.gal@gmail.com'])
    assert.equal(canViewAdminUsers('benbendod@gmail.com'), true)
    assert.equal(canViewAdminUsers('Shechter.gal@gmail.com'), true)
    assert.equal(canViewAdminUsers('Edenbendavid1992@gmail.com'), false)
    assert.equal(canViewAdminUsers('libi@example.com'), false)
    assert.equal(canViewAdminUsers(null), false)
  })
})

describe('parseAdminRoster', () => {
  it('reads users, trips, and pending invites from the RPC jsonb', () => {
    const roster = parseAdminRoster({
      users: [
        {
          user_id: 'u1',
          email: 'benbendod@gmail.com',
          registered_at: '2026-04-24T10:00:00.000Z',
          trips: [
            { trip_id: 't1', trip_name: 'הולנד', role: 'owner' },
            { trip_id: 't2', trip_name: 'ארה״ב', role: 'member' },
          ],
        },
      ],
      pending_invites: [
        {
          email: 'Edenbendavid1992@gmail.com'.toLowerCase(),
          trip_id: 't3',
          trip_name: 'רומא',
          role: 'member',
          invited_at: '2026-05-01T12:00:00.000Z',
        },
      ],
    })
    assert.equal(roster.users.length, 1)
    assert.equal(roster.users[0].email, 'benbendod@gmail.com')
    assert.equal(roster.users[0].trips[0].role, 'owner')
    assert.equal(roster.users[0].trips[1].trip_name, 'ארה״ב')
    assert.equal(roster.pendingInvites.length, 1)
    assert.equal(roster.pendingInvites[0].trip_name, 'רומא')
  })

  it('treats missing or junk payload as empty, never throws', () => {
    assert.deepEqual(parseAdminRoster(null), { users: [], pendingInvites: [] })
    assert.deepEqual(parseAdminRoster('not-json'), { users: [], pendingInvites: [] })
    assert.equal(parseAdminRoster({ users: [{ email: 'x' }] }).users.length, 0)
  })
})

describe('admin roster Hebrew errors', () => {
  it('maps forbidden to אין גישה so a leaked RPC still looks like a closed door', () => {
    assert.equal(adminRosterFailureStatus(new Error('forbidden: family catalog only')), 'אין גישה')
    assert.equal(
      adminRosterFailureStatus(new Error('admin_list_registered_users: forbidden: family catalog only')),
      'אין גישה',
    )
  })

  it('maps a missing 0015 RPC to a paste-in-Supabase hint', () => {
    assert.match(
      adminRosterFailureStatus(new Error('Could not find the function public.admin_list_registered_users')),
      /0015/,
    )
    assert.match(adminRosterFailureStatus(new Error('PGRST202 schema cache')), /0015/)
  })
})

describe('0015 admin_list_registered_users SQL', () => {
  const sql = readFileSync(SQL_PATH, 'utf8')

  it('is copied to public/migrations and matches supabase/', () => {
    const pub = readFileSync(PUBLIC_SQL_PATH, 'utf8')
    assert.equal(sql, pub)
  })

  it('is SECURITY DEFINER, gated to is_family_catalog_email, execute for authenticated only', () => {
    assert.match(sql, /create or replace function public\.admin_list_registered_users\(\)/)
    assert.match(sql, /security definer/)
    assert.match(sql, /set row_security = off/)
    assert.match(sql, /if not public\.is_family_catalog_email\(_email\) then/)
    assert.match(sql, /raise exception 'forbidden: family catalog only'/)
    assert.match(sql, /raise exception 'unauthenticated: sign in to view registered users'/)
    assert.match(sql, /from auth\.users/)
    assert.match(sql, /pending_invites/)
    assert.match(sql, /revoke all on function public\.admin_list_registered_users\(\) from public, anon/)
    assert.match(sql, /grant execute on function public\.admin_list_registered_users\(\) to authenticated/)
    assert.equal(sql.includes('grant execute on function public.admin_list_registered_users() to anon'), false)
    assert.equal(sql.includes('grant select on auth.users'), false)
    assert.equal(/create policy .*auth\.users/i.test(sql), false)
    assert.equal(sql.includes('service_role'), false)
    assert.equal(sql.includes('service role'), false)
  })
})

describe('admin users UI is family-catalog only', () => {
  it('Home shows the nav link only behind isFamilyCatalogEmail and never fetches the roster', () => {
    const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8')
    assert.match(home, /isFamilyCatalogEmail\(user\?\.email\)/)
    assert.match(home, /\/admin\/users/)
    assert.match(home, /משתמשים רשומים/)
    assert.equal(home.includes('fetchAdminRegisteredUsers'), false)
    assert.equal(home.includes("from '@/lib/adminUsers'"), false)
    assert.equal(home.includes("from './lib/adminUsers"), false)
    assert.match(home, /from '@\/lib\/familyCatalog'/)
  })

  it('non-admins do not get the link in trip chrome, Family, or CloudSync', () => {
    const layout = readFileSync(new URL('../components/layout/AppLayout.tsx', import.meta.url), 'utf8')
    const family = readFileSync(new URL('../pages/Family.tsx', import.meta.url), 'utf8')
    const cloud = readFileSync(new URL('../components/cloud/CloudSyncButton.tsx', import.meta.url), 'utf8')
    const invite = readFileSync(new URL('../components/cloud/InviteMemberModal.tsx', import.meta.url), 'utf8')
    assert.equal(layout.includes('/admin/users'), false)
    assert.equal(family.includes('/admin/users'), false)
    assert.equal(cloud.includes('/admin/users'), false)
    assert.equal(invite.includes('/admin/users'), false)
    assert.equal(cloud.includes('משתמשים רשומים'), false)
  })

  it('the page refuses non-admins with אין גישה and does not call the RPC until allowed', () => {
    const page = readFileSync(new URL('../pages/AdminUsers.tsx', import.meta.url), 'utf8')
    assert.match(page, /canViewAdminUsers\(user\?\.email\)/)
    assert.match(page, /אין גישה/)
    assert.match(page, /navigate\('\/'\)/)
    assert.match(page, /<Navigate to="\/login" replace/)
    const guardAt = page.indexOf('if (authLoading || !session || !allowed) return')
    const fetchAt = page.indexOf('fetchAdminRegisteredUsers()')
    assert.ok(guardAt > 0, 'expected the effect to bail out for non-admins')
    assert.ok(fetchAt > guardAt, 'RPC must not run before the allowlist guard')
  })

  it('the client talks to the RPC, never auth.users or a service role', () => {
    const lib = readFileSync(new URL('./adminUsers.ts', import.meta.url), 'utf8')
    const supabase = readFileSync(new URL('./supabase.ts', import.meta.url), 'utf8')
    assert.match(lib, /supabase\.rpc\('admin_list_registered_users'\)/)
    assert.match(lib, /await import\('\.\/supabase\.ts'\)/)
    assert.equal(lib.includes("from('auth.users')"), false)
    assert.equal(lib.includes('service_role'), false)
    assert.equal(lib.includes('SERVICE_ROLE'), false)
    assert.match(supabase, /VITE_SUPABASE_ANON_KEY/)
    assert.equal(supabase.includes('SERVICE_ROLE'), false)
  })

  it('App mounts /admin/users as a lazy route', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    assert.match(app, /path="\/admin\/users"/)
    assert.match(app, /lazy\(\(\) => import\('\.\/pages\/AdminUsers'\)\)/)
  })

  it('Quickstart lists 0015 so Ben can paste it', () => {
    const page = readFileSync(new URL('../pages/Quickstart.tsx', import.meta.url), 'utf8')
    assert.match(page, /0015_admin_list_registered_users\.sql/)
  })
})
