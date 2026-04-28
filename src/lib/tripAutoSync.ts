// Stub kept for the suppressNextPush() call site in tripRealtime.ts.
// Auto-push (subscribe-and-push-on-mutation) was removed by user request —
// sync is now strictly manual via the "סנכרן" button on Home.

let suppressUntil = 0

export function suppressNextPush(windowMs = 1500) {
  suppressUntil = Date.now() + windowMs
}

export function isPushSuppressed(): boolean {
  return Date.now() < suppressUntil
}

export async function startTripAutoSync(): Promise<() => void> {
  return () => {}
}

export function stopTripAutoSync(): void {
  // no-op
}
