import { useState } from 'react'
import { Modal, Button, Input, Select, Stack, Switch } from 'myk-library'
import { useTripStore } from '@/stores/tripStore'
import { formatDateISO } from '@/utils/date'
import { CURRENCY_OPTIONS } from '@/utils/currency'
import type { Flight, CabinClass } from '@/types/accommodation'

const CABIN_OPTIONS = [
  { value: 'economy', label: 'תיירות' },
  { value: 'business', label: 'עסקים' },
  { value: 'first', label: 'ראשונה' },
]

const DIRECTION_OPTIONS = [
  { value: 'outbound', label: '🛫 יציאה' },
  { value: 'return', label: '🛬 חזרה' },
]

interface Props {
  open: boolean
  onClose: () => void
  tripId: string
  editFlight?: Flight
}

export default function FlightFormModal({ open, onClose, tripId, editFlight }: Props) {
  const addFlight = useTripStore(s => s.addFlight)
  const updateFlight = useTripStore(s => s.updateFlight)

  const today = formatDateISO(new Date())
  const [airline, setAirline] = useState(editFlight?.airline ?? '')
  const [flightNumber, setFlightNumber] = useState(editFlight?.flightNumber ?? '')
  const [departureAirport, setDepartureAirport] = useState(editFlight?.departureAirport ?? 'TLV')
  const [arrivalAirport, setArrivalAirport] = useState(editFlight?.arrivalAirport ?? '')
  const [departureTime, setDepartureTime] = useState(editFlight?.departureTime ?? `${today}T08:00`)
  const [arrivalTime, setArrivalTime] = useState(editFlight?.arrivalTime ?? `${today}T12:00`)
  const [cost, setCostStr] = useState(String(editFlight?.cost ?? 0))
  const [currency, setCurrency] = useState(editFlight?.currency ?? 'ILS')
  const [direction, setDirection] = useState<'outbound' | 'return'>(editFlight?.direction ?? 'outbound')
  const [cabinClass, setCabinClass] = useState<CabinClass>(editFlight?.cabinClass ?? 'economy')
  const [confirmationNumber, setConfirmationNumber] = useState(editFlight?.confirmationNumber ?? '')
  const [baggageIncluded, setBaggageIncluded] = useState(editFlight?.baggageIncluded ?? false)
  const [ticketUrl, setTicketUrl] = useState(editFlight?.ticketUrl ?? '')

  const handleSave = () => {
    if (!airline.trim() || !flightNumber.trim()) return
    const data = {
      airline, flightNumber, departureAirport, arrivalAirport,
      departureTime, arrivalTime, cost: Number(cost), currency,
      direction, cabinClass, confirmationNumber: confirmationNumber || undefined, baggageIncluded,
      ticketUrl: ticketUrl.trim() || undefined,
    }
    if (editFlight) {
      updateFlight(tripId, editFlight.id, data)
    } else {
      addFlight(tripId, data)
    }
    onClose()
  }

  return (
    <Modal isOpen={open} onClose={onClose} size="lg" title={editFlight ? 'עריכת טיסה' : 'הוספת טיסה'}>
      <Stack direction="column" spacing="md">
        <Stack direction="row" spacing="md">
          <Select label="כיוון" value={direction} onChange={e => setDirection(e.target.value as 'outbound' | 'return')} style={{ flex: 1 }}>
            {DIRECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select label="מחלקה" value={cabinClass} onChange={e => setCabinClass(e.target.value as CabinClass)} style={{ flex: 1 }}>
            {CABIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Stack>
        <Stack direction="row" spacing="md">
          <Input label="חברת תעופה" value={airline} onChange={e => setAirline(e.target.value)} placeholder="El Al" style={{ flex: 1 }} />
          <Input label="מספר טיסה" value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="LY 001" style={{ flex: 1 }} />
        </Stack>
        <Stack direction="row" spacing="md">
          <Input label="שדה יציאה (IATA)" value={departureAirport} onChange={e => setDepartureAirport(e.target.value.toUpperCase())} placeholder="TLV" style={{ flex: 1 }} />
          <Input label="שדה הגעה (IATA)" value={arrivalAirport} onChange={e => setArrivalAirport(e.target.value.toUpperCase())} placeholder="FCO" style={{ flex: 1 }} />
        </Stack>
        <Stack direction="row" spacing="md">
          <Input type="datetime-local" label="יציאה" value={departureTime} onChange={e => setDepartureTime(e.target.value)} style={{ flex: 1 }} />
          <Input type="datetime-local" label="הגעה" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} style={{ flex: 1 }} />
        </Stack>
        <Stack direction="row" spacing="md">
          <Input label="עלות" value={cost} onChange={e => setCostStr(e.target.value)} type="number" min="0" style={{ flex: 1 }} />
          <Select label="מטבע" value={currency} onChange={e => setCurrency(e.target.value)} style={{ flex: 1 }}>
            {CURRENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Stack>
        <Input label="מספר אישור" value={confirmationNumber} onChange={e => setConfirmationNumber(e.target.value)} placeholder="ABC123" />
        <Input
          label="לינק לכרטיס / ניהול הזמנה"
          value={ticketUrl}
          onChange={e => setTicketUrl(e.target.value)}
          placeholder="https://..."
          type="url"
        />
        <Switch label="כבודה כלולה" checked={baggageIncluded} onChange={checked => setBaggageIncluded(checked)} />
        <Stack direction="row" justify="end" spacing="sm">
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button variant="primary" onClick={handleSave} disabled={!airline.trim() || !flightNumber.trim()}>שמור</Button>
        </Stack>
      </Stack>
    </Modal>
  )
}
