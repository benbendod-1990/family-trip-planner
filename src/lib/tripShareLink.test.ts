import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SHARE_TOKEN_RE,
  isSafeJoinPath,
  isShareToken,
  joinPathForToken,
  oauthRedirectUrl,
  PROD_ORIGIN,
  shareLinkFailureStatus,
  tripShareJoinUrl,
} from './tripShareLink.ts'

const TOKEN = 'a'.repeat(64)

describe('share token format', () => {
  it('accepts 64 lowercase hex chars only', () => {
    assert.equal(isShareToken(TOKEN), true)
    assert.equal(SHARE_TOKEN_RE.test(TOKEN), true)
    assert.equal(isShareToken('A'.repeat(64)), false)
    assert.equal(isShareToken('ab'), false)
    assert.equal(isShareToken(`../${TOKEN}`), false)
    assert.equal(isShareToken(`${TOKEN}/x`), false)
    assert.equal(isShareToken(null), false)
  })
})

describe('join URL and OAuth redirect are same-origin', () => {
  it('builds /join/<token> on the given origin', () => {
    assert.equal(joinPathForToken(TOKEN), `/join/${TOKEN}`)
    assert.equal(
      tripShareJoinUrl(TOKEN, PROD_ORIGIN),
      `${PROD_ORIGIN}/join/${TOKEN}`,
    )
  })

  it('allows only a relative /join/<token> redirect path', () => {
    assert.equal(isSafeJoinPath(`/join/${TOKEN}`), true)
    assert.equal(isSafeJoinPath('https://evil.example/join/' + TOKEN), false)
    assert.equal(isSafeJoinPath('//evil.example'), false)
    assert.equal(isSafeJoinPath('/join/../login'), false)
    assert.equal(isSafeJoinPath('/login'), false)
    assert.equal(isSafeJoinPath(`/join/${TOKEN}?next=https://evil.example`), false)
    assert.equal(isSafeJoinPath(`/join/${TOKEN}#/`), false)
  })

  it('oauthRedirectUrl rejects open redirects and falls back to the app root', () => {
    assert.equal(
      oauthRedirectUrl(`/join/${TOKEN}`, PROD_ORIGIN),
      `${PROD_ORIGIN}/join/${TOKEN}`,
    )
    assert.equal(oauthRedirectUrl('https://evil.example', PROD_ORIGIN), `${PROD_ORIGIN}/`)
    assert.equal(oauthRedirectUrl('//evil.example', PROD_ORIGIN), `${PROD_ORIGIN}/`)
    assert.equal(oauthRedirectUrl('/login', PROD_ORIGIN), `${PROD_ORIGIN}/`)
    assert.equal(oauthRedirectUrl(undefined, PROD_ORIGIN), `${PROD_ORIGIN}/`)
  })
})

describe('share-link Hebrew errors', () => {
  it('maps expired / revoked / invalid without leaking other trips', () => {
    assert.match(shareLinkFailureStatus(new Error('share_link_expired')), /פג תוקף/)
    assert.match(shareLinkFailureStatus(new Error('share_link_revoked')), /בוטל/)
    assert.match(shareLinkFailureStatus(new Error('share_link_invalid')), /לא תקין/)
    assert.match(shareLinkFailureStatus(new Error('forbidden: only the trip owner')), /יוצר הטיול/)
    assert.equal(shareLinkFailureStatus(new Error('share_link_invalid')).includes('Holland'), false)
  })
})

describe('share-link call sites', () => {
  it('App exposes /join/:token and bounces leftover OAuth to it', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    assert.match(app, /path="\/join\/:token"/)
    assert.match(app, /PendingShareJoinBridge/)
    assert.match(app, /JoinTrip/)
  })

  it('AuthContext uses the safe OAuth redirect helper', () => {
    const auth = readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf8')
    assert.match(auth, /oauthRedirectUrl/)
    assert.match(auth, /claimTripShareLink/)
    assert.equal(auth.includes("redirectTo: window.location.origin + import.meta.env.BASE_URL"), false)
  })

  it('TripCard share button is lazy and does not static-import tripRepo', () => {
    const card = readFileSync(new URL('../components/trip/TripCard.tsx', import.meta.url), 'utf8')
    const btn = readFileSync(new URL('../components/trip/ShareTripButton.tsx', import.meta.url), 'utf8')
    assert.match(card, /ShareTripButton/)
    assert.match(card, /lazy\(\(\) => import\('@\/components\/trip\/ShareTripButton'\)\)/)
    assert.equal(card.includes("from '@/lib/tripRepo'"), false)
    assert.equal(btn.includes("from '@/lib/tripRepo'"), false)
    assert.match(btn, /import\('@\/lib\/tripRepo'\)/)
    assert.match(btn, /שתף/)
  })

  it('Invite sheet and join landing use Hebrew share copy', () => {
    const modal = readFileSync(new URL('../components/cloud/InviteMemberModal.tsx', import.meta.url), 'utf8')
    const panel = readFileSync(new URL('../components/cloud/ShareTripLinkPanel.tsx', import.meta.url), 'utf8')
    const join = readFileSync(new URL('../pages/JoinTrip.tsx', import.meta.url), 'utf8')
    assert.match(modal, /ShareTripLinkPanel/)
    assert.match(panel, /העתק לינק/)
    assert.match(panel, /שתף/)
    assert.match(panel, /בתוקף עד/)
    assert.match(panel, /חדש לינק/)
    assert.match(panel, /בטל לינק/)
    assert.match(join, /הוזמנת לטיול/)
    assert.match(join, /התחברות עם Google/)
    assert.match(join, /claimTripShareLink/)
    assert.match(join, /לא את כל הקטלוג/)
  })
})

describe('0012 trip_share_links SQL', () => {
  it('is copied to public/migrations and matches supabase/', () => {
    const a = readFileSync(new URL('../../supabase/migrations/0012_trip_share_links.sql', import.meta.url), 'utf8')
    const b = readFileSync(new URL('../../public/migrations/0012_trip_share_links.sql', import.meta.url), 'utf8')
    assert.equal(a, b)
  })

  it('scopes tokens to one trip, owners-only manage, claim never demotes family catalog', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0012_trip_share_links.sql', import.meta.url), 'utf8')
    assert.match(sql, /create table if not exists public\.trip_share_links/)
    assert.match(sql, /token ~ '\^\[0-9a-f\]\{64\}\$'/)
    assert.match(sql, /role = 'member'/)
    assert.match(sql, /interval '30 days'/)
    assert.match(sql, /enable row level security/)
    assert.match(sql, /is_trip_owner\(trip_id\)/)
    assert.match(sql, /create_or_get_trip_share_link/)
    assert.match(sql, /claim_trip_share_link/)
    assert.match(sql, /peek_trip_share_link/)
    assert.match(sql, /revoke_trip_share_link/)
    assert.match(sql, /regenerate_trip_share_link/)
    assert.match(sql, /grant execute on function public\.peek_trip_share_link\(text\) to anon, authenticated/)
    assert.match(sql, /revoke all on function public\.claim_trip_share_link\(text\) from public, anon/)
    assert.match(sql, /is_family_catalog_email/)
    assert.match(sql, /benbendod@gmail.com/)
    assert.match(sql, /shechter\.gal@gmail.com/)
    assert.match(sql, /when public\.trip_members\.role = 'owner' then 'owner'/)
    assert.match(sql, /gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text/)
    assert.equal(sql.includes('raise exception \'user_not_found'), false)
    assert.equal(/from public\.trips t\s+on conflict/.test(sql), false)
  })
})
