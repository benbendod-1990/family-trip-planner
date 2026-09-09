import { useEffect, useMemo, useRef, useState } from 'react'
import { geocodeDestination } from '@/services/weatherService'
import {
  collectPlaceCandidates,
  focusOriginForTrip,
  focusRegionPois,
  withResolvedCoords,
  type TripMapPoi,
} from '@/lib/tripMapPois'
import type { TripCoords, TripPlan } from '@/types/trip-plan'

export function useTripMapPois(trip: TripPlan | undefined): {
  pois: TripMapPoi[]
  pendingGeocode: number
} {
  const candidates = useMemo(
    () => (trip ? collectPlaceCandidates(trip) : []),
    [trip],
  )
  const [extraCoords, setExtraCoords] = useState<Record<string, TripCoords>>({})
  const attempted = useRef(new Set<string>())

  useEffect(() => {
    const missing = candidates.filter(c => !c.coords && !attempted.current.has(c.key))
    if (missing.length === 0) return
    let cancelled = false
    for (const c of missing) attempted.current.add(c.key)

    void (async () => {
      const found: Record<string, TripCoords> = {}
      for (const c of missing) {
        const coords = await geocodeDestination(c.location)
        if (coords) found[c.key] = coords
      }
      if (!cancelled && Object.keys(found).length > 0) {
        setExtraCoords(prev => ({ ...prev, ...found }))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [candidates])

  const pois = useMemo(() => {
    const resolved = withResolvedCoords(candidates, extraCoords)
    if (!trip) return resolved
    const origin = focusOriginForTrip(trip, resolved)
    return origin ? focusRegionPois(resolved, origin) : resolved
  }, [candidates, extraCoords, trip])

  const pendingGeocode = candidates.filter(c => !c.coords && !extraCoords[c.key]).length

  return { pois, pendingGeocode }
}
