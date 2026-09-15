import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SHARE_TOKEN_RE,
  assertSharePeekMatchesTrip,
  cachedShareLinkForTrip,
  copyAndShareTripLink,
  isSafeJoinPath,
  isShareToken,
  joinPathForToken,
  oauthRedirectUrl,
  PROD_ORIGIN,
  shareInviteText,
  shareLinkFailureStatus,
  shareOutcomeToast,
  sharePreparingToast,
  shareTargetForCard,
  shareTargetFromButton,
  shareTargetsForCards,
  tripShareJoinUrl,
  whatsappShareHref,
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

  it('maps missing RPC / network / not-owner / ambiguous SQL to Hebrew the card can toast', () => {
    assert.match(
      shareLinkFailureStatus(new Error('Could not find the function public.create_or_get_trip_share_link')),
      /0012/,
    )
    assert.match(
      shareLinkFailureStatus(new Error('PGRST202 schema cache')),
      /0012/,
    )
    assert.match(
      shareLinkFailureStatus(new Error('Failed to fetch')),
      /אין חיבור/,
    )
    assert.match(
      shareLinkFailureStatus(new Error('create_or_get_trip_share_link: forbidden')),
      /יוצר הטיול/,
    )
    const ambiguous = shareLinkFailureStatus(
      new Error(
        'create_or_get_trip_share_link: column reference "expires_at" is ambiguous | It could refer to either a PL/pgSQL variable or a table column. | 42702',
      ),
    )
    assert.match(ambiguous, /שגיאת שיתוף בשרת/)
    assert.equal(ambiguous.includes('0013'), false)
    assert.equal(ambiguous.includes('expires_at'), false)
    assert.equal(ambiguous.includes('42702'), false)
    const claimAmbiguous = shareLinkFailureStatus(
      new Error(
        'claim_trip_share_link: column reference "trip_id" is ambiguous | It could refer to either a PL/pgSQL variable or a table column. | 42702',
      ),
    )
    assert.match(claimAmbiguous, /שגיאת שיתוף בשרת/)
    assert.equal(claimAmbiguous.includes('0013'), false)
    assert.equal(claimAmbiguous.includes('trip_id'), false)
    assert.match(
      shareLinkFailureStatus(new Error('share_trip_mismatch')),
      /טיול אחר/,
    )
  })
})

describe('WhatsApp join href', () => {
  it('encodes the trip name and /join URL', () => {
    const url = `${PROD_ORIGIN}/join/${TOKEN}`
    const href = whatsappShareHref({ url, tripName: 'ארה״ב — מרץ 2027' })
    assert.equal(href.startsWith('https://wa.me/?text='), true)
    const text = decodeURIComponent(href.slice('https://wa.me/?text='.length))
    assert.match(text, /ארה״ב/)
    assert.match(text, /«ארה״ב — מרץ 2027»/)
    assert.equal(text.includes(url), true)
    assert.equal(text.includes('הולנד'), false)
    assert.equal(shareInviteText('ארה״ב — מרץ 2027').includes('הולנד'), false)
  })
})

describe('copyAndShareTripLink', () => {
  it('returns shared when navigator.share resolves', async () => {
    const nav = globalThis.navigator as Navigator | undefined
    const clipboard = { writeText: async () => {} }
    const share = async () => {}
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { ...(nav ?? {}), clipboard, share },
    })
    try {
      const result = await copyAndShareTripLink({ url: `${PROD_ORIGIN}/join/${TOKEN}`, tripName: 'USA' })
      assert.equal(result, 'shared')
    } finally {
      if (nav) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav })
    }
  })

  it('returns copied when share is missing but clipboard works', async () => {
    const nav = globalThis.navigator as Navigator | undefined
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { ...(nav ?? {}), clipboard: { writeText: async () => {} }, share: undefined },
    })
    try {
      const result = await copyAndShareTripLink({ url: `${PROD_ORIGIN}/join/${TOKEN}`, tripName: 'USA' })
      assert.equal(result, 'copied')
    } finally {
      if (nav) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav })
    }
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

  it('TripCard share button is eager, Home-safe, and does not static-import tripRepo', () => {
    const card = readFileSync(new URL('../components/trip/TripCard.tsx', import.meta.url), 'utf8')
    const btn = readFileSync(new URL('../components/trip/ShareTripButton.tsx', import.meta.url), 'utf8')
    assert.match(card, /ShareTripButton/)
    assert.match(card, /from '@\/components\/trip\/ShareTripButton'/)
    assert.equal(card.includes("lazy(() => import('@/components/trip/ShareTripButton'))"), false)
    assert.equal(card.includes("from '@/lib/tripRepo'"), false)
    assert.equal(btn.includes("from '@/lib/tripRepo'"), false)
    assert.match(btn, /import\('@\/lib\/tripRepo'\)/)
    assert.match(btn, /createOrGetTripShareLink/)
    assert.match(btn, /shareTargetFromButton/)
    assert.match(btn, /data-trip-id=\{tripId\}/)
    assert.match(btn, /data-trip-name=\{tripName\}/)
    assert.match(btn, /sharePreparingToast/)
    assert.match(btn, /shareOutcomeToast/)
    assert.match(btn, /copyAndShareTripLink/)
    assert.match(btn, /shareLinkFailureStatus/)
    assert.match(btn, /שתף/)
    assert.match(btn, /type="button"/)
    assert.match(btn, /stopPropagation/)
    assert.match(btn, /createPortal/)
    assert.match(btn, /וואטסאפ/)
    assert.match(btn, /whatsappShareHref/)
  })

  it('TripCard action row has no people/collaborators icon; members live in trip chrome', () => {
    const card = readFileSync(new URL('../components/trip/TripCard.tsx', import.meta.url), 'utf8')
    const layout = readFileSync(new URL('../components/layout/AppLayout.tsx', import.meta.url), 'utf8')
    assert.equal(card.includes('InviteMemberModal'), false)
    assert.equal(card.includes('Users'), false)
    assert.equal(card.includes('#3b82f6'), false)
    assert.equal(card.includes('חברי הטיול'), false)
    assert.match(card, /ShareTripButton/)
    assert.match(layout, /InviteMemberModal/)
    assert.match(layout, /חברי הטיול/)
  })

  it('Invite sheet is members-only; join landing still claims the token', () => {
    const modal = readFileSync(new URL('../components/cloud/InviteMemberModal.tsx', import.meta.url), 'utf8')
    const panel = readFileSync(new URL('../components/cloud/ShareTripLinkPanel.tsx', import.meta.url), 'utf8')
    const join = readFileSync(new URL('../pages/JoinTrip.tsx', import.meta.url), 'utf8')
    assert.match(modal, /ShareTripLinkPanel/)
    assert.match(modal, /חברי הטיול/)
    assert.equal(modal.includes('type="email"'), false)
    assert.equal(modal.includes('inviteUserToTrip'), false)
    assert.equal(modal.includes('הזמן'), false)
    assert.equal(modal.includes('הזמנות ממתינות'), false)
    assert.equal(modal.includes('הזמינו לפי אימייל'), false)
    assert.match(panel, /העתק לינק/)
    assert.match(panel, /שתף/)
    assert.match(panel, /וואטסאפ/)
    assert.match(panel, /בתוקף עד/)
    assert.match(panel, /חדש לינק/)
    assert.match(panel, /בטל לינק/)
    assert.match(join, /הוזמנת לטיול/)
    assert.match(join, /התחברות עם Google/)
    assert.match(join, /claimTripShareLink/)
    assert.match(join, /לא את כל הקטלוג/)
  })
})

const HOLLAND_ID = '34980c90-bd66-4270-8d45-3e96787b07ef'
const USA_ID = 'b38fc010-9096-45c9-b8df-191e369143dc'
const HOLLAND = { id: HOLLAND_ID, name: 'הולנד — אוגוסט 2026' }
const USA = { id: USA_ID, name: 'ארה״ב — מרץ 2027' }

describe('two cards share the tapped tripId, never a sibling', () => {
  it('maps each card to its own trip.id — USA share is not Holland', () => {
    const targets = shareTargetsForCards([HOLLAND, USA])
    assert.equal(targets.length, 2)
    assert.equal(targets[0].tripId, HOLLAND_ID)
    assert.equal(targets[1].tripId, USA_ID)
    assert.notEqual(targets[0].tripId, targets[1].tripId)
    assert.equal(shareTargetForCard(USA).tripId, USA_ID)
    assert.equal(shareTargetForCard(USA).tripName, USA.name)
    assert.equal(shareTargetForCard(USA).tripId === HOLLAND_ID, false)
  })

  it('reads data-trip-id from the tapped button, not a fallback sibling', () => {
    const usaBtn = {
      getAttribute: (name: string) => (name === 'data-trip-id' ? USA_ID : name === 'data-trip-name' ? USA.name : null),
    }
    const fromUsa = shareTargetFromButton(usaBtn, { tripId: HOLLAND_ID, tripName: HOLLAND.name })
    assert.equal(fromUsa.tripId, USA_ID)
    assert.equal(fromUsa.tripName, USA.name)
    assert.equal(fromUsa.tripId === HOLLAND_ID, false)
  })

  it('Home keys cards by trip.id and TripCard passes that trip.id into ShareTripButton', () => {
    const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8')
    const card = readFileSync(new URL('../components/trip/TripCard.tsx', import.meta.url), 'utf8')
    assert.match(home, /<TripCard key=\{trip\.id\} trip=\{trip\}/)
    assert.match(card, /<ShareTripButton key=\{trip\.id\} tripId=\{trip\.id\} tripName=\{trip\.name\} \/>/)
    assert.equal(card.includes('trips[0]'), false)
    assert.equal(card.includes('trips[i]'), false)
    assert.equal(card.includes('trips[index]'), false)
  })

  it('createOrGet peeks the token and refuses a sibling trip', () => {
    const repo = readFileSync(new URL('./tripRepo.ts', import.meta.url), 'utf8')
    assert.match(repo, /assertSharePeekMatchesTrip/)
    assert.match(repo, /confirmShareLinkTrip/)
    const createAt = repo.indexOf('export async function createOrGetTripShareLink')
    const regenAt = repo.indexOf('export async function regenerateTripShareLink')
    const createFn = repo.slice(createAt, regenAt)
    assert.match(createFn, /confirmShareLinkTrip\(tripId, row\)/)
    assert.match(createFn, /create_or_get_trip_share_link/)
    assert.equal(assertSharePeekMatchesTrip(USA_ID, { trip_id: USA_ID, trip_name: USA.name }).trip_id, USA_ID)
    assert.throws(
      () => assertSharePeekMatchesTrip(USA_ID, { trip_id: HOLLAND_ID, trip_name: HOLLAND.name }),
      /share_trip_mismatch/,
    )
    assert.throws(() => assertSharePeekMatchesTrip(USA_ID, null), /share_trip_mismatch/)
  })

  it('does not reuse a cached Holland token when the panel is on USA', () => {
    const hollandLink = { token: 'b'.repeat(64), expires_at: 'x', created_at: 'y' }
    assert.equal(cachedShareLinkForTrip({ tripId: HOLLAND_ID, link: hollandLink }, USA_ID), null)
    assert.equal(cachedShareLinkForTrip({ tripId: USA_ID, link: hollandLink }, USA_ID), hollandLink)
    const panel = readFileSync(new URL('../components/cloud/ShareTripLinkPanel.tsx', import.meta.url), 'utf8')
    assert.match(panel, /cachedShareLinkForTrip/)
    assert.match(panel, /setCached\(null\)/)
  })

  it('toast and WhatsApp name the tapped trip so Ben can see USA vs Holland', () => {
    const copied = shareOutcomeToast(USA.name, 'copied')
    const preparing = sharePreparingToast(USA.name)
    assert.match(copied, /ארה״ב/)
    assert.match(preparing, /ארה״ב/)
    assert.equal(copied.includes('הולנד'), false)
    assert.equal(preparing.includes('הולנד'), false)
    assert.match(shareOutcomeToast(USA.name, 'shared'), /ארה״ב/)
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

const SHARE_RPC_NAMES = [
  'get_trip_share_link',
  'create_or_get_trip_share_link',
  'revoke_trip_share_link',
  'regenerate_trip_share_link',
  'peek_trip_share_link',
  'claim_trip_share_link',
] as const

/** Columns that clash with RETURNS TABLE out-params (live 42702 was expires_at). */
const CLASH_COLS = ['expires_at', 'created_at', 'token', 'revoked_at'] as const

function plpgsqlFunctions(sql: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  const re =
    /create or replace function public\.(\w+)\s*\([^)]*\)[\s\S]*?as \$\$([\s\S]*?)\$\$/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) {
    out.push({ name: m[1], body: m[2] })
  }
  return out
}

function functionBody(sql: string, name: string): string {
  const found = plpgsqlFunctions(sql).find(fn => fn.name === name)
  assert.ok(found, `missing function ${name}`)
  return found!.body
}

/**
 * Bare `expires_at` in UPDATE/WHERE is 42702 when RETURNS TABLE lists it.
 * INSERT column lists and UPDATE SET targets are table columns, not expressions.
 */
function bareClashColumnHits(body: string): string[] {
  let text = body.replace(/--[^\n]*/g, '')
  text = text.replace(/\/\*[\s\S]*?\*\//g, '')
  text = text.replace(/insert into [\s\S]*?\([^)]*\)/gi, 'INSERT')
  text = text.replace(/\bset\s+\w+\s*=/gi, 'SET ')
  return CLASH_COLS.filter(col => new RegExp(`(?<![.\\w])${col}(?!\\w)`).test(text))
}

describe('0013 share-link RETURNS TABLE vs column names', () => {
  it('is copied to public/migrations and matches supabase/', () => {
    const a = readFileSync(new URL('../../supabase/migrations/0013_fix_share_link_expires_at.sql', import.meta.url), 'utf8')
    const b = readFileSync(new URL('../../public/migrations/0013_fix_share_link_expires_at.sql', import.meta.url), 'utf8')
    assert.equal(a, b)
  })

  it('create_or_get qualifies sl.expires_at in the UPDATE that 42702 hit live', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0012_trip_share_links.sql', import.meta.url), 'utf8')
    const body = functionBody(sql, 'create_or_get_trip_share_link')
    assert.match(
      body,
      /update public\.trip_share_links\s+sl\s+set revoked_at = now\(\)\s+where sl\.trip_id = _trip_id\s+and sl\.revoked_at is null\s+and sl\.expires_at <= now\(\)/,
    )
    assert.equal(/\band expires_at\b/.test(body), false)
  })

  it('0013 recreates the same create_or_get body as the fixed 0012', () => {
    const a = readFileSync(new URL('../../supabase/migrations/0012_trip_share_links.sql', import.meta.url), 'utf8')
    const b = readFileSync(new URL('../../supabase/migrations/0013_fix_share_link_expires_at.sql', import.meta.url), 'utf8')
    assert.equal(
      functionBody(a, 'create_or_get_trip_share_link'),
      functionBody(b, 'create_or_get_trip_share_link'),
    )
  })

  it('no trip_share_* RPC leaves expires_at/created_at/token/revoked_at unqualified', () => {
    const files = [
      readFileSync(new URL('../../supabase/migrations/0012_trip_share_links.sql', import.meta.url), 'utf8'),
      readFileSync(new URL('../../supabase/migrations/0013_fix_share_link_expires_at.sql', import.meta.url), 'utf8'),
    ]
    for (const sql of files) {
      const fns = plpgsqlFunctions(sql).filter(fn =>
        (SHARE_RPC_NAMES as readonly string[]).includes(fn.name),
      )
      assert.ok(fns.length >= 5, `expected share RPCs, got ${fns.map(f => f.name).join(',')}`)
      for (const fn of fns) {
        const hits = bareClashColumnHits(fn.body)
        assert.deepEqual(hits, [], `${fn.name} has unqualified ${hits.join(', ')}`)
      }
    }
  })

  it('Quickstart lists 0013 next to 0012', () => {
    const page = readFileSync(new URL('../pages/Quickstart.tsx', import.meta.url), 'utf8')
    assert.match(page, /0013_fix_share_link_expires_at\.sql/)
    assert.match(page, /0012_trip_share_links\.sql/)
  })
})

describe('0014 claim_trip_share_link RETURNS TABLE vs ON CONFLICT columns', () => {
  it('is copied to public/migrations and matches supabase/', () => {
    const a = readFileSync(new URL('../../supabase/migrations/0014_fix_claim_share_link_trip_id_ambiguous.sql', import.meta.url), 'utf8')
    const b = readFileSync(new URL('../../public/migrations/0014_fix_claim_share_link_trip_id_ambiguous.sql', import.meta.url), 'utf8')
    assert.equal(a, b)
  })

  it('uses ON CONFLICT ON CONSTRAINT trip_members_pkey, not (trip_id, user_id)', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0014_fix_claim_share_link_trip_id_ambiguous.sql', import.meta.url), 'utf8')
    const body = functionBody(sql, 'claim_trip_share_link')
    assert.match(body, /on conflict on constraint trip_members_pkey do update/)
    assert.equal(/on conflict \(trip_id,\s*user_id\)/.test(body), false)
    assert.deepEqual(bareClashColumnHits(body), [])
    assert.match(sql, /revoke all on function public\.claim_trip_share_link\(text\) from public, anon/)
    assert.match(sql, /grant execute on function public\.claim_trip_share_link\(text\) to authenticated/)
  })

  it('0014 recreates the 0013 claim body except the conflict target', () => {
    const a = readFileSync(new URL('../../supabase/migrations/0013_fix_share_link_expires_at.sql', import.meta.url), 'utf8')
    const b = readFileSync(new URL('../../supabase/migrations/0014_fix_claim_share_link_trip_id_ambiguous.sql', import.meta.url), 'utf8')
    const oldBody = functionBody(a, 'claim_trip_share_link').replace(
      /on conflict \(trip_id, user_id\) do update/,
      'on conflict on constraint trip_members_pkey do update',
    )
    assert.equal(oldBody, functionBody(b, 'claim_trip_share_link'))
  })

  it('Quickstart lists 0014 next to 0013', () => {
    const page = readFileSync(new URL('../pages/Quickstart.tsx', import.meta.url), 'utf8')
    assert.match(page, /0014_fix_claim_share_link_trip_id_ambiguous\.sql/)
    assert.match(page, /0013_fix_share_link_expires_at\.sql/)
  })
})
