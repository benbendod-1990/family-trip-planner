import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { startTripRealtime, stopTripRealtime } from './tripRealtime'
import { startTripAutoSync, stopTripAutoSync, suppressNextPush } from './tripAutoSync'
import { listTrips, pushLocalToRemote } from './tripRepo'
import { useTripStore } from '@/stores/tripStore'

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
    // On sign-in: pull cloud trips, merge with local (cloud wins on conflict),
    // push merged set back, then start the live syncs. This makes a freshly-
    // signed-in device pick up trips from any other device automatically.
    const wireUp = async () => {
      try {
        const [remote, localTrips] = [await listTrips(), useTripStore.getState().trips]
        const remoteIds = new Set(remote.map(t => t.id))
        const localOnly = localTrips.filter(t => !remoteIds.has(t.id))
        if (localOnly.length) {
          await pushLocalToRemote(localOnly)
        }
        const merged = [...remote, ...localOnly]
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
