import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useTripStore } from '@/stores/tripStore'

/*
 * Everything Supabase-shaped below is imported dynamically, on purpose.
 *
 * This provider is mounted from main.tsx, so a static `import { supabase }`
 * put @supabase/supabase-js (~183kB) and its whole dependent chain —
 * tripRepo, tripRealtime, tripAutoSync, gmailToken, and through them aiClient
 * — into the entry graph. All of it was downloaded and parsed *before the
 * first pixel*, despite none of it being needed to paint a single screen:
 * session restore is asynchronous anyway, and the trip list renders from
 * localStorage. Deferring it takes that weight off the critical path; the
 * session still resolves within a frame or two of the app becoming visible.
 *
 * Type-only imports (Session, User) are erased at compile time and cost
 * nothing, so those stay static.
 */
const loadSupabase = () => import('./supabase').then(m => m.supabase)

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Gates tearDown: without it, signing out (or unmounting) while never
    // signed in would pull the realtime/autosync chunks purely to call a
    // pair of no-op stop functions.
    let syncsRunning = false

    // On sign-in: pull cloud trips, merge with local (newer updatedAt wins),
    // push local-only trips back, then start the live syncs. Newer-wins is
    // critical because auto-push on mutation is disabled — without it, any
    // local edit made between sessions gets clobbered by the stale cloud
    // copy on the next refresh.
    const wireUp = async () => {
      const [
        { persistGmailRefreshToken },
        { listTrips, pushLocalToRemote },
        { startTripAutoSync, suppressNextPush },
        { startTripRealtime },
      ] = await Promise.all([
        import('./gmailToken'),
        import('./tripRepo'),
        import('./tripAutoSync'),
        import('./tripRealtime'),
      ])
      // Fire-and-forget: capture Google's refresh_token now, while Supabase
      // still has it in the session. After the first JWT refresh it's gone.
      void persistGmailRefreshToken()
      try {
        const remote = await listTrips()
        const localTrips = useTripStore.getState().trips
        const remoteById = new Map(remote.map(t => [t.id, t]))
        const merged = localTrips.map(local => {
          const r = remoteById.get(local.id)
          return r && new Date(r.updatedAt) > new Date(local.updatedAt) ? r : local
        })
        for (const r of remote) {
          if (!merged.some(t => t.id === r.id)) merged.push(r)
        }
        const localOnly = localTrips.filter(t => !remoteById.has(t.id))
        if (localOnly.length) {
          await pushLocalToRemote(localOnly)
        }
        suppressNextPush()
        useTripStore.setState({ trips: merged })
      } catch (e) {
        console.error('[auth] initial pull/merge failed:', e)
      }
      await startTripAutoSync()
      startTripRealtime()
      syncsRunning = true
    }
    // Only reachable once wireUp() has run, so these modules are already in
    // the module cache and the dynamic import resolves without a fetch.
    const tearDown = async () => {
      if (!syncsRunning) return
      syncsRunning = false
      const [{ stopTripRealtime }, { stopTripAutoSync }] = await Promise.all([
        import('./tripRealtime'),
        import('./tripAutoSync'),
      ])
      stopTripRealtime()
      stopTripAutoSync()
    }

    // Unsubscribing has to survive an unmount that beats the dynamic import.
    let unsubscribe: (() => void) | undefined
    let unmounted = false

    void loadSupabase().then(supabase => {
      if (unmounted) return

      void supabase.auth.getSession().then(({ data }) => {
        setSession(data.session)
        setLoading(false)
        if (data.session) void wireUp()
      })
      const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
        setSession(s)
        if (s) void wireUp()
        else void tearDown()
      })
      unsubscribe = () => sub.subscription.unsubscribe()
    })

    return () => {
      unmounted = true
      unsubscribe?.()
      void tearDown()
    }
  }, [])

  const signInWithGoogle = async () => {
    const supabase = await loadSupabase()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
        // gmail.readonly so the "סנכרן Gmail" button can read booking
        // confirmations. Without this the provider_token has no Gmail access.
        scopes: 'email profile https://www.googleapis.com/auth/gmail.readonly',
        // access_type=offline + prompt=consent are required for Google to
        // return a refresh_token. Without them we'd be stuck with a 1h
        // access_token and no way to refresh it server-side.
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
  }

  const signOut = async () => {
    const supabase = await loadSupabase()
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
