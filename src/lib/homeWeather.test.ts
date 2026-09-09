import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDestinationNowWeather } from '../services/weatherService.ts'

const HE = /[\u0590-\u05FF]/

const SAMPLE = {
  current_weather: { temperature: 28.4, weathercode: 2, time: '2026-09-09T12:00' },
  daily: {
    time: ['2026-09-09', '2026-09-10'],
    temperature_2m_max: [31.2, 29.8],
    temperature_2m_min: [24.1, 23.0],
    weathercode: [2, 61],
    precipitation_sum: [0, 4.2],
  },
}

describe('parseDestinationNowWeather', () => {
  it('reads current + today + tomorrow from an Open-Meteo payload', () => {
    const parsed = parseDestinationNowWeather(SAMPLE)
    assert.ok(parsed)
    assert.equal(parsed!.current.temp, 28)
    assert.equal(parsed!.current.weatherCode, 2)
    assert.equal(parsed!.today.date, '2026-09-09')
    assert.equal(parsed!.today.maxTemp, 31)
    assert.equal(parsed!.tomorrow?.date, '2026-09-10')
    assert.equal(parsed!.tomorrow?.weatherCode, 61)
    assert.equal(parsed!.tomorrow?.precipitation, 4)
  })

  it('also accepts the current= API shape', () => {
    const parsed = parseDestinationNowWeather({
      current: { temperature_2m: 18.6, weather_code: 0 },
      daily: {
        time: ['2026-09-09'],
        temperature_2m_max: [20],
        temperature_2m_min: [12],
        weather_code: [0],
        precipitation_sum: [0],
      },
    })
    assert.equal(parsed?.current.temp, 19)
    assert.equal(parsed?.tomorrow, null)
  })

  it('returns null on garbage', () => {
    assert.equal(parseDestinationNowWeather(null), null)
    assert.equal(parseDestinationNowWeather({}), null)
  })
})

describe('Home trip cards show destination now/tomorrow weather', () => {
  it('TripCard lazy-loads the weather strip so Home stays off supabase', () => {
    const card = readFileSync(new URL('../components/trip/TripCard.tsx', import.meta.url), 'utf8')
    assert.ok(card.includes("lazy(() => import('@/components/trip/TripWeatherStrip'))"))
    assert.ok(card.includes('TripWeatherStrip'))
    assert.equal(card.includes('familySeeds'), false)
    assert.equal(/usa-trip/.test(card), false)
  })

  it('the strip is Hebrew RTL now + tomorrow and uses Open-Meteo current weather', () => {
    const strip = readFileSync(new URL('../components/trip/TripWeatherStrip.tsx', import.meta.url), 'utf8')
    assert.ok(strip.includes('עכשיו'))
    assert.ok(strip.includes('מחר'))
    assert.match(strip, HE)
    assert.ok(strip.includes('direction: rtl'))
    const service = readFileSync(new URL('../services/weatherService.ts', import.meta.url), 'utf8')
    assert.ok(service.includes("current_weather: 'true'"))
    assert.ok(service.includes("forecast_days: '2'"))
    assert.ok(service.includes('api.open-meteo.com'))
    const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8')
    assert.equal(home.includes('familySeeds'), false)
  })
})
