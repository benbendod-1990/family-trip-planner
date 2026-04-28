import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Quickstart from './pages/Quickstart'
import Dashboard from './pages/Dashboard'
import Itinerary from './pages/Itinerary'
import Family from './pages/Family'
import Budget from './pages/Budget'
import Travel from './pages/Travel'
import Tasks from './pages/Tasks'
import Packing from './pages/Packing'
import Map from './pages/Map'
import FamilyProfile from './pages/FamilyProfile'
import AppLayout from './components/layout/AppLayout'

function App() {
  return (
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
        <Route path="map" element={<Map />} />
      </Route>
    </Routes>
  )
}

export default App
