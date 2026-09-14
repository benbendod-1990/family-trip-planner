import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inviteFailureStatus, parseInviteOutcome, rpcErrorText } from './inviteError.ts'

const ORIGIN = 'https://family-trip-planner-end.pages.dev'
const EMAIL = 'Edenbendavid1992@gmail.com'

describe('invite error copy', () => {
  it('maps invalid_email to Hebrew, never «must register first»', () => {
    const status = inviteFailureStatus(
      { message: 'invalid_email: not-an-email', code: 'P0001' },
      EMAIL,
      ORIGIN,
    )
    assert.equal(status, 'אימייל לא תקין')
    assert.equal(status.includes('עדיין לא נרשם'), false)
    assert.equal(status.includes('/login'), false)
  })

  it('maps already_member to Hebrew with the address', () => {
    const status = inviteFailureStatus(
      { message: 'already_member: edenbendavid1992@gmail.com is already a member of this trip', code: 'P0001' },
      EMAIL,
      ORIGIN,
    )
    assert.equal(status, `${EMAIL} כבר חבר בטיול`)
  })

  it('maps a forbidden PostgREST object to the owner-only copy', () => {
    const status = inviteFailureStatus(
      { message: 'forbidden: only the trip owner may invite members', code: 'P0001' },
      EMAIL,
      ORIGIN,
    )
    assert.equal(status, 'רק יוצר הטיול יכול להזמין')
  })

  it('maps leftover user_not_found to a server-migration hint, not a first-login demand', () => {
    const err = {
      message: 'user_not_found: Edenbendavid1992@gmail.com must sign in to the app at least once before being invited',
      details: null,
      hint: null,
      code: 'P0001',
    }
    const status = inviteFailureStatus(err, EMAIL, ORIGIN)
    assert.match(status, /0011/)
    assert.equal(status.includes('עדיין לא נרשם'), false)
    assert.equal(status.includes('/login'), false)
    assert.equal(status.includes('שגיאה: שגיאה'), false)
  })

  it('maps the same leftover payload after describe() wraps it in an Error', () => {
    const wrapped = new Error(
      'invite_user_to_trip: user_not_found: Edenbendavid1992@gmail.com must sign in | P0001',
    )
    const status = inviteFailureStatus(wrapped, EMAIL, ORIGIN)
    assert.match(status, /0011/)
    assert.equal(status.includes('עדיין לא נרשם'), false)
  })

  it('never renders the tautology שגיאה: שגיאה', () => {
    assert.equal(inviteFailureStatus('שגיאה', EMAIL, ORIGIN), 'שגיאה לא ידועה')
    assert.equal(inviteFailureStatus({}, EMAIL, ORIGIN), 'שגיאה לא ידועה')
    assert.equal(inviteFailureStatus(null, EMAIL, ORIGIN), 'שגיאה לא ידועה')
  })

  it('reads message from a plain object when it is not an Error', () => {
    assert.match(
      rpcErrorText({ message: 'already_member: x', code: 'P0001' }),
      /already_member/,
    )
  })
})

describe('invite RPC outcome', () => {
  it('treats invite_status=pending as pending', () => {
    assert.equal(parseInviteOutcome([{ added_user_id: null, member_role: 'member', invite_status: 'pending' }]), 'pending')
  })

  it('treats added and missing status as added', () => {
    assert.equal(parseInviteOutcome([{ added_user_id: 'u1', member_role: 'member', invite_status: 'added' }]), 'added')
    assert.equal(parseInviteOutcome([{ added_user_id: 'u1', member_role: 'member' }]), 'added')
    assert.equal(parseInviteOutcome(null), 'added')
  })
})

describe('membership RPCs wrap PostgREST errors', () => {
  it('throws via describe() so the modal receives a real Error', () => {
    const text = readFileSync(new URL('./tripRepo.ts', import.meta.url), 'utf8')
    const block = text.slice(
      text.indexOf('export async function inviteUserToTrip'),
      text.indexOf('export async function pushLocalToRemote'),
    )
    assert.match(block, /inviteUserToTrip[\s\S]*throw describe\(error/)
    assert.match(block, /listTripMembers[\s\S]*throw describe\(error/)
    assert.match(block, /removeUserFromTrip[\s\S]*throw describe\(error/)
    assert.match(block, /claimPendingInvites[\s\S]*throw describe\(error/)
    assert.match(block, /listPendingTripInvites[\s\S]*throw describe\(error/)
    assert.match(block, /cancelTripInvite[\s\S]*throw describe\(error/)
    assert.equal(/if \(error\) throw error/.test(block), false)
  })

  it('InviteMemberModal uses inviteFailureStatus instead of instanceof-only parsing', () => {
    const text = readFileSync(new URL('../components/cloud/InviteMemberModal.tsx', import.meta.url), 'utf8')
    assert.match(text, /inviteFailureStatus\(/)
    assert.equal(text.includes("e instanceof Error ? e.message : 'שגיאה'"), false)
  })

  it('InviteMemberModal no longer demands a first login before invite', () => {
    const text = readFileSync(new URL('../components/cloud/InviteMemberModal.tsx', import.meta.url), 'utf8')
    assert.equal(text.includes('חייבים להיכנס פעם אחת'), false)
    assert.equal(text.includes('עדיין לא נרשם'), false)
    assert.match(text, /אם האדם עוד לא נרשם/)
    assert.match(text, /הזמנות ממתינות/)
    assert.match(text, /outcome === 'pending'/)
    assert.match(text, /isFamilyCatalogEmail/)
    assert.match(text, /יוצר\/ת ממתין\/ה/)
  })

  it('wireUp claims pending invites before the cloud trip list', () => {
    const text = readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf8')
    const claimAt = text.indexOf('claimPendingInvites()')
    const listAt = text.indexOf('listTrips()')
    assert.ok(claimAt > 0)
    assert.ok(listAt > claimAt)
  })

  it('0011 SQL stores pending invites and never raises user_not_found', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0011_pending_trip_invites.sql', import.meta.url), 'utf8')
    assert.match(sql, /create table if not exists public\.trip_invites/)
    assert.match(sql, /claim_pending_invites/)
    assert.match(sql, /on_auth_user_claim_trip_invites/)
    assert.match(sql, /invite_status text/)
    assert.match(sql, /'pending'/)
    assert.match(sql, /_invite_role/)
    assert.equal(/raise exception 'user_not_found/.test(sql), false)
    assert.match(sql, /shechter\.gal@gmail.com/)
  })
})
