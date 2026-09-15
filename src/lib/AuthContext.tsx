import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { switchTripStoreAccount, useTripStore } from '@/stores/tripStore'
import {
  dropUnauthorizedDemoSeeds,
  localTripsSafeToAutoPush,
  resolveActiveTripId,
} from '@/lib/authTripSync'
import type { GoogleSignInOpts } from '@/lib/googleOAuth'

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
  signInWithGoogle: (opts?: GoogleSignInOpts) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Gates tearDownSyncs: without it, signing out (or unmounting) while never
    // signed in would pull the realtime/autosync chunks purely to call a
    // pair of no-op stop functions.
    let syncsRunning = false

    // On sign-in: switch to this user's persist key, pull RLS-visible trips,
    // merge newer-wins on those ids only, and auto-push user-created local
    // trips — never canonical demo seeds the user is not a member of.
    const wireUp = async (userId: string) => {
      const [
        { persistGmailRefreshToken },
        { listTrips, pushLocalToRemote, foldRemoteTrips, deleteCollapsedDuplicates, claimPendingInvites, claimTripShareLink },
        { startTripAutoSync, suppressNextPush },
        { startTripRealtime },
        { ensureSeedBookingDocuments },
        { ensureSeedDocLinks },
        { persistLinkDocuments },
        { FAMILY_SEED_TRIPS },
      ] = await Promise.all([
        import('./gmailToken'),
        import('./tripRepo'),
        import('./tripAutoSync'),
        import('./tripRealtime'),
        import('./seedBookingDocuments'),
        import('./seedDocLink'),
        import('./tripDocuments'),
        import('@/data/familySeeds'),
      ])
      await switchTripStoreAccount(userId)
      // Fire-and-forget: capture Google's refresh_token only after a Gmail
      // connect (identity login no longer requests access_type=offline, so
      // this no-ops for join/login). After the first JWT refresh it's gone.
      void persistGmailRefreshToken()
      try {
        try {
          await claimPendingInvites()
        } catch (e) {
          // 0011 not applied yet, or a transient RPC miss — still pull what RLS sees.
          console.warn('[auth] claim pending invites failed:', e)
        }
        try {
          const { peekPendingShareToken } = await import('./tripShareLink')
          const shareToken = peekPendingShareToken()
          if (shareToken) {
            await claimTripShareLink(shareToken)
          }
        } catch (e) {
          // 0012 not applied yet, or an expired/revoked token — Join page shows the error.
          console.warn('[auth] claim share link failed:', e)
        }
        const remote = await listTrips()
        const localTrips = useTripStore.getState().trips
        const remoteIds = new Set(remote.map(t => t.id))
        const localForMerge = dropUnauthorizedDemoSeeds(localTrips, remoteIds)
        const { trips: merged, droppedIds } = foldRemoteTrips(localForMerge, remote)
        if (droppedIds.length) {
          await deleteCollapsedDuplicates(droppedIds, [...localTrips, ...remote])
        }
        const pushable = localTripsSafeToAutoPush(merged, remoteIds)
        if (pushable.length) {
          await pushLocalToRemote(pushable)
        }
        const withSeedDocs = ensureSeedDocLinks(ensureSeedBookingDocuments(merged, FAMILY_SEED_TRIPS))
        suppressNextPush()
        useTripStore.setState({
          trips: withSeedDocs,
          activeTripId: resolveActiveTripId(withSeedDocs, useTripStore.getState().activeTripId),
        })
        for (const t of withSeedDocs) {
          const links = t.documents ?? []
          if (links.length) void persistLinkDocuments(t.id, links)
        }
      } catch (e) {
        console.error('[auth] initial pull/merge failed:', e)
      }
      await startTripAutoSync()
      startTripRealtime()
      syncsRunning = true
    }
    // Only reachable once wireUp() has run, so these modules are already in
    // the module cache and the dynamic import resolves without a fetch.
    // Unmount must NOT switch the persist key back to guest — React StrictMode
    // remounts this provider, and that would flash demo seeds over USA.
    const tearDownSyncs = async () => {
      if (!syncsRunning) return
      syncsRunning = false
      const [{ stopTripRealtime }, { stopTripAutoSync }] = await Promise.all([
        import('./tripRealtime'),
        import('./tripAutoSync'),
      ])
      stopTripRealtime()
      stopTripAutoSync()
    }
    const leaveAccount = async () => {
      await tearDownSyncs()
      await switchTripStoreAccount(null)
    }

    // Unsubscribing has to survive an unmount that beats the dynamic import.
    let unsubscribe: (() => void) | undefined
    let unmounted = false

    void loadSupabase().then(supabase => {
      if (unmounted) return

      void supabase.auth.getSession().then(({ data }) => {
        setSession(data.session)
        setLoading(false)
        if (data.session) void wireUp(data.session.user.id)
      })
      const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
        setSession(s)
        if (s) void wireUp(s.user.id)
        else void leaveAccount()
      })
      unsubscribe = () => sub.subscription.unsubscribe()
    })

    return () => {
      unmounted = true
      unsubscribe?.()
      void tearDownSyncs()
    }
  }, [])

  const signInWithGoogle = async (opts?: GoogleSignInOpts) => {
    const supabase = await loadSupabase()
    const [{ oauthRedirectUrl }, { googleOAuthOptions }] = await Promise.all([
      import('./tripShareLink'),
      import('./googleOAuth'),
    ])
    const oauth = googleOAuthOptions(opts)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: oauthRedirectUrl(opts?.redirectPath),
        scopes: oauth.scopes,
        ...(oauth.queryParams ? { queryParams: oauth.queryParams } : {}),
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
