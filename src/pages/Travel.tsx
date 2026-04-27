import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Tabs, Stack, Card, Badge, ActionIcon, Button, EmptyState, Typography, Chip } from 'myk-library'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import type { TabItem } from 'myk-library'
import { useTripStore } from '@/stores/tripStore'
import { formatCurrency } from '@/utils/currency'
import FlightFormModal from '@/components/travel/FlightFormModal'
import AccommodationFormModal from '@/components/travel/AccommodationFormModal'
import CarRentalFormModal from '@/components/travel/CarRentalFormModal'
import GmailSyncModal from '@/components/gmail/GmailSyncModal'
import type { Flight, Accommodation, CarRental, CarCategory } from '@/types/accommodation'
import { Plus, Pencil, Trash2, Plane, Hotel, Car, Mail, Navigation, Ticket } from 'lucide-react'
import styled from 'styled-components'
import { parseISO, format } from 'date-fns'
import { he } from 'date-fns/locale'
import { wazeUrl } from '@/utils/maps'

const PageWrapper = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '12px' : '24px')};
`

const formatDT = (dt: string) => {
  try { return format(parseISO(dt), 'd MMM HH:mm', { locale: he }) } catch { return dt }
}

const formatDateOnly = (d: string) => {
  try { return format(parseISO(d), 'd MMM yyyy', { locale: he }) } catch { return d }
}

const CABIN_LABEL: Record<string, string> = { economy: 'תיירות', business: 'עסקים', first: 'ראשונה' }
const TYPE_LABEL: Record<string, string> = { hotel: '🏨 מלון', airbnb: '🏠 Airbnb', hostel: '🛏️ הוסטל', villa: '🏡 וילה', other: '🏢 אחר' }
const CAR_CATEGORY_LABEL: Record<CarCategory, string> = {
  economy: '🚗 קטנה', compact: '🚗 קומפקט', midsize: '🚙 בינונית',
  'full-size': '🚙 גדולה', suv: '🚐 SUV', van: '🚌 ואן', luxury: '🏎️ יוקרה',
}

export default function Travel() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const removeFlight = useTripStore(s => s.removeFlight)
  const removeAccommodation = useTripStore(s => s.removeAccommodation)
  const removeCarRental = useTripStore(s => s.removeCarRental)

  const [showAddFlight, setShowAddFlight] = useState(false)
  const [editFlight, setEditFlight] = useState<Flight | undefined>()
  const [showAddAcc, setShowAddAcc] = useState(false)
  const [editAcc, setEditAcc] = useState<Accommodation | undefined>()
  const [showAddCar, setShowAddCar] = useState(false)
  const [editCar, setEditCar] = useState<CarRental | undefined>()
  const [showGmail, setShowGmail] = useState(false)

  const { isMobile } = useBreakpoint()

  if (!trip) return null

  const outbound = trip.flights.filter(f => f.direction === 'outbound')
  const returnFlights = trip.flights.filter(f => f.direction === 'return')

  const tabs: TabItem[] = [
    {
      key: 'flights',
      label: 'טיסות',
      children: (
        <Stack direction="column" spacing="md" style={{ paddingTop: 16 }}>
          <Stack direction="row" justify="between" align="center">
            <Typography variant="h6" style={{ margin: 0 }}>✈️ טיסות ({trip.flights.length})</Typography>
            <Button size="sm" variant="primary" onClick={() => setShowAddFlight(true)}>
              <Stack direction="row" spacing="xs" align="center">
                <Plus size={14} /><span>הוסף טיסה</span>
              </Stack>
            </Button>
          </Stack>

          {trip.flights.length === 0 ? (
            <EmptyState title="אין טיסות" description="הוסף טיסות לטיול שלך" />
          ) : (
            <>
              {outbound.length > 0 && (
                <Stack direction="column" spacing="sm">
                  <Typography variant="body2" style={{ fontWeight: 600 }}>🛫 טיסות יציאה</Typography>
                  {outbound.map(f => <FlightCard key={f.id} flight={f} tripId={trip.id} onEdit={setEditFlight} onDelete={removeFlight} isMobile={isMobile} />)}
                </Stack>
              )}
              {returnFlights.length > 0 && (
                <Stack direction="column" spacing="sm">
                  <Typography variant="body2" style={{ fontWeight: 600 }}>🛬 טיסות חזרה</Typography>
                  {returnFlights.map(f => <FlightCard key={f.id} flight={f} tripId={trip.id} onEdit={setEditFlight} onDelete={removeFlight} isMobile={isMobile} />)}
                </Stack>
              )}
            </>
          )}
        </Stack>
      ),
    },
    {
      key: 'car-rental',
      label: 'רכב',
      children: (
        <Stack direction="column" spacing="md" style={{ paddingTop: 16 }}>
          <Stack direction="row" justify="between" align="center">
            <Typography variant="h6" style={{ margin: 0 }}>🚗 השכרות רכב ({(trip.carRentals ?? []).length})</Typography>
            <Button size="sm" variant="primary" onClick={() => setShowAddCar(true)}>
              <Stack direction="row" spacing="xs" align="center">
                <Plus size={14} /><span>הוסף רכב</span>
              </Stack>
            </Button>
          </Stack>

          {(trip.carRentals ?? []).length === 0 ? (
            <EmptyState title="אין השכרות רכב" description="הוסף פרטי השכרת רכב לטיול שלך" />
          ) : (
            <Stack direction="column" spacing="md">
              {(trip.carRentals ?? []).map(rental => (
                <CarRentalCard key={rental.id} rental={rental} tripId={trip.id} onEdit={setEditCar} onDelete={removeCarRental} isMobile={isMobile} />
              ))}
            </Stack>
          )}
        </Stack>
      ),
    },
    {
      key: 'accommodation',
      label: 'לינה',
      children: (
        <Stack direction="column" spacing="md" style={{ paddingTop: 16 }}>
          <Stack direction="row" justify="between" align="center">
            <Typography variant="h6" style={{ margin: 0 }}>🏨 לינה ({trip.accommodations.length})</Typography>
            <Button size="sm" variant="primary" onClick={() => setShowAddAcc(true)}>
              <Stack direction="row" spacing="xs" align="center">
                <Plus size={14} /><span>הוסף לינה</span>
              </Stack>
            </Button>
          </Stack>

          {trip.accommodations.length === 0 ? (
            <EmptyState title="אין לינות" description="הוסף פרטי לינה לטיול שלך" />
          ) : (
            <Stack direction="column" spacing="md">
              {trip.accommodations.map(acc => (
                <AccCard key={acc.id} acc={acc} tripId={trip.id} onEdit={setEditAcc} onDelete={removeAccommodation} isMobile={isMobile} />
              ))}
            </Stack>
          )}
        </Stack>
      ),
    },
  ]

  return (
    <PageWrapper $mobile={isMobile}>
      <Stack direction="row" justify="end" style={{ marginBottom: 8 }}>
        <Button size="sm" variant="ghost" onClick={() => setShowGmail(true)}>
          <Stack direction="row" spacing="xs" align="center">
            <Mail size={14} /><span>סנכרן מ-Gmail</span>
          </Stack>
        </Button>
      </Stack>
      <Tabs items={tabs} variant="enclosed" />

      <FlightFormModal open={showAddFlight} onClose={() => setShowAddFlight(false)} tripId={trip.id} />
      {editFlight && (
        <FlightFormModal open={!!editFlight} onClose={() => setEditFlight(undefined)} tripId={trip.id} editFlight={editFlight} />
      )}
      <AccommodationFormModal open={showAddAcc} onClose={() => setShowAddAcc(false)} tripId={trip.id} />
      {editAcc && (
        <AccommodationFormModal open={!!editAcc} onClose={() => setEditAcc(undefined)} tripId={trip.id} editAcc={editAcc} />
      )}
      <CarRentalFormModal open={showAddCar} onClose={() => setShowAddCar(false)} tripId={trip.id} />
      {editCar && (
        <CarRentalFormModal open={!!editCar} onClose={() => setEditCar(undefined)} tripId={trip.id} editRental={editCar} />
      )}
      <GmailSyncModal open={showGmail} onClose={() => setShowGmail(false)} tripId={trip.id} />
    </PageWrapper>
  )
}

function FlightCard({ flight, tripId, onEdit, onDelete, isMobile }: { flight: Flight; tripId: string; onEdit: (f: Flight) => void; onDelete: (tid: string, fid: string) => void; isMobile: boolean }) {
  return (
    <Card variant="outlined" padding="md">
      <Stack direction={isMobile ? 'column' : 'row'} justify="between" align="start" spacing={isMobile ? 'sm' : undefined}>
        <Stack direction="column" spacing="xs">
          <Stack direction="row" spacing="sm" align="center">
            <Plane size={16} />
            <Typography variant="body1" style={{ fontWeight: 600 }}>{flight.airline} {flight.flightNumber}</Typography>
            <Badge size="sm" variant="info">{CABIN_LABEL[flight.cabinClass]}</Badge>
          </Stack>
          <Stack direction="row" spacing="md">
            <Typography variant="h6" style={{ margin: 0 }}>{flight.departureAirport}</Typography>
            <span style={{ color: '#6b7280' }}>→</span>
            <Typography variant="h6" style={{ margin: 0 }}>{flight.arrivalAirport}</Typography>
          </Stack>
          <Typography variant="body2" style={{ color: '#6b7280' }}>
            {formatDT(flight.departureTime)} – {formatDT(flight.arrivalTime)}
          </Typography>
          <Stack direction="row" spacing="sm">
            {flight.baggageIncluded && <Chip size="sm" variant="success">כבודה כלולה</Chip>}
            {flight.confirmationNumber && <Chip size="sm">{flight.confirmationNumber}</Chip>}
          </Stack>
          {flight.ticketUrl && (
            <a
              href={flight.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2563eb', fontSize: 14, textDecoration: 'none' }}
            >
              <Ticket size={14} />
              <span>פתח כרטיס טיסה</span>
            </a>
          )}
        </Stack>
        <Stack direction={isMobile ? 'row' : 'column'} align={isMobile ? 'center' : 'end'} justify={isMobile ? 'between' : undefined} spacing="xs" style={isMobile ? { width: '100%' } : undefined}>
          <Typography variant="h6" style={{ margin: 0, color: '#059669' }}>
            {formatCurrency(flight.cost, flight.currency)}
          </Typography>
          <Stack direction="row" spacing="xs">
            <ActionIcon size="sm" variant="subtle" onClick={() => onEdit(flight)}><Pencil size={12} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" onClick={() => onDelete(tripId, flight.id)}><Trash2 size={12} /></ActionIcon>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  )
}

function WazeLink({ address }: { address: string }) {
  return (
    <a
      href={wazeUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', fontSize: 13, textDecoration: 'none' }}
      aria-label={`נווט ל-${address} ב-Waze`}
    >
      <Navigation size={13} />
      <span>Waze</span>
    </a>
  )
}

function CarRentalCard({ rental, tripId, onEdit, onDelete, isMobile }: { rental: CarRental; tripId: string; onEdit: (r: CarRental) => void; onDelete: (tid: string, rid: string) => void; isMobile: boolean }) {
  return (
    <Card variant="outlined" padding="md">
      <Stack direction={isMobile ? 'column' : 'row'} justify="between" align="start" spacing={isMobile ? 'sm' : undefined}>
        <Stack direction="column" spacing="xs">
          <Stack direction="row" spacing="sm" align="center">
            <Car size={16} />
            <Typography variant="body1" style={{ fontWeight: 600 }}>{rental.company}</Typography>
            <Badge size="sm" variant="info">{CAR_CATEGORY_LABEL[rental.carCategory]}</Badge>
          </Stack>
          {rental.carModel && <Typography variant="body2" style={{ color: '#6b7280' }}>🚗 {rental.carModel}</Typography>}
          <Stack direction="row" spacing="xs" align="center" style={{ flexWrap: 'wrap' }}>
            <Typography variant="body2">
              📍 {rental.pickupLocation}
              {rental.dropoffLocation && rental.dropoffLocation !== rental.pickupLocation && ` → ${rental.dropoffLocation}`}
            </Typography>
            {rental.pickupLocation && <WazeLink address={rental.pickupLocation} />}
            {rental.dropoffLocation && rental.dropoffLocation !== rental.pickupLocation && (
              <WazeLink address={rental.dropoffLocation} />
            )}
          </Stack>
          <Typography variant="body2" style={{ color: '#6b7280' }}>
            {formatDateOnly(rental.pickupDate)} – {formatDateOnly(rental.dropoffDate)}
          </Typography>
          <Stack direction="row" spacing="sm">
            {rental.includesInsurance && <Chip size="sm" variant="success">ביטוח כלול</Chip>}
            {rental.driverName && <Chip size="sm">👤 {rental.driverName}</Chip>}
            {rental.confirmationNumber && <Chip size="sm">{rental.confirmationNumber}</Chip>}
          </Stack>
        </Stack>
        <Stack direction={isMobile ? 'row' : 'column'} align={isMobile ? 'center' : 'end'} justify={isMobile ? 'between' : undefined} spacing="xs" style={isMobile ? { width: '100%' } : undefined}>
          <Typography variant="h6" style={{ margin: 0, color: '#059669' }}>
            {formatCurrency(rental.cost, rental.currency)}
          </Typography>
          <Stack direction="row" spacing="xs">
            <ActionIcon size="sm" variant="subtle" onClick={() => onEdit(rental)}><Pencil size={12} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" onClick={() => onDelete(tripId, rental.id)}><Trash2 size={12} /></ActionIcon>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  )
}

function AccCard({ acc, tripId, onEdit, onDelete, isMobile }: { acc: Accommodation; tripId: string; onEdit: (a: Accommodation) => void; onDelete: (tid: string, aid: string) => void; isMobile: boolean }) {
  return (
    <Card variant="elevated" padding="md">
      <Stack direction={isMobile ? 'column' : 'row'} justify="between" align="start" spacing={isMobile ? 'sm' : undefined}>
        <Stack direction="column" spacing="xs">
          <Stack direction="row" spacing="sm" align="center">
            <Hotel size={16} />
            <Typography variant="body1" style={{ fontWeight: 600 }}>{acc.name}</Typography>
            <Badge size="sm">{TYPE_LABEL[acc.type]}</Badge>
          </Stack>
          {acc.address && (
            <Stack direction="row" spacing="xs" align="center" style={{ flexWrap: 'wrap' }}>
              <Typography variant="body2" style={{ color: '#6b7280' }}>📍 {acc.address}</Typography>
              <WazeLink address={acc.address} />
            </Stack>
          )}
          <Typography variant="body2">
            ✅ {formatDateOnly(acc.checkIn)} – 🏁 {formatDateOnly(acc.checkOut)}
          </Typography>
          {acc.rating && <span>{'⭐'.repeat(acc.rating)}</span>}
          {acc.confirmationNumber && <Chip size="sm">{acc.confirmationNumber}</Chip>}
        </Stack>
        <Stack direction={isMobile ? 'row' : 'column'} align={isMobile ? 'center' : 'end'} justify={isMobile ? 'between' : undefined} spacing="xs" style={isMobile ? { width: '100%' } : undefined}>
          <Typography variant="h6" style={{ margin: 0, color: '#059669' }}>
            {formatCurrency(acc.cost, acc.currency)}
          </Typography>
          <Stack direction="row" spacing="xs">
            <ActionIcon size="sm" variant="subtle" onClick={() => onEdit(acc)}><Pencil size={12} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" onClick={() => onDelete(tripId, acc.id)}><Trash2 size={12} /></ActionIcon>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  )
}
