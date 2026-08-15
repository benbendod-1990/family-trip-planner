import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import RouteFallback from './components/layout/RouteFallback'
import { dismissBootShell } from './boot'

/*
 * Home and Login load eagerly — they are the two entry points, so putting them
 * behind a lazy chunk would only add a round trip before the first screen.
 * Everything else is split out: the trip pages are reachable only after a trip
 * is opened, and they pull in the heaviest dependencies.
 */
const Quickstart = lazy(() => import('./pages/Quickstart'))
const FamilyProfile = lazy(() => import('./pages/FamilyProfile'))
const AppLayout = lazy(() => import('./components/layout/AppLayout'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Itinerary = lazy(() => import('./pages/Itinerary'))
const Family = lazy(() => import('./pages/Family'))
const Budget = lazy(() => import('./pages/Budget'))
const Travel = lazy(() => import('./pages/Travel'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Packing = lazy(() => import('./pages/Packing'))
const TripDoc = lazy(() => import('./pages/TripDoc'))

function App() {
  /*
   * Hand the screen over from the boot shell in index.html. Effects run
   * bottom-up, so by the time this fires the routed page below has already
   * committed — the shell uncovers a real frame, not an empty one.
   */
  useEffect(dismissBootShell, [])

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/quickstart" element={<Quickstart />} />
        <Route path="/profile" element={<FamilyProfile />} />
        <Route path="/trip/:id" element={<AppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="itinerary" element={<Itinerary />} />
          <Route path="family" element={<Family />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="budget" element={<Budget />} />
          <Route path="travel" element={<Travel />} />
          <Route path="packing" element={<Packing />} />
          <Route path="doc" element={<TripDoc />} />
          {/* Map merged into the itinerary — redirect old/bookmarked links. */}
          <Route path="map" element={<Navigate to="../itinerary" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
