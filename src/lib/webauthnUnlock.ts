// Device unlock before showing passport bytes.
//
// This is a *client* gate. The Worker still requires a trip-member JWT before
// it mints a signed URL — Face ID is extra friction on a borrowed/stolen
// unlocked phone, not the authorization boundary.
//
// Honest copy: we never claim Face ID ran if the device only has a passkey /
// device PIN, and we never skip the prompt by pretending it succeeded.

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
      body: 'הדפדפן הזה לא תומך ב-WebAuthn. לא נציג את קובץ הדרכון בלי אימות מכשיר.',
    }
  }
  if (probe.platformUv) {
    return {
      method: 'platform-biometric',
      title: 'אימות ביומטרי',
      body: 'לפני הצגת הדרכון נבקש Face ID, Touch ID או Windows Hello — לפי מה שהמכשיר באמת תומך.',
    }
  }
  return {
    method: 'device-credential',
    title: 'סיסמת המכשיר / מפתח גישה',
    body: 'אין חיישן ביומטרי זמין בדפדפן הזה. נשתמש בסיסמת המכשיר או במפתח גישה. זה לא Face ID.',
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

function randomChallenge(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytes
}

function userHandle(userId: string): Uint8Array<ArrayBuffer> {
  const src = new TextEncoder().encode(userId)
  const out = new Uint8Array(Math.min(src.length, 64))
  out.set(src.subarray(0, out.length))
  return out
}

async function createPlatformCredential(userId: string, userName: string, platform: boolean): Promise<void> {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: 'Family Trip Planner', id: window.location.hostname },
      user: {
        id: userHandle(userId),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 60_000,
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
  saveCredId(userId, cred.rawId)
}

async function assertExistingCredential(userId: string): Promise<void> {
  const allow = loadCredId(userId)
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      timeout: 60_000,
      userVerification: 'required',
      rpId: window.location.hostname,
      allowCredentials: allow
        ? [{ type: 'public-key', id: allow, transports: ['internal'] }]
        : undefined,
    },
  })
  if (!cred) throw new Error('האימות בוטל או נכשל')
}

/**
 * Prompt for platform biometric or device credential. Throws on cancel /
 * unavailable — callers must not open the file.
 */
export async function unlockWithWebAuthn(userId: string, userName: string): Promise<UnlockCopy> {
  const copy = await probeAuthenticator()
  if (copy.method === 'unavailable') {
    throw new Error(copy.body)
  }
  try {
    if (!loadCredId(userId)) {
      await createPlatformCredential(userId, userName, copy.method === 'platform-biometric')
    } else {
      await assertExistingCredential(userId)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'האימות בוטל או נכשל'
    if (/not allowed|abort|cancel|denied/i.test(msg) || msg === 'האימות בוטל או נכשל') {
      throw new Error('האימות בוטל. הדרכון נשאר נעול.')
    }
    throw new Error(msg.slice(0, 180))
  }
  writeSession(makeUnlockRecord(userId))
  return copy
}

export async function ensureSensitiveUnlocked(userId: string, userName: string): Promise<UnlockCopy> {
  const copy = await probeAuthenticator()
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
