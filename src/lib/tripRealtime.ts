import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { listTrips } from './tripRepo'
import { useTripStore } from '@/stores/tripStore'
import { suppressNextPush } from './tripAutoSync'

// Subscribes to changes on every trip-related table for the signed-in user.
// On any change we refetch and replace the store — simple, correct, and cheap
// for a tiny multi-user app. We can switch to per-row patching later if needed.

const TABLES = [
  'trips',
  'trip_members',
  'days',
  'events',
  'budget_items',
  'flights',
  'accommodations',
  'car_rentals',
  'family_members',
  'tasks',
  'packing_items',
] as const

let channel: RealtimeChannel | null = null
let pending: ReturnType<typeof setTimeout> | null = null

function scheduleRefetch() {
  if (pending) clearTimeout(pending)
  pending = setTimeout(async () => {
    pending = null
    try {
      const remote = await listTrips()
      const localTrips = useTripStore.getState().trips
      const remoteById = new Map(remote.map(t => [t.id, t]))
      // Merge by updatedAt — preserve unsynced local edits when the cloud
      // changes (auto-push is off; only pushed-or-newer cloud rows should
      // overwrite local ones).
      const merged = localTrips.map(local => {
        const r = remoteById.get(local.id)
        return r && new Date(r.updatedAt) > new Date(local.updatedAt) ? r : local
      })
      for (const r of remote) {
        if (!merged.some(t => t.id === r.id)) merged.push(r)
      }
      suppressNextPush()
      useTripStore.setState({ trips: merged })
    } catch (e) {
      console.error('realtime refetch failed:', e)
    }
  }, 250) // coalesce bursts
}

export function startTripRealtime(): () => void {
  stopTripRealtime()
  channel = supabase.channel('trips-live')
  for (const table of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefetch)
  }
  channel.subscribe()
  return stopTripRealtime
}

export function stopTripRealtime(): void {
  if (channel) {
    supabase.removeChannel(channel)
    channel = null
  }
  if (pending) {
    clearTimeout(pending)
    pending = null
  }
}
