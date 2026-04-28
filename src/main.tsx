import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { GlobalStyles } from 'myk-library'
import { tripTheme } from './theme/tripTheme'
import App from './App'
import { AuthProvider } from './lib/AuthContext'
import './index.css'
import 'leaflet/dist/leaflet.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={tripTheme}>
      <GlobalStyles theme={tripTheme} />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
