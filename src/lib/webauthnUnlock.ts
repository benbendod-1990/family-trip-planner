// Device unlock before showing passport bytes.
//
// Client Face ID is UX friction. Authorization is the Worker: it issues the
// challenge, stores the public key, and verifies the assertion before minting
// a signed URL. A local session only skips a second prompt in this tab.

export const UNLOCK_TTL_MS = 10 * 60 * 1000

export type UnlockMethod = 'platform-biometric' | 'device-credential' | 'unavailable'

export interface UnlockCopy {
  method: UnlockMethod
  /** Short button / heading. */
  title: string
  /** Why this prompt is showing — never implies Face ID unless UVPA is true. */
  body: string
}

export interface UnlockRecord {
  userId: string
  until: number
}

export class WebAuthnRequiredError extends Error {
  constructor(message = 'נדרש אימות מכשיר כדי לפתוח דרכון') {
    super(message)
    this.name = 'WebAuthnRequiredError'
  }
}

export class WebAuthnUnavailableError extends Error {
  readonly copy: UnlockCopy
  constructor(copy: UnlockCopy) {
    super(copy.body)
    this.name = 'WebAuthnUnavailableError'
    this.copy = copy
  }
}

const SESSION_KEY = 'ftp-sensitive-unlock'
const CRED_KEY_PREFIX = 'ftp-webauthn-cred:'

export function authenticatorCopy(probe: {
  webauthn: boolean
  platformUv: boolean | null
}): UnlockCopy {
  if (!probe.webauthn) {
    return {
      method: 'unavailable',
      title: 'אימות המכשיר לא זמין',
      body: 'הדפדפן הזה לא תומך ב-WebAuthn. לא נציג את קובץ הדרכון בלי אימות מכשיר שנבדק בשרת.',
    }
  }
  if (probe.platformUv) {
    return {
      method: 'platform-biometric',
      title: 'אימות ביומטרי',
      body: 'לפני הצגת הדרכון נבקש Face ID, Touch ID או Windows Hello — לפי מה שהמכשיר באמת תומך. השרת בודק את החתימה, לא רק המסך הזה.',
    }
  }
  return {
    method: 'device-credential',
    title: 'סיסמת המכשיר / מפתח גישה',
    body: 'אין חיישן ביומטרי זמין בדפדפן הזה. נשתמש בסיסמת המכשיר או במפתח גישה. זה לא Face ID. השרת עדיין חייב לאשר את האימות.',
  }
}

export function isUnlockValid(record: UnlockRecord | null, userId: string, nowMs = Date.now()): boolean {
  if (!record || record.userId !== userId) return false
  return record.until > nowMs
}

export function makeUnlockRecord(userId: string, nowMs = Date.now(), ttlMs = UNLOCK_TTL_MS): UnlockRecord {
  return { userId, until: nowMs + ttlMs }
}

export async function probeAuthenticator(): Promise<UnlockCopy> {
  const webauthn = typeof globalThis.PublicKeyCredential === 'function'
  if (!webauthn) return authenticatorCopy({ webauthn: false, platformUv: null })
  let platformUv: boolean | null = false
  try {
    platformUv = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    platformUv = false
  }
  return authenticatorCopy({ webauthn: true, platformUv })
}

function credStorageKey(userId: string): string {
  return `${CRED_KEY_PREFIX}${userId}`
}

function loadCredId(userId: string): Uint8Array<ArrayBuffer> | null {
  try {
    const raw = localStorage.getItem(credStorageKey(userId))
    if (!raw) return null
    return base64UrlToBytes(raw)
  } catch {
    return null
  }
}

function saveCredId(userId: string, id: ArrayBuffer): void {
  localStorage.setItem(credStorageKey(userId), bytesToBase64Url(new Uint8Array(id)))
}

function readSession(): UnlockRecord | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UnlockRecord
    if (typeof parsed?.userId !== 'string' || typeof parsed?.until !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeSession(record: UnlockRecord): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(record))
}

export function readUnlock(userId: string, nowMs = Date.now()): boolean {
  return isUnlockValid(readSession(), userId, nowMs)
}

export function clearUnlock(): void {
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* private mode */ }
}

interface ChallengeResponse {
  challenge: string
  rpId: string
  rpName: string
  purpose: 'register' | 'assert'
  timeout: number
  user: { id: string; name: string; displayName: string }
  allowCredentials: Array<{ type: 'public-key'; id: string; transports?: AuthenticatorTransport[] }>
}

export interface SerializedAssertion {
  id: string
  rawId: string
  type: 'public-key'
  response: {
    clientDataJSON: string
    authenticatorData?: string
    signature?: string
    attestationObject?: string
    userHandle?: string
  }
}

async function fetchChallenge(purpose?: 'register' | 'assert'): Promise<ChallengeResponse> {
  const { workerAuthHeaders } = await import('./workerAuth')
  const aiBase = (import.meta as { env?: { VITE_AI_BASE_URL?: string } }).env?.VITE_AI_BASE_URL ?? 'http://localhost:8787'
  const res = await fetch(`${aiBase}/api/documents/webauthn/challenge`, {
    method: 'POST',
    headers: await workerAuthHeaders(),
    body: JSON.stringify(purpose ? { purpose } : {}),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t.slice(0, 180) || 'לא ניתן להתחיל אימות מכשיר')
  }
  return (await res.json()) as ChallengeResponse
}

async function postCredential(path: 'register' | 'assert', cred: PublicKeyCredential): Promise<void> {
  const { workerAuthHeaders } = await import('./workerAuth')
  const aiBase = (import.meta as { env?: { VITE_AI_BASE_URL?: string } }).env?.VITE_AI_BASE_URL ?? 'http://localhost:8787'
  const res = await fetch(`${aiBase}/api/documents/webauthn/${path}`, {
    method: 'POST',
    headers: await workerAuthHeaders(),
    body: JSON.stringify(serializeCredential(cred)),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t.slice(0, 180) || 'השרת דחה את אימות המכשיר')
  }
}

function serializeCredential(cred: PublicKeyCredential): SerializedAssertion {
  const response = cred.response
  const out: SerializedAssertion = {
    id: cred.id,
    rawId: bytesToBase64Url(new Uint8Array(cred.rawId)),
    type: 'public-key',
    response: {
      clientDataJSON: bytesToBase64Url(new Uint8Array(response.clientDataJSON)),
    },
  }
  if (response instanceof AuthenticatorAttestationResponse) {
    out.response.attestationObject = bytesToBase64Url(new Uint8Array(response.attestationObject))
  }
  if (response instanceof AuthenticatorAssertionResponse) {
    out.response.authenticatorData = bytesToBase64Url(new Uint8Array(response.authenticatorData))
    out.response.signature = bytesToBase64Url(new Uint8Array(response.signature))
    if (response.userHandle) {
      out.response.userHandle = bytesToBase64Url(new Uint8Array(response.userHandle))
    }
  }
  return out
}

function allowList(ids: Array<{ id: string; transports?: AuthenticatorTransport[] }>, local?: Uint8Array<ArrayBuffer> | null) {
  const fromServer = ids.map(c => ({
    type: 'public-key' as const,
    id: base64UrlToBytes(c.id),
    transports: (c.transports ?? ['internal']) as AuthenticatorTransport[],
  }))
  if (local && !fromServer.some(c => bytesEq(new Uint8Array(c.id), local))) {
    fromServer.push({ type: 'public-key', id: local, transports: ['internal'] })
  }
  return fromServer
}

function bytesEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

async function createPlatformCredential(challenge: ChallengeResponse, platform: boolean): Promise<PublicKeyCredential> {
  const userId = base64UrlToBytes(challenge.user.id)
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: base64UrlToBytes(challenge.challenge),
      rp: { name: challenge.rpName, id: challenge.rpId },
      user: {
        id: userId,
        name: challenge.user.name,
        displayName: challenge.user.displayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: challenge.timeout,
      authenticatorSelection: {
        ...(platform ? { authenticatorAttachment: 'platform' as const } : {}),
        userVerification: 'required',
        residentKey: 'preferred',
      },
      attestation: 'none',
    },
  })
  if (!cred || !(cred instanceof PublicKeyCredential)) {
    throw new Error('האימות בוטל או נכשל')
  }
  return cred
}

async function assertExistingCredential(challenge: ChallengeResponse, userId: string): Promise<PublicKeyCredential> {
  const allow = allowList(challenge.allowCredentials, loadCredId(userId))
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: base64UrlToBytes(challenge.challenge),
      timeout: challenge.timeout,
      userVerification: 'required',
      rpId: challenge.rpId,
      allowCredentials: allow.length ? allow : undefined,
    },
  })
  if (!cred || !(cred instanceof PublicKeyCredential)) {
    throw new Error('האימות בוטל או נכשל')
  }
  return cred
}

function mapUnlockError(e: unknown): never {
  const msg = e instanceof Error ? e.message : 'האימות בוטל או נכשל'
  if (e instanceof WebAuthnUnavailableError) throw e
  if (/not allowed|abort|cancel|denied/i.test(msg) || msg === 'האימות בוטל או נכשל') {
    throw new Error('האימות בוטל. הדרכון נשאר נעול.')
  }
  throw new Error(msg.slice(0, 180))
}

/**
 * Prompt for platform biometric or device credential, then register/assert
 * the public key with the Worker. Throws on cancel / unavailable.
 */
export async function unlockWithWebAuthn(userId: string, _userName: string): Promise<UnlockCopy> {
  const copy = await probeAuthenticator()
  if (copy.method === 'unavailable') {
    throw new WebAuthnUnavailableError(copy)
  }
  try {
    let challenge = await fetchChallenge()
    if (challenge.purpose === 'register' || (!loadCredId(userId) && challenge.allowCredentials.length === 0)) {
      if (challenge.purpose !== 'register') {
        challenge = await fetchChallenge('register')
      }
      const cred = await createPlatformCredential(challenge, copy.method === 'platform-biometric')
      await postCredential('register', cred)
      saveCredId(userId, cred.rawId)
    } else {
      try {
        const cred = await assertExistingCredential(challenge, userId)
        await postCredential('assert', cred)
        saveCredId(userId, cred.rawId)
      } catch (e) {
        // New iPhone / lost local cred id: register a fresh authenticator.
        if (/בוטל/.test(e instanceof Error ? e.message : '')) throw e
        const registerChallenge = await fetchChallenge('register')
        const cred = await createPlatformCredential(registerChallenge, copy.method === 'platform-biometric')
        await postCredential('register', cred)
        saveCredId(userId, cred.rawId)
      }
    }
  } catch (e) {
    mapUnlockError(e)
  }
  writeSession(makeUnlockRecord(userId))
  return copy
}

export async function ensureSensitiveUnlocked(userId: string, userName: string): Promise<UnlockCopy> {
  const copy = await probeAuthenticator()
  if (copy.method === 'unavailable') throw new WebAuthnUnavailableError(copy)
  if (readUnlock(userId)) return copy
  return unlockWithWebAuthn(userId, userName)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
