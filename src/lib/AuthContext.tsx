import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { startTripRealtime, stopTripRealtime } from './tripRealtime'
import { startTripAutoSync, stopTripAutoSync, suppressNextPush } from './tripAutoSync'
import { listTrips, pushLocalToRemote } from './tripRepo'
import { useTripStore } from '@/stores/tripStore'
import { persistGmailRefreshToken } from './gmailToken'

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
    // On sign-in: pull cloud trips, merge with local (newer updatedAt wins),
    // push local-only trips back, then start the live syncs. Newer-wins is
    // critical because auto-push on mutation is disabled — without it, any
    // local edit made between sessions gets clobbered by the stale cloud
    // copy on the next refresh.
    const wireUp = async () => {
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
    }
    const tearDown = () => {
      stopTripRealtime()
      stopTripAutoSync()
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
      if (data.session) void wireUp()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s) void wireUp()
      else tearDown()
    })
    return () => {
      sub.subscription.unsubscribe()
      tearDown()
    }
  }, [])

  const signInWithGoogle = async () => {
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
