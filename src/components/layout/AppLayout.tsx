import { Suspense, useEffect, useState } from 'react'
import { Outlet, useParams, Navigate, useLocation, useNavigate } from 'react-router-dom'
import CloudSyncButton from '@/components/cloud/CloudSyncButton'
import RouteFallback from '@/components/layout/RouteFallback'
import PageErrorBoundary from '@/components/layout/PageErrorBoundary'
import {
  AppShell, Navbar, Sidebar, Drawer,
  SidebarContent, SidebarNavItem, SidebarSection, SidebarSectionTitle,
  Stack, Badge, Typography, ActionIcon,
} from 'myk-library'
import { useTripStore } from '@/stores/tripStore'
import styled, { ThemeProvider } from 'styled-components'
import { Map, Wallet, Plane, Home, ListTodo, Users, Menu, LayoutDashboard, Backpack, FileText, CalendarRange } from 'lucide-react'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { warmTheme } from '@/theme/warmTheme'

/*
 * AppShell is height:100vh + overflow:hidden and its <main> is flex:1 with
 * min-width:auto. On iOS that 100vh is taller than the visual viewport, and
 * a wide min-content child is clipped to cream by html's overflow-x:hidden.
 * Cap to dvh and let main shrink.
 */
const ShellFrame = styled.div`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;

  & > div {
    height: 100% !important;
    max-width: 100%;
    min-width: 0;
  }

  main {
    min-width: 0;
    max-width: 100%;
  }
`

const TripTitle = styled.div`
  font-weight: 600;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.gray[900]};
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;

  span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const NavIcon = styled.span`
  display: flex;
  align-items: center;
  flex-shrink: 0;
`

const NavLabel = styled.span<{ $collapsed: boolean }>`
  ${({ $collapsed }) => $collapsed && 'display: none;'}
`

const FamilyRow = styled.div<{ $collapsed: boolean }>`
  padding: 4px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  ${({ $collapsed }) => $collapsed && 'justify-content: center; padding: 4px;'}
`

const DrawerNav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
`

const NavItems = [
  { label: 'דשבורד', path: 'dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'לוח זמנים', path: 'itinerary', icon: <CalendarRange size={18} /> },
  { label: 'מפה מצוירת', path: 'map', icon: <Map size={18} /> },
  { label: 'ציוד', path: 'packing', icon: <Backpack size={18} /> },
  { label: 'משפחה', path: 'family', icon: <Users size={18} /> },
  { label: 'משימות', path: 'tasks', icon: <ListTodo size={18} /> },
  { label: 'תקציב', path: 'budget', icon: <Wallet size={18} /> },
  { label: 'טיסות, לינה ורכב', path: 'travel', icon: <Plane size={18} /> },
  { label: 'מסמכים', path: 'doc', icon: <FileText size={18} /> },
]

export default function AppLayout() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const trips = useTripStore(s => s.trips)
  const activeTripId = useTripStore(s => s.activeTripId)
  const setActiveTrip = useTripStore(s => s.setActiveTrip)
  const [collapsed, setCollapsed] = useState(false)
  // Open only for the current path — a route change closes it without an effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null)
  const drawerOpen = drawerPath === location.pathname
  const { isTablet } = useBreakpoint()

  const trip = trips.find(t => t.id === id)

  useEffect(() => {
    if (id && activeTripId !== id) {
      setActiveTrip(id)
    }
  }, [id, activeTripId, setActiveTrip])

  if (!trip) return <Navigate to="/" replace />

  const currentPath = location.pathname.split('/').pop()

  const sidebarContent = (
    <SidebarContent>
      <SidebarSection $collapsed={false}>
        <SidebarSectionTitle $collapsed={false}>ניווט</SidebarSectionTitle>
        {NavItems.map(item => (
          <SidebarNavItem
            key={item.path}
            $active={currentPath === item.path}
            $collapsed={false}
            onClick={() => navigate(`/trip/${id}/${item.path}`)}
            title={item.label}
          >
            <NavIcon>{item.icon}</NavIcon>
            <NavLabel $collapsed={false}>{item.label}</NavLabel>
          </SidebarNavItem>
        ))}
      </SidebarSection>

      {trip.family.length > 0 && (
        <SidebarSection $collapsed={false}>
          <SidebarSectionTitle $collapsed={false}>משפחה</SidebarSectionTitle>
          <FamilyRow $collapsed={false}>
            {trip.family.map(m => (
              <Typography key={m.id} variant="body1" title={m.name} style={{ fontSize: 22, cursor: 'default' }}>
                {m.emoji}
              </Typography>
            ))}
          </FamilyRow>
        </SidebarSection>
      )}
    </SidebarContent>
  )

  const shellTree = (
    <>
      <AppShell
        fixedNavbar
        navbarHeight={60}
        sidebarWidth={isTablet ? 0 : collapsed ? 60 : 220}
        navbar={
          <Navbar height="sm">
            <Stack direction="row" align="center" spacing="md" style={{ padding: '0 16px', height: '100%' }}>
              {isTablet && (
                <ActionIcon
                  onClick={() => setDrawerPath(location.pathname)}
                  title="תפריט"
                  aria-label="פתח תפריט"
                  variant="subtle"
                  size="sm"
                >
                  <Menu size={20} />
                </ActionIcon>
              )}
              <ActionIcon
                onClick={() => navigate('/')}
                title="חזרה לרשימת טיולים"
                aria-label="חזרה לרשימת טיולים"
                variant="subtle"
                size="sm"
              >
                <Home size={18} />
              </ActionIcon>
              <TripTitle>
                <span>{trip.coverEmoji}</span>
                <span>{trip.name}</span>
              </TripTitle>
              <Badge variant="info" size="sm">{trip.destination}</Badge>
              <Stack direction="row" spacing="xs" align="center" style={{ marginInlineStart: 'auto' }}>
                <CloudSyncButton />
              </Stack>
            </Stack>
          </Navbar>
        }
        sidebar={
          !isTablet ? (
            <Sidebar
              position="right"
              collapsible
              collapsedWidth={60}
              withBorder
              collapsed={collapsed}
              onCollapse={setCollapsed}
            >
              <SidebarContent>
                <SidebarSection $collapsed={collapsed}>
                  <SidebarSectionTitle $collapsed={collapsed}>ניווט</SidebarSectionTitle>
                  {NavItems.map(item => (
                    <SidebarNavItem
                      key={item.path}
                      $active={currentPath === item.path}
                      $collapsed={collapsed}
                      onClick={() => navigate(`/trip/${id}/${item.path}`)}
                      title={item.label}
                    >
                      <NavIcon>{item.icon}</NavIcon>
                      <NavLabel $collapsed={collapsed}>{item.label}</NavLabel>
                    </SidebarNavItem>
                  ))}
                </SidebarSection>

                {trip.family.length > 0 && (
                  <SidebarSection $collapsed={collapsed}>
                    <SidebarSectionTitle $collapsed={collapsed}>משפחה</SidebarSectionTitle>
                    <FamilyRow $collapsed={collapsed}>
                      {trip.family.map(m => (
                        <Typography key={m.id} variant="body1" title={m.name} style={{ fontSize: 22, cursor: 'default' }}>
                          {m.emoji}
                        </Typography>
                      ))}
                    </FamilyRow>
                  </SidebarSection>
                )}
              </SidebarContent>
            </Sidebar>
          ) : undefined
        }
      >
        {/* Nested Suspense: keep the navbar painted while the itinerary
            chunk loads. A single App-level boundary unmounts AppShell, so a
            slow/hung first paint of לוח זמנים is a cream blank with no chrome.
            min-width:0 lets the day list shrink inside flex main. */}
        <div style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}>
          <PageErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </PageErrorBoundary>
        </div>
      </AppShell>

      {isTablet && (
        <Drawer
          isOpen={drawerOpen}
          onClose={() => setDrawerPath(null)}
          placement="right"
          size="sm"
          title={
            <Stack direction="row" spacing="sm" align="center">
              <span>{trip.coverEmoji}</span>
              <span>{trip.name}</span>
            </Stack>
          }
        >
          <DrawerNav>{sidebarContent}</DrawerNav>
        </Drawer>
      )}
    </>
  )

  return (
    <ThemeProvider theme={warmTheme}>
      <ShellFrame className="warm-shell">{shellTree}</ShellFrame>
    </ThemeProvider>
  )
}
