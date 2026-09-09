import { useEffect, useMemo, useState } from 'react'
import {
  fetchDestinationNowWeather,
  geocodeDestination,
  type DestinationNowWeather,
} from '@/services/weatherService'
import type { TripCoords } from '@/types/trip-plan'

const CACHE_PREFIX = 'home-wx-v1:'
const CACHE_TTL_MS = 45 * 60 * 1000

function cacheKey(destination: string, coords?: TripCoords): string {
  if (coords) return `${CACHE_PREFIX}${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}`
  return `${CACHE_PREFIX}${destination.trim()}`
}

function readCache(key: string): DestinationNowWeather | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw) as { ts: number; data: DestinationNowWeather }
    if (Date.now() - ts > CACHE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

function writeCache(key: string, data: DestinationNowWeather) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    /* quota */
  }
}

export function useDestinationNowWeather(
  destination: string,
  coords?: TripCoords,
): { weather: DestinationNowWeather | null; loading: boolean } {
  const key = cacheKey(destination, coords)
  const cached = useMemo(() => readCache(key), [key])
  const [remote, setRemote] = useState<{ key: string; data: DestinationNowWeather } | null>(null)

  const weather = remote?.key === key ? remote.data : cached
  const loading = !weather && Boolean(destination.trim() || coords)

  useEffect(() => {
    if (weather) return
    if (!destination.trim() && !coords) return
    let cancelled = false

    void (async () => {
      const point = coords ?? await geocodeDestination(destination)
      if (!point || cancelled) return
      const snapshot = await fetchDestinationNowWeather(point)
      if (!snapshot || cancelled) return
      writeCache(key, snapshot)
      setRemote({ key, data: snapshot })
    })()

    return () => {
      cancelled = true
    }
  }, [key, destination, coords, weather])

  return { weather, loading }
}
