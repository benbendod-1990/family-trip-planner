import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Stack, Typography, Badge, Button } from 'myk-library'
import styled, { keyframes } from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { geocodeDestination, reverseGeocode } from '@/services/weatherService'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { wazeUrl, googleMapsUrl } from '@/utils/maps'
import { formatDateShort } from '@/utils/date'
import { fetchMapInsights, type MapInsightsResponse } from '@/lib/aiClient'
import SmartAddBar from '@/components/itinerary/SmartAddBar'
import type { TripCoords } from '@/types/trip-plan'
import L from 'leaflet'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

// Distinct, high-contrast palette for up to ~14 days. After that, colors recycle.
const DAY_PALETTE = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#d946ef', '#eab308', '#0ea5e9',
]
const DESTINATION_COLOR = '#1f2937' // neutral dark for the trip's anchor
const STAY_COLOR = '#7c3aed' // accommodations span multiple days → fixed color

type PointKind = 'destination' | 'accommodation' | 'event'

interface MapPoint {
  id: string
  kind: PointKind
  name: string
  address: string
  date?: string // YYYY-MM-DD
  startTime?: string
  category?: string
  emoji: string
  color: string
  dayIndex?: number
}

const slide = keyframes`
  from { transform: translateX(100%); }
  to   { transform: translateX(-100%); }
`

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
`

const MapHeader = styled.div<{ $mobile: boolean }>`
  padding: 12px ${({ $mobile }) => ($mobile ? '12px' : '24px')};
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray[200]};
  flex-shrink: 0;
`

const LoadingBar = styled.div`
  height: 3px;
  background: ${({ theme }) => theme.colors.gray[200]};
  overflow: hidden;
  flex-shrink: 0;

  &::after {
    content: '';
    display: block;
    height: 100%;
    width: 40%;
    background: ${({ theme }) => theme.colors.primary[500]};
    animation: ${slide} 1.2s ease-in-out infinite;
  }
`

const Body = styled.div<{ $mobile: boolean }>`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: ${({ $mobile }) => ($mobile ? 'column' : 'row')};
`

const MapWrapper = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;

  .leaflet-container {
    height: 100%;
    width: 100%;
    background: #e8e8e8;
  }
`

const Sidebar = styled.aside<{ $mobile: boolean }>`
  width: ${({ $mobile }) => ($mobile ? '100%' : '320px')};
  max-height: ${({ $mobile }) => ($mobile ? '40vh' : 'none')};
  border-${({ $mobile }) => ($mobile ? 'top' : 'right')}: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.gray[50] ?? '#fafafa'};
  overflow-y: auto;
  padding: 12px 14px;
`

const ErrorBox = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`

const FloatingAddPanel = styled.div<{ $mobile: boolean }>`
  position: absolute;
  z-index: 1000;
  background: white;
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
  padding: 0;
  ${({ $mobile }) =>
    $mobile
      ? `inset-inline: 12px; bottom: 12px; max-width: none;`
      : `inset-inline-start: 16px; bottom: 16px; width: 360px;`}
`

const HintBubble = styled.div`
  position: absolute;
  top: 12px;
  inset-inline-start: 50%;
  transform: translateX(-50%);
  background: rgba(31, 41, 55, 0.92);
  color: white;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  z-index: 999;
  pointer-events: none;
`

const LegendDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  margin-inline-end: 6px;
  vertical-align: middle;
  border: 1px solid rgba(0, 0, 0, 0.15);
`

const TipCard = styled.div<{ $color: string }>`
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-inline-start: 3px solid ${({ $color }) => $color};
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: white;
  font-size: 13px;
`

function pinSvg(color: string, emoji: string): string {
  return `
    <div style="
      position: relative;
      width: 30px;
      height: 38px;
      transform: translate(-15px, -38px);
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.35));
    ">
      <svg viewBox="0 0 30 38" width="30" height="38" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0 C6.7 0 0 6.7 0 15 C0 26 15 38 15 38 C15 38 30 26 30 15 C30 6.7 23.3 0 15 0 Z"
          fill="${color}" stroke="white" stroke-width="2" />
        <circle cx="15" cy="15" r="9" fill="white" />
      </svg>
      <div style="
        position: absolute;
        top: 5px;
        left: 0;
        width: 30px;
        text-align: center;
        font-size: 14px;
        line-height: 20px;
      ">${emoji}</div>
    </div>
  `
}

function eventEmoji(category?: string): string {
  switch (category) {
    case 'meal': return '🍽️'
    case 'transport': return '🚗'
    case 'rest': return '😴'
    case 'tour': return '🗺️'
    default: return '📍'
  }
}

export default function Map() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const setCoords = useTripStore(s => s.setCoords)

  const { isMobile } = useBreakpoint()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [insights, setInsights] = useState<MapInsightsResponse | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [pin, setPin] = useState<{ name?: string; address?: string; coords: TripCoords } | null>(null)
  const [pinResolving, setPinResolving] = useState(false)
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const initRef = useRef(false)
  const markersRef = useRef<Map<string, L.Marker>>(new globalThis.Map())
  const clickPinRef = useRef<L.Marker | null>(null)

  // Build flat list of points + a stable date→color map.
  const { points, dayColor } = useMemo(() => {
    const dayColor = new globalThis.Map<string, string>()
    if (!trip) return { points: [] as MapPoint[], dayColor }

    const sortedDates = trip.days.map(d => d.date).sort()
    sortedDates.forEach((date, idx) => {
      dayColor.set(date, DAY_PALETTE[idx % DAY_PALETTE.length])
    })

    const pts: MapPoint[] = []

    // Destination anchor
    pts.push({
      id: `dest-${trip.id}`,
      kind: 'destination',
      name: trip.destination,
      address: trip.destination,
      emoji: trip.coverEmoji || '📍',
      color: DESTINATION_COLOR,
    })

    // Accommodations
    for (const acc of trip.accommodations) {
      if (!acc.address) continue
      pts.push({
        id: `acc-${acc.id}`,
        kind: 'accommodation',
        name: acc.name,
        address: acc.address,
        date: acc.checkIn,
        emoji: '🏨',
        color: STAY_COLOR,
      })
    }

    // Events (color by their day)
    trip.days.forEach((day, dayIdx) => {
      for (const ev of day.events) {
        if (!ev.location) continue
        pts.push({
          id: `ev-${ev.id}`,
          kind: 'event',
          name: ev.title,
          address: ev.location,
          date: day.date,
          startTime: ev.startTime,
          category: ev.category,
          emoji: eventEmoji(ev.category),
          color: dayColor.get(day.date) ?? DAY_PALETTE[dayIdx % DAY_PALETTE.length],
          dayIndex: dayIdx,
        })
      }
    })

    return { points: pts, dayColor }
  }, [trip])

  // Lookup helpers driven by latest insights.
  const tipsById = useMemo(() => {
    const m = new globalThis.Map<string, { tips: string[]; nearby: MapInsightsResponse['per_point'][number]['nearby'] }>()
    if (insights) {
      for (const p of insights.per_point) m.set(p.id, { tips: p.tips, nearby: p.nearby })
    }
    return m
  }, [insights])

  const connectionsForPoint = useMemo(() => {
    const m = new globalThis.Map<string, MapInsightsResponse['connections']>()
    if (insights) {
      for (const c of insights.connections) {
        const arr = m.get(c.from_id) ?? []
        arr.push(c)
        m.set(c.from_id, arr)
      }
    }
    return m
  }, [insights])

  // Build popup HTML for a point (used both at init time and on insights update).
  function buildPopupHtml(p: MapPoint): string {
    const dateLabel = p.date ? formatDateShort(p.date) : ''
    const timeLabel = p.startTime ? `🕐 ${p.startTime}` : ''
    const waze = wazeUrl(p.address)
    const gmap = googleMapsUrl(p.address)

    const aiBlock = (() => {
      const data = tipsById.get(p.id)
      if (!data) return ''
      const tipsHtml = data.tips.length
        ? `<div style="margin-top:6px;"><b>טיפים:</b><ul style="margin:4px 0 0 16px;padding:0;">${data.tips
            .map(t => `<li style="margin:2px 0;">${escapeHtml(t)}</li>`)
            .join('')}</ul></div>`
        : ''
      const nearbyHtml = data.nearby.length
        ? `<div style="margin-top:6px;"><b>בסביבה:</b><ul style="margin:4px 0 0 16px;padding:0;">${data.nearby
            .map(
              n =>
                `<li style="margin:2px 0;">${n.kid_friendly ? '👶 ' : ''}<a href="${escapeAttr(
                  n.source_url
                )}" target="_blank" rel="noopener">${escapeHtml(n.name)}</a> · ${escapeHtml(n.why)} <span style="opacity:.6;">(${n.walking_minutes}′)</span></li>`
            )
            .join('')}</ul></div>`
        : ''
      const conns = connectionsForPoint.get(p.id) ?? []
      const connHtml = conns.length
        ? `<div style="margin-top:6px;"><b>בדרך הלאה:</b><ul style="margin:4px 0 0 16px;padding:0;">${conns
            .map(
              c =>
                `<li style="margin:2px 0;"><a href="${escapeAttr(
                  c.source_url
                )}" target="_blank" rel="noopener">${escapeHtml(c.suggestion)}</a></li>`
            )
            .join('')}</ul></div>`
        : ''
      return tipsHtml + nearbyHtml + connHtml
    })()

    return `
      <div style="min-width:220px;max-width:280px;font-size:13px;line-height:1.4;">
        <div style="font-weight:600;font-size:14px;">${p.emoji} ${escapeHtml(p.name)}</div>
        ${dateLabel || timeLabel
          ? `<div style="opacity:.7;font-size:12px;margin-top:2px;">${dateLabel}${dateLabel && timeLabel ? ' · ' : ''}${timeLabel}</div>`
          : ''
        }
        <div style="margin-top:6px;">📍 ${escapeHtml(p.address)}</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
          <a href="${escapeAttr(waze)}" target="_blank" rel="noopener"
             style="padding:4px 8px;background:#33ccff;color:white;border-radius:4px;text-decoration:none;font-weight:600;">Waze</a>
          <a href="${escapeAttr(gmap)}" target="_blank" rel="noopener"
             style="padding:4px 8px;background:#4285f4;color:white;border-radius:4px;text-decoration:none;font-weight:600;">Google Maps</a>
        </div>
        ${aiBlock}
      </div>
    `
  }

  // Init map once per trip.
  useEffect(() => {
    if (!trip || !containerRef.current || initRef.current) return
    initRef.current = true

    let cancelled = false

    async function init() {
      if (!trip || !containerRef.current) return

      let coords = trip.coords ?? null
      if (!coords) {
        coords = await geocodeDestination(trip.destination)
        if (cancelled) return
        if (!coords) { setStatus('error'); return }
        if (id) setCoords(id, coords)
      }
      if (cancelled || !containerRef.current) return

      const map = L.map(containerRef.current, { zoomControl: true })
        .setView([coords.lat, coords.lon], 12)
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // Click-on-empty-spot → reverse geocode → open SmartAddBar with location pinned.
      map.on('click', async (e: L.LeafletMouseEvent) => {
        const c: TripCoords = { lat: e.latlng.lat, lon: e.latlng.lng }
        if (clickPinRef.current) {
          clickPinRef.current.remove()
          clickPinRef.current = null
        }
        clickPinRef.current = L.marker([c.lat, c.lon], {
          icon: L.divIcon({
            className: 'trip-pin-temp',
            html: pinSvg('#8b5cf6', '✨'),
            iconSize: [30, 38],
            iconAnchor: [15, 38],
          }),
        }).addTo(map)
        setPin({ coords: c })
        setPinResolving(true)
        const rev = await reverseGeocode(c)
        setPinResolving(false)
        setPin(curr => (curr && curr.coords.lat === c.lat && curr.coords.lon === c.lon
          ? { ...curr, name: rev?.name, address: rev?.address ?? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}` }
          : curr))
      })

      if (!cancelled) setStatus('ready')

      // Geocode all points (sequential + small caches via geocodeDestination's network).
      const located: Array<MapPoint & { lat: number; lon: number }> = []

      // Destination anchor first (we already have its coords).
      const destPoint = points.find(p => p.kind === 'destination')
      if (destPoint) {
        located.push({ ...destPoint, lat: coords.lat, lon: coords.lon })
      }

      for (const p of points) {
        if (cancelled) return
        if (p.kind === 'destination') continue
        const c = await geocodeDestination(p.address)
        if (cancelled) return
        if (!c) continue
        located.push({ ...p, lat: c.lat, lon: c.lon })
      }

      if (cancelled) return

      // Add markers.
      const bounds = L.latLngBounds([])
      for (const p of located) {
        const marker = L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: 'trip-pin',
            html: pinSvg(p.color, p.emoji),
            iconSize: [30, 38],
            iconAnchor: [15, 38],
          }),
        })
          .addTo(map)
          .bindPopup(buildPopupHtml(p), { maxWidth: 300 })
        markersRef.current.set(p.id, marker)
        bounds.extend([p.lat, p.lon])
      }

      // Per-day polylines connecting events in chronological order.
      const byDate = new globalThis.Map<string, Array<MapPoint & { lat: number; lon: number }>>()
      for (const p of located) {
        if (p.kind !== 'event' || !p.date) continue
        const arr = byDate.get(p.date) ?? []
        arr.push(p)
        byDate.set(p.date, arr)
      }
      for (const [date, list] of byDate) {
        if (list.length < 2) continue
        list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
        L.polyline(
          list.map(p => [p.lat, p.lon] as [number, number]),
          { color: dayColor.get(date) ?? '#888', weight: 3, opacity: 0.6, dashArray: '6 6' }
        ).addTo(map)
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 })
      }
    }

    init()

    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      markersRef.current.clear()
      clickPinRef.current = null
      initRef.current = false
    }
  }, [trip?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function closePinPanel() {
    if (clickPinRef.current) {
      clickPinRef.current.remove()
      clickPinRef.current = null
    }
    setPin(null)
    setPinResolving(false)
  }

  // Refresh popups when AI insights arrive.
  useEffect(() => {
    if (!insights) return
    for (const p of points) {
      const marker = markersRef.current.get(p.id)
      if (marker) marker.setPopupContent(buildPopupHtml(p))
    }
  }, [insights]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadInsights() {
    if (!trip) return
    setAiStatus('loading')
    setAiError(null)
    try {
      const adults = trip.family.filter(m => !m.isChild).length
      const childrenCount = trip.family.filter(m => m.isChild).length
      const aiPoints = points.map(p => ({
        id: p.id,
        kind: p.kind,
        name: p.name,
        address: p.address,
        date: p.date,
        startTime: p.startTime,
        category: p.category,
      }))
      const res = await fetchMapInsights({
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        passengers: { adults, children: childrenCount },
        points: aiPoints,
      })
      setInsights(res)
      setAiStatus('ready')
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
      setAiStatus('error')
    }
  }

  if (!trip) return null

  return (
    <PageWrapper>
      <MapHeader $mobile={isMobile}>
        <Stack direction="row" align="center" spacing="sm" style={{ flexWrap: 'wrap' }}>
          <Typography variant="h5" style={{ margin: 0 }}>🗺️ מפה</Typography>
          <Badge variant="info" size="sm">{trip.destination}</Badge>
          {trip.accommodations.length > 0 && (
            <Badge size="sm">🏨 {trip.accommodations.length} לינות</Badge>
          )}
          <Badge size="sm">📍 {points.length} נקודות</Badge>
          {status === 'loading' && (
            <Typography variant="caption" style={{ opacity: 0.6 }}>מאתר יעד...</Typography>
          )}
          <div style={{ marginInlineStart: 'auto' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={loadInsights}
              disabled={aiStatus === 'loading' || status !== 'ready'}
            >
              {aiStatus === 'loading' ? '⏳ מחפש טיפים…' : '✨ טיפים חכמים מ-AI'}
            </Button>
          </div>
        </Stack>
      </MapHeader>

      {(status === 'loading' || aiStatus === 'loading') && <LoadingBar />}

      {status === 'error' ? (
        <ErrorBox>
          <Typography variant="body2">לא ניתן למצוא את "{trip.destination}" על המפה</Typography>
        </ErrorBox>
      ) : (
        <Body $mobile={isMobile}>
          <MapWrapper>
            <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
            {status === 'ready' && !pin && (
              <HintBubble>💡 הקליקו על המפה כדי להוסיף ללוז</HintBubble>
            )}
            {pin && (
              <FloatingAddPanel $mobile={isMobile}>
                <div style={{ padding: 12 }}>
                  <SmartAddBar
                    trip={trip}
                    pinnedLocation={
                      pinResolving
                        ? { name: '🔄 מאתר כתובת...', address: undefined, coords: pin.coords }
                        : pin
                    }
                    onCancel={closePinPanel}
                    onAdded={closePinPanel}
                  />
                </div>
              </FloatingAddPanel>
            )}
          </MapWrapper>

          <Sidebar $mobile={isMobile}>
            <Typography variant="h6" style={{ margin: '0 0 8px' }}>מקרא תאריכים</Typography>
            <div style={{ marginBottom: 12, fontSize: 13 }}>
              <div style={{ marginBottom: 4 }}>
                <LegendDot $color={DESTINATION_COLOR} /> יעד
              </div>
              <div style={{ marginBottom: 4 }}>
                <LegendDot $color={STAY_COLOR} /> לינות 🏨
              </div>
              {trip.days.map(day => (
                <div key={day.id} style={{ marginBottom: 2 }}>
                  <LegendDot $color={dayColor.get(day.date) ?? '#888'} />
                  {formatDateShort(day.date)} {day.label ? `· ${day.label}` : ''}
                </div>
              ))}
            </div>

            <Typography variant="h6" style={{ margin: '12px 0 8px' }}>
              ✨ טיפים חכמים
            </Typography>
            {aiStatus === 'idle' && (
              <Typography variant="caption" style={{ opacity: 0.7 }}>
                לחצו "טיפים חכמים מ-AI" למעלה כדי לקבל המלצות אישיות לכל נקודה במפה.
              </Typography>
            )}
            {aiStatus === 'error' && (
              <Typography variant="caption" style={{ color: '#ef4444' }}>
                שגיאה בקבלת טיפים: {aiError}
              </Typography>
            )}
            {aiStatus === 'ready' && insights && (
              <>
                {insights.per_point
                  .filter(pp => pp.tips.length || pp.nearby.length)
                  .map(pp => {
                    const point = points.find(p => p.id === pp.id)
                    if (!point) return null
                    return (
                      <TipCard key={pp.id} $color={point.color}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          {point.emoji} {point.name}
                          {point.date && (
                            <span style={{ opacity: 0.6, fontWeight: 400, marginInlineStart: 6 }}>
                              · {formatDateShort(point.date)}
                            </span>
                          )}
                        </div>
                        {pp.tips.map((t, i) => (
                          <div key={i} style={{ marginBottom: 2 }}>• {t}</div>
                        ))}
                        {pp.nearby.length > 0 && (
                          <div style={{ marginTop: 6, fontSize: 12 }}>
                            <b>בסביבה:</b>
                            {pp.nearby.map((n, i) => (
                              <div key={i} style={{ marginTop: 2 }}>
                                {n.kid_friendly ? '👶 ' : ''}
                                <a href={n.source_url} target="_blank" rel="noopener noreferrer">
                                  {n.name}
                                </a>{' '}
                                · {n.why}{' '}
                                <span style={{ opacity: 0.6 }}>({n.walking_minutes}′)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TipCard>
                    )
                  })}
                {insights.connections.length > 0 && (
                  <>
                    <Typography variant="h6" style={{ margin: '12px 0 6px' }}>
                      🔗 חיבורים בין נקודות
                    </Typography>
                    {insights.connections.map((c, i) => {
                      const from = points.find(p => p.id === c.from_id)
                      const to = points.find(p => p.id === c.to_id)
                      return (
                        <TipCard key={i} $color={from?.color ?? '#888'}>
                          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>
                            {from?.name ?? '?'} → {to?.name ?? '?'}
                          </div>
                          <a href={c.source_url} target="_blank" rel="noopener noreferrer">
                            {c.suggestion}
                          </a>
                        </TipCard>
                      )
                    })}
                  </>
                )}
              </>
            )}
          </Sidebar>
        </Body>
      )}
    </PageWrapper>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
