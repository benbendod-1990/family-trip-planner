import { useEffect, useState } from 'react'
import { Outlet, useParams, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AiChatDrawer from '@/components/ai/AiChatDrawer'
import CloudSyncButton from '@/components/cloud/CloudSyncButton'
import {
  AppShell, Navbar, Sidebar, Drawer,
  SidebarContent, SidebarNavItem, SidebarSection, SidebarSectionTitle,
  Stack, Badge, Typography, ActionIcon,
} from 'myk-library'
import { useTripStore } from '@/stores/tripStore'
import styled from 'styled-components'
import { Map, Wallet, Plane, Home, ListTodo, Users, Menu, LayoutDashboard, Backpack, MapPin, User } from 'lucide-react'
import { useBreakpoint } from '@/hooks/useBreakpoint'

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
  { label: 'לוח זמנים', path: 'itinerary', icon: <Map size={18} /> },
  { label: 'מפה', path: 'map', icon: <MapPin size={18} /> },
  { label: 'ציוד', path: 'packing', icon: <Backpack size={18} /> },
  { label: 'משפחה', path: 'family', icon: <Users size={18} /> },
  { label: 'משימות', path: 'tasks', icon: <ListTodo size={18} /> },
  { label: 'תקציב', path: 'budget', icon: <Wallet size={18} /> },
  { label: 'טיסות, לינה ורכב', path: 'travel', icon: <Plane size={18} /> },
]

export default function AppLayout() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const trips = useTripStore(s => s.trips)
  const activeTripId = useTripStore(s => s.activeTripId)
  const setActiveTrip = useTripStore(s => s.setActiveTrip)
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { isTablet } = useBreakpoint()

  const trip = trips.find(t => t.id === id)

  useEffect(() => {
    if (id && activeTripId !== id) {
      setActiveTrip(id)
    }
  }, [id, activeTripId, setActiveTrip])

  // close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

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

  return (
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
                  onClick={() => setDrawerOpen(true)}
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
                <ActionIcon
                  onClick={() => navigate('/profile')}
                  title="פרופיל משפחתי — סיכום טיולים קודמים והעדפות"
                  aria-label="פרופיל משפחתי"
                  variant="subtle"
                  size="sm"
                >
                  <User size={18} />
                </ActionIcon>
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
        <Outlet />
      </AppShell>

      <AiChatDrawer />

      {isTablet && (
        <Drawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
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
}
