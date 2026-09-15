import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Grid, EmptyState, Button, Stack, Typography } from 'myk-library'
import { ThemeProvider } from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { useAuth } from '@/lib/AuthContext'
import TripCard from '@/components/trip/TripCard'
import TripFormModal from '@/components/trip/TripFormModal'
import { AuthEntryCard } from '@/components/auth/AuthEntryScreen'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import { Plus, Upload, Users, LogIn } from 'lucide-react'
import { isFamilyCatalogEmail } from '@/lib/familyCatalog'
import styled from 'styled-components'
import { importTripFromFile } from '@/utils/export'
import { generateId } from '@/utils/id'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { warmTheme, warmDisplayFont, warmPageBackground } from '@/theme/warmTheme'

/*
 * Home is eager (it is the start_url), so anything it imports statically lands
 * in the entry bundle. CloudSyncButton pulls gmailSync → aiClient → supabase,
 * roughly 215kB that nothing on this screen needs in order to paint. Lazy, it
 * arrives a beat later in its own chunk, which is the right trade for a button
 * nobody taps in the first second.
 *
 * Family seed JSON must stay out of this graph — guests open this page
 * without signing in.
 */
const CloudSyncButton = lazy(() => import('@/components/cloud/CloudSyncButton'))

const PageBg = styled.div`
  min-height: 100vh;
  background: ${warmPageBackground};
`

/* Holds the button's footprint so the row doesn't reflow when it arrives. */
const CloudSyncSlot = styled.div`
  min-height: 44px;
`

const Header = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '16px 0 12px' : '32px 0 24px')};
  display: flex;
  align-items: ${({ $mobile }) => ($mobile ? 'stretch' : 'center')};
  justify-content: space-between;
  flex-direction: ${({ $mobile }) => ($mobile ? 'column' : 'row')};
  gap: ${({ $mobile }) => ($mobile ? '12px' : '0')};
`

const Title = styled.h1<{ $mobile: boolean }>`
  font-family: ${warmDisplayFont};
  font-weight: 500;
  font-size: ${({ $mobile }) => ($mobile ? '26px' : '34px')};
  margin: 0;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const ButtonRow = styled.div<{ $mobile: boolean }>`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  & > * {
    touch-action: manipulation;
    min-height: 44px; /* Apple HIG touch target */
  }
  ${({ $mobile }) => $mobile && `
    width: 100%;
    & > * { flex: 1 1 calc(50% - 4px); }
  `}
`

const GuestWall = styled.div`
  display: flex;
  justify-content: center;
  padding: 24px 0 40px;
`

export default function Home() {
  const navigate = useNavigate()
  const trips = useTripStore(s => s.trips)
  const { session, user, loading: authLoading, signInWithGoogle } = useAuth()
  const showAdminUsers = isFamilyCatalogEmail(user?.email)
  const [showCreate, setShowCreate] = useState(false)
  const { isMobile, isTablet } = useBreakpoint()
  const isGuest = !session && !authLoading

  const handleImport = async () => {
    try {
      const imported = await importTripFromFile()
      const now = new Date().toISOString()
      useTripStore.setState(state => ({
        trips: [...state.trips, { ...imported, id: generateId(), createdAt: now, updatedAt: now }],
      }))
    } catch {
      // user cancelled or bad file — ignore silently
    }
  }

  return (
    <ThemeProvider theme={warmTheme}>
    <PageBg className="warm-shell">
    <Container size="xl" style={{ padding: `0 ${isMobile ? '12px' : '24px'}` }}>
      <Header $mobile={isMobile}>
        <Stack direction="column" spacing="xs">
          <Title $mobile={isMobile}>✈️ הטיולים שלנו</Title>
          <Typography variant="body2" style={{ color: '#8F7B5C' }}>
            תכנן את הטיול המשפחתי הבא שלך
          </Typography>
          {session && (
            <Stack direction="row" spacing="xs" style={{ flexWrap: 'wrap' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/login-preview')}
                title="תצוגת מסך הכניסה"
              >
                <Stack direction="row" spacing="xs" align="center">
                  <LogIn size={14} />
                  <span>תצוגת מסך כניסה</span>
                </Stack>
              </Button>
              {showAdminUsers && (
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')} title="מי נרשם לאפליקציה">
                  <Stack direction="row" spacing="xs" align="center">
                    <Users size={14} />
                    <span>משתמשים רשומים</span>
                  </Stack>
                </Button>
              )}
            </Stack>
          )}
        </Stack>
        <ButtonRow $mobile={isMobile}>
          <Suspense fallback={<CloudSyncSlot />}>
            <CloudSyncButton />
          </Suspense>
          <Button variant="ghost" onClick={handleImport} title="ייבא טיול מ-JSON">
            <Stack direction="row" spacing="xs" align="center">
              <Upload size={16} />
              <span>ייבא</span>
            </Stack>
          </Button>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Stack direction="row" spacing="xs" align="center">
              <Plus size={16} />
              <span>טיול חדש</span>
            </Stack>
          </Button>
        </ButtonRow>
      </Header>

      {trips.length === 0 ? (
        isGuest ? (
          <GuestWall>
            <AuthEntryCard
              title="התחברו כדי לראות את הטיולים"
              subtitle="הטיולים המשפחתיים זמינים רק אחרי התחברות עם Google"
              footnote="כניסה עם חשבון Google. רק אימייל ופרופיל."
            >
              <GoogleSignInButton onClick={() => void signInWithGoogle()}>
                התחברות עם Google
              </GoogleSignInButton>
            </AuthEntryCard>
          </GuestWall>
        ) : (
          <Stack direction="column" spacing="md" align="center" style={{ padding: '32px 0' }}>
            <EmptyState
              title="אין טיולים עדיין"
              description="עדיין אין טיולים שמורים לחשבון הזה"
              actionText="צור טיול ראשון"
              onAction={() => setShowCreate(true)}
            />
          </Stack>
        )
      ) : (
        <Grid columns={isMobile ? 1 : isTablet ? 2 : 3} gap="md">
          {trips.map((trip, i) => (
            <TripCard key={trip.id} trip={trip} index={i} />
          ))}
        </Grid>
      )}

      <TripFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={id => navigate(`/trip/${id}/dashboard`)}
      />
    </Container>
    </PageBg>
    </ThemeProvider>
  )
}
