import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { GlobalStyles } from 'myk-library'
import { tripTheme } from './theme/tripTheme'
import App from './App'
import { AuthProvider } from './lib/AuthContext'
import PwaUpdatePrompt from './components/pwa/PwaUpdatePrompt'
import { installBootShellFailsafe } from './boot'
import './index.css'

installBootShellFailsafe()

if (import.meta.env.DEV) {
  void import('./stores/tripStore').then(({ useTripStore }) => {
    (window as Window & { __useTripStore?: typeof useTripStore }).__useTripStore = useTripStore
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={tripTheme}>
      <GlobalStyles theme={tripTheme} />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <App />
          <PwaUpdatePrompt />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
