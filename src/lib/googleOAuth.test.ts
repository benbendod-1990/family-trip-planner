import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  GMAIL_READONLY_SCOPE,
  GOOGLE_GMAIL_SCOPES,
  GOOGLE_IDENTITY_SCOPES,
  googleOAuthOptions,
  scopesIncludeGmailReadonly,
} from './googleOAuth.ts'

describe('Google OAuth scopes', () => {
  it('identity login requests only email + profile, not gmail.readonly', () => {
    const opts = googleOAuthOptions()
    assert.equal(opts.scopes, GOOGLE_IDENTITY_SCOPES)
    assert.equal(opts.scopes.includes('email'), true)
    assert.equal(opts.scopes.includes('profile'), true)
    assert.equal(scopesIncludeGmailReadonly(opts.scopes), false)
    assert.equal(opts.queryParams, undefined)
  })

  it('identity login does not force consent or offline access', () => {
    const opts = googleOAuthOptions({ gmail: false })
    assert.equal(opts.queryParams, undefined)
    assert.equal(JSON.stringify(opts).includes('consent'), false)
    assert.equal(JSON.stringify(opts).includes('offline'), false)
    assert.equal(JSON.stringify(opts).includes(GMAIL_READONLY_SCOPE), false)
  })

  it('Gmail connect requests gmail.readonly with offline + consent', () => {
    const opts = googleOAuthOptions({ gmail: true })
    assert.equal(opts.scopes, GOOGLE_GMAIL_SCOPES)
    assert.equal(scopesIncludeGmailReadonly(opts.scopes), true)
    assert.equal(opts.queryParams?.access_type, 'offline')
    assert.equal(opts.queryParams?.prompt, 'consent')
    assert.equal(opts.queryParams?.include_granted_scopes, 'true')
  })
})

describe('Google OAuth call sites', () => {
  it('AuthContext default sign-in uses googleOAuthOptions and does not hardcode gmail.readonly', () => {
    const auth = readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf8')
    assert.match(auth, /googleOAuthOptions/)
    assert.match(auth, /opts\?: GoogleSignInOpts/)
    assert.equal(auth.includes(GMAIL_READONLY_SCOPE), false)
    assert.equal(auth.includes("prompt: 'consent'"), false)
    assert.match(auth, /claimPendingInvites\(\)/)
    assert.match(auth, /claimTripShareLink\(/)
    const claimInvitesAt = auth.indexOf('claimPendingInvites()')
    const claimShareAt = auth.indexOf('claimTripShareLink(')
    const listAt = auth.indexOf('listTrips()')
    assert.ok(claimInvitesAt > 0)
    assert.ok(claimShareAt > claimInvitesAt)
    assert.ok(listAt > claimShareAt)
  })

  it('join, login, and the Home guest wall sign in without requesting Gmail', () => {
    const join = readFileSync(new URL('../pages/JoinTrip.tsx', import.meta.url), 'utf8')
    const login = readFileSync(new URL('../pages/Login.tsx', import.meta.url), 'utf8')
    const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8')
    assert.match(join, /signInWithGoogle\(\{\s*redirectPath:/)
    assert.equal(join.includes('gmail: true'), false)
    assert.match(login, /signInWithGoogle\(\)/)
    assert.equal(login.includes('gmail: true'), false)
    assert.match(home, /signInWithGoogle\(\)/)
    assert.equal(home.includes('gmail: true'), false)
    assert.equal(join.includes(GMAIL_READONLY_SCOPE), false)
    assert.equal(login.includes(GMAIL_READONLY_SCOPE), false)
    assert.equal(home.includes(GMAIL_READONLY_SCOPE), false)
  })

  it('session reconnect banner stays on identity scopes', () => {
    const banner = readFileSync(new URL('../components/auth/AuthReconnectBanner.tsx', import.meta.url), 'utf8')
    assert.match(banner, /signInWithGoogle\(\)/)
    assert.equal(banner.includes('gmail: true'), false)
  })

  it('Gmail sync CTAs request gmail.readonly via gmail: true', () => {
    const cloud = readFileSync(new URL('../components/cloud/CloudSyncButton.tsx', import.meta.url), 'utf8')
    const inline = readFileSync(new URL('../components/gmail/GmailSyncInlineButton.tsx', import.meta.url), 'utf8')
    assert.match(cloud, /signInWithGoogle\(\{\s*gmail:\s*true\s*\}\)/)
    assert.match(inline, /signInWithGoogle\(\{\s*gmail:\s*true\s*\}\)/)
  })
})
