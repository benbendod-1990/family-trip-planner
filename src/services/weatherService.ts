import type { TripCoords } from '@/types/trip-plan'

export interface DayWeather {
  date: string
  maxTemp: number
  minTemp: number
  weatherCode: number
  precipitation: number
}

export async function reverseGeocode(coords: TripCoords): Promise<{ name?: string; address?: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lon}&format=json`,
      { headers: { 'Accept-Language': 'he,en', 'User-Agent': 'myk-trip-plan/1.0' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data) return null
    const a = data.address ?? {}
    const name =
      data.name || a.attraction || a.tourism || a.amenity || a.shop || a.building || undefined
    return { name, address: data.display_name as string | undefined }
  } catch {
    return null
  }
}

export async function geocodeDestination(destination: string): Promise<TripCoords | null> {
  // Nominatim (OpenStreetMap) — supports Hebrew and all languages
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'he,en', 'User-Agent': 'myk-trip-plan/1.0' } }
    )
    if (res.ok) {
      const data = await res.json()
      if (data[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
    }
  } catch { /* fallthrough */ }

  // Fallback: Open-Meteo geocoding (Latin script only)
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=en&format=json`
    )
    if (res.ok) {
      const data = await res.json()
      const result = data.results?.[0]
      if (result) return { lat: result.latitude, lon: result.longitude }
    }
  } catch { /* ignore */ }

  return null
}

export async function fetchWeatherForecast(
  coords: TripCoords,
  startDate: string,
  endDate: string
): Promise<DayWeather[]> {
  const params = new URLSearchParams({
    latitude: coords.lat.toString(),
    longitude: coords.lon.toString(),
    daily: 'temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum',
    timezone: 'auto',
    start_date: startDate,
    end_date: endDate,
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  const { time, temperature_2m_max, temperature_2m_min, weathercode, precipitation_sum } = data.daily ?? {}
  if (!time) return []
  return (time as string[]).map((date: string, i: number) => ({
    date,
    maxTemp: Math.round(temperature_2m_max[i]),
    minTemp: Math.round(temperature_2m_min[i]),
    weatherCode: weathercode[i],
    precipitation: Math.round(precipitation_sum[i] ?? 0),
  }))
}

export function weatherCodeToEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '🌤️'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '🌨️'
  if (code <= 82) return '🌦️'
  return '⛈️'
}

export function weatherCodeToLabel(code: number): string {
  if (code === 0) return 'בהיר'
  if (code <= 3) return 'מעונן חלקית'
  if (code <= 48) return 'ערפל'
  if (code <= 67) return 'גשם'
  if (code <= 77) return 'שלג'
  if (code <= 82) return 'ממטרים'
  return 'סופת רעמים'
}
