import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Badge, Button, Container, EmptyState, Spinner, Stack, Typography } from 'myk-library'
import { ThemeProvider } from 'styled-components'
import styled from 'styled-components'
import { Home, ShieldAlert, Users } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import {
  adminRosterFailureStatus,
  canViewAdminUsers,
  fetchAdminRegisteredUsers,
  type AdminPendingInvite,
  type AdminRegisteredUser,
  type AdminRoster,
  type AdminUserTripRole,
} from '@/lib/adminUsers'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { warmTheme, warmDisplayFont, warmPageBackground } from '@/theme/warmTheme'
import { format, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'

const PageBg = styled.div`
  min-height: 100vh;
  background: ${warmPageBackground};
`

const Title = styled.h1<{ $mobile: boolean }>`
  font-family: ${warmDisplayFont};
  font-weight: 500;
  font-size: ${({ $mobile }) => ($mobile ? '26px' : '32px')};
  margin: 0;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 16px;
  padding: 16px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`

const Email = styled.div`
  direction: ltr;
  text-align: left;
  font-weight: 600;
  font-size: 15px;
  word-break: break-all;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const Meta = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.gray[500]};
`

const DeniedCard = styled(Card)`
  max-width: 420px;
  margin: 48px auto 0;
  text-align: center;
`

function formatWhen(iso: string): string {
  if (!iso) return ''
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm', { locale: he })
  } catch {
    return iso
  }
}

function roleLabel(role: AdminUserTripRole): string {
  return role === 'owner' ? 'יוצר' : 'חבר'
}

function UserCard({ user }: { user: AdminRegisteredUser }) {
  return (
    <Card>
      <Stack direction="column" spacing="sm">
        <Email>{user.email}</Email>
        <Meta>נרשם {formatWhen(user.registered_at) || '—'}</Meta>
        {user.trips.length === 0 ? (
          <Typography variant="body2" style={{ color: '#8F7B5C', margin: 0 }}>
            לא חבר בשום טיול עדיין
          </Typography>
        ) : (
          <Stack direction="row" spacing="xs" style={{ flexWrap: 'wrap' }}>
            {user.trips.map(trip => (
              <Badge
                key={`${user.user_id}-${trip.trip_id}`}
                size="sm"
                variant={trip.role === 'owner' ? 'info' : 'default'}
              >
                {trip.trip_name} · {roleLabel(trip.role)}
              </Badge>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}

function PendingRow({ invite }: { invite: AdminPendingInvite }) {
  return (
    <Card>
      <Stack direction="column" spacing="xs">
        <Email>{invite.email}</Email>
        <Stack direction="row" spacing="xs" style={{ flexWrap: 'wrap' }}>
          <Badge size="sm">{invite.trip_name}</Badge>
          <Badge size="sm" variant="warning">
            {roleLabel(invite.role)} · ממתין
          </Badge>
        </Stack>
        <Meta>הוזמן {formatWhen(invite.invited_at) || '—'}</Meta>
      </Stack>
    </Card>
  )
}

export default function AdminUsers() {
  const navigate = useNavigate()
  const { user, session, loading: authLoading } = useAuth()
  const { isMobile } = useBreakpoint()
  const allowed = canViewAdminUsers(user?.email)
  const [roster, setRoster] = useState<AdminRoster | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (authLoading || !session || !allowed) return
    let cancelled = false
    setStatus('loading')
    setErrorText('')
    void fetchAdminRegisteredUsers()
      .then(next => {
        if (cancelled) return
        setRoster(next)
        setStatus('idle')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setRoster(null)
        setStatus('error')
        setErrorText(adminRosterFailureStatus(e))
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, session, allowed])

  if (authLoading) {
    return (
      <ThemeProvider theme={warmTheme}>
        <PageBg className="warm-shell">
          <Container size="md" style={{ padding: '48px 16px', textAlign: 'center' }}>
            <Spinner />
          </Container>
        </PageBg>
      </ThemeProvider>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  const header = (
    <Stack direction="row" align="center" justify="between" spacing="sm" style={{ flexWrap: 'wrap' }}>
      <Stack direction="column" spacing="xs">
        <Title $mobile={isMobile}>משתמשים רשומים</Title>
        <Typography variant="body2" style={{ color: '#8F7B5C', margin: 0 }}>
          מי שנכנס לאפליקציה, ואיזה טיולים יש לו
        </Typography>
      </Stack>
      <Button variant="ghost" onClick={() => navigate('/')}>
        <Stack direction="row" spacing="xs" align="center">
          <Home size={16} />
          <span>חזרה</span>
        </Stack>
      </Button>
    </Stack>
  )

  if (!allowed) {
    return (
      <ThemeProvider theme={warmTheme}>
        <PageBg className="warm-shell">
          <Container size="md" style={{ padding: `${isMobile ? '16px' : '32px'} ${isMobile ? '12px' : '24px'}` }} dir="rtl">
            {header}
            <DeniedCard>
              <Stack direction="column" spacing="md" align="center">
                <ShieldAlert size={32} color="#B5630F" />
                <Typography variant="h5" style={{ margin: 0 }}>אין גישה</Typography>
                <Typography variant="body2" style={{ color: '#8F7B5C', margin: 0 }}>
                  המסך הזה רק לבן ולגל — לא מוצג למשתמשים שהוזמנו לטיול בודד.
                </Typography>
                <Button variant="primary" onClick={() => navigate('/')}>
                  חזרה לטיולים
                </Button>
              </Stack>
            </DeniedCard>
          </Container>
        </PageBg>
      </ThemeProvider>
    )
  }

  const users = roster?.users ?? []
  const pending = roster?.pendingInvites ?? []

  return (
    <ThemeProvider theme={warmTheme}>
      <PageBg className="warm-shell">
        <Container size="md" style={{ padding: `${isMobile ? '16px' : '32px'} ${isMobile ? '12px' : '24px'} 48px` }} dir="rtl">
          <Stack direction="column" spacing="lg">
            <Stack direction="row" align="center" spacing="sm">
              <Users size={22} style={{ marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
            </Stack>

            {status === 'loading' && (
              <Stack direction="column" spacing="sm" align="center" style={{ padding: '32px 0' }}>
                <Spinner />
                <Typography variant="body2" style={{ color: '#8F7B5C' }}>טוען את הרשימה…</Typography>
              </Stack>
            )}

            {status === 'error' && (
              <EmptyState
                title="לא הצלחתי לטעון את המשתמשים"
                description={errorText || 'שגיאה לא ידועה'}
                actionText="נסו שוב"
                onAction={() => {
                  setStatus('loading')
                  setErrorText('')
                  void fetchAdminRegisteredUsers()
                    .then(next => {
                      setRoster(next)
                      setStatus('idle')
                    })
                    .catch((e: unknown) => {
                      setRoster(null)
                      setStatus('error')
                      setErrorText(adminRosterFailureStatus(e))
                    })
                }}
              />
            )}

            {status === 'idle' && roster && users.length === 0 && pending.length === 0 && (
              <EmptyState
                title="אין משתמשים רשומים עדיין"
                description="ברגע שמישהו ייכנס עם Google, הוא יופיע כאן"
              />
            )}

            {status === 'idle' && users.length > 0 && (
              <Stack direction="column" spacing="sm">
                <Typography variant="h6" style={{ margin: 0 }}>
                  {users.length === 1 ? 'משתמש אחד' : `${users.length} משתמשים`}
                </Typography>
                {users.map(u => (
                  <UserCard key={u.user_id} user={u} />
                ))}
              </Stack>
            )}

            {status === 'idle' && pending.length > 0 && (
              <Stack direction="column" spacing="sm">
                <Typography variant="h6" style={{ margin: 0 }}>
                  הזמנות ממתינות
                </Typography>
                <Typography variant="body2" style={{ color: '#8F7B5C', margin: 0 }}>
                  אימייל שהוזמן לטיול ועדיין לא נכנס לאפליקציה
                </Typography>
                {pending.map(invite => (
                  <PendingRow
                    key={`${invite.email}-${invite.trip_id}-${invite.invited_at}`}
                    invite={invite}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        </Container>
      </PageBg>
    </ThemeProvider>
  )
}
