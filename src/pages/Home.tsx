import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Grid, EmptyState, Stack } from 'myk-library'
import { ThemeProvider } from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { useAuth } from '@/lib/AuthContext'
import TripCard from '@/components/trip/TripCard'
import TripFormModal from '@/components/trip/TripFormModal'
import { AuthEntryCard } from '@/components/auth/AuthEntryScreen'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import { Plus, Upload, Users } from 'lucide-react'
import { isFamilyCatalogEmail } from '@/lib/familyCatalog'
import styled from 'styled-components'
import { importTripFromFile } from '@/utils/export'
import { generateId } from '@/utils/id'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { warmTheme } from '@/theme/warmTheme'
import {
  HomeAdminLink,
  HomeCtaRow,
  HomeHairline,
  HomeHeaderCard,
  HomePageBg,
  HomePlaneMark,
  HomePrimaryButton,
  HomeSecondaryButton,
  HomeSubtitle,
  HomeSyncSlot,
  HomeTitle,
  HomeTitleRow,
} from '@/components/home/HomeChrome'

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

const GuestWall = styled.div`
  display: flex;
  justify-content: center;
  padding: 8px 0 40px;
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
    <HomePageBg className="warm-shell">
    <Container size="xl" style={{ padding: `0 ${isMobile ? '12px' : '24px'}` }}>
      <HomeHeaderCard>
        <HomeTitleRow>
          <HomePlaneMark />
          <div>
            <HomeTitle>הטיולים שלנו</HomeTitle>
            <HomeSubtitle>תכנן את הטיול המשפחתי הבא שלך</HomeSubtitle>
          </div>
        </HomeTitleRow>
        <HomeHairline />
        {showAdminUsers && (
          <HomeAdminLink
            type="button"
            onClick={() => navigate('/admin/users')}
            title="מי נרשם לאפליקציה"
          >
            <Users size={15} strokeWidth={2} />
            <span>משתמשים רשומים</span>
          </HomeAdminLink>
        )}
        <Suspense fallback={<HomeSyncSlot tall={!!session && isMobile} />}>
          <CloudSyncButton variant="home" />
        </Suspense>
        <HomeCtaRow>
          <HomePrimaryButton type="button" onClick={() => setShowCreate(true)}>
            <Plus size={18} strokeWidth={2} />
            <span>טיול חדש</span>
          </HomePrimaryButton>
          <HomeSecondaryButton type="button" onClick={handleImport} title="ייבא טיול מ-JSON">
            <Upload size={16} strokeWidth={2} />
            <span>ייבא</span>
          </HomeSecondaryButton>
        </HomeCtaRow>
      </HomeHeaderCard>

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
    </HomePageBg>
    </ThemeProvider>
  )
}
