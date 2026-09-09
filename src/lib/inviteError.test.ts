import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inviteFailureStatus, rpcErrorText } from './inviteError.ts'

const ORIGIN = 'https://family-trip-planner-end.pages.dev'
const EMAIL = 'Edenbendavid1992@gmail.com'

describe('invite error copy', () => {
  it('maps a PostgREST user_not_found object to the Hebrew sign-in hint', () => {
    const err = {
      message: 'user_not_found: Edenbendavid1992@gmail.com must sign in to the app at least once before being invited',
      details: null,
      hint: null,
      code: 'P0001',
    }
    const status = inviteFailureStatus(err, EMAIL, ORIGIN)
    assert.match(status, /עדיין לא נרשם/)
    assert.match(status, /\/login/)
    assert.equal(status.includes('שגיאה: שגיאה'), false)
  })

  it('maps the same payload after describe() wraps it in an Error', () => {
    const wrapped = new Error(
      'invite_user_to_trip: user_not_found: Edenbendavid1992@gmail.com must sign in | P0001',
    )
    const status = inviteFailureStatus(wrapped, EMAIL, ORIGIN)
    assert.match(status, /עדיין לא נרשם/)
    assert.match(status, new RegExp(`${ORIGIN}/login`))
  })

  it('maps a forbidden PostgREST object to the owner-only copy', () => {
    const status = inviteFailureStatus(
      { message: 'forbidden: only the trip owner may invite members', code: 'P0001' },
      EMAIL,
      ORIGIN,
    )
    assert.equal(status, 'רק יוצר הטיול יכול להזמין')
  })

  it('never renders the tautology שגיאה: שגיאה', () => {
    assert.equal(inviteFailureStatus('שגיאה', EMAIL, ORIGIN), 'שגיאה לא ידועה')
    assert.equal(inviteFailureStatus({}, EMAIL, ORIGIN), 'שגיאה לא ידועה')
    assert.equal(inviteFailureStatus(null, EMAIL, ORIGIN), 'שגיאה לא ידועה')
  })

  it('reads message from a plain object when it is not an Error', () => {
    assert.match(
      rpcErrorText({ message: 'user_not_found: x', code: 'P0001' }),
      /user_not_found/,
    )
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
    assert.equal(/if \(error\) throw error/.test(block), false)
  })

  it('InviteMemberModal uses inviteFailureStatus instead of instanceof-only parsing', () => {
    const text = readFileSync(new URL('../components/cloud/InviteMemberModal.tsx', import.meta.url), 'utf8')
    assert.match(text, /inviteFailureStatus\(/)
    assert.equal(text.includes("e instanceof Error ? e.message : 'שגיאה'"), false)
  })
})
