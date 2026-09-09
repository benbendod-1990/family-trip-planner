import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import styled from 'styled-components'
import type { TripMapPoi } from '@/lib/tripMapPois'

interface Props {
  pois: TripMapPoi[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/*
 * Carto Voyager is OSM-based (real geography) with a soft illustrated atlas
 * look. No API key, free-tier friendly. A light sepia filter matches the
 * cream trip-journal chrome. Stamen Watercolor needs a paid/keyed host.
 */
const CARTO_VOYAGER = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

const MapRoot = styled.div`
  height: 100%;
  width: 100%;
  min-height: 240px;

  .leaflet-container {
    height: 100%;
    width: 100%;
    background: #e4d4b0;
    font-family: inherit;
  }

  .leaflet-tile-pane {
    filter: saturate(0.9) sepia(0.22) contrast(0.96);
  }

  .leaflet-control-attribution {
    font-size: 10px;
    background: rgba(251, 243, 223, 0.88);
    color: #6e5c42;
  }

  .leaflet-control-zoom a {
    background: #fffdf7;
    color: #2a2013;
    border-bottom-color: #eadcb5;
  }

  .trip-map-pin {
    background: none !important;
    border: none !important;
  }
`

function pinIcon(emoji: string, selected: boolean): L.DivIcon {
  const size = selected ? 44 : 36
  const ring = selected ? '#d67a1f' : '#fffdf7'
  return L.divIcon({
    className: 'trip-map-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 4],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:${selected ? 22 : 18}px;line-height:1;
      background:#fffdf7;border:3px solid ${ring};
      box-shadow:0 4px 12px rgba(42,32,19,0.28);
      transform:translateY(-2px);
    ">${emoji}</div>`,
  })
}

function FitPoiBounds({ pois, selectedId }: { pois: TripMapPoi[]; selectedId: string | null }) {
  const map = useMap()

  useEffect(() => {
    map.invalidateSize()
    if (pois.length === 0) return
    if (pois.length === 1) {
      map.setView([pois[0].coords.lat, pois[0].coords.lon], 11, { animate: false })
      return
    }
    const bounds = L.latLngBounds(pois.map(p => [p.coords.lat, p.coords.lon] as [number, number]))
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 10, animate: false })
  }, [map, pois])

  useEffect(() => {
    if (!selectedId) return
    const poi = pois.find(p => p.id === selectedId)
    if (!poi) return
    map.panTo([poi.coords.lat, poi.coords.lon], { animate: true })
  }, [map, selectedId, pois])

  return null
}

export default function IllustratedTripMap({ pois, selectedId, onSelect }: Props) {
  const center = useMemo<[number, number]>(() => {
    if (pois.length === 0) return [28.3852, -81.5639]
    return [pois[0].coords.lat, pois[0].coords.lon]
  }, [pois])

  return (
    <MapRoot dir="ltr">
      <MapContainer
        center={center}
        zoom={8}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
        attributionControl
      >
        <TileLayer url={CARTO_VOYAGER} attribution={CARTO_ATTR} />
        <FitPoiBounds pois={pois} selectedId={selectedId} />
        {pois.map(poi => (
          <Marker
            key={poi.id}
            position={[poi.coords.lat, poi.coords.lon]}
            icon={pinIcon(poi.emoji, poi.id === selectedId)}
            eventHandlers={{ click: () => onSelect(poi.id) }}
            zIndexOffset={poi.id === selectedId ? 1000 : 0}
          />
        ))}
      </MapContainer>
    </MapRoot>
  )
}
