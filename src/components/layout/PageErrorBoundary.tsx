import { Component, type ErrorInfo, type ReactNode } from 'react'
import styled from 'styled-components'

const Box = styled.div`
  padding: 24px 16px;
  text-align: center;
  color: #6e5c42;
`

const Retry = styled.button`
  margin-top: 12px;
  min-height: 44px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid #eadcb5;
  background: #fffdf7;
  color: #2a2013;
  font: inherit;
  cursor: pointer;
`

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a render throw in a trip page so the AppShell chrome stays up.
 * Layout hangs do not throw — those are handled by the itinerary CSS.
 */
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Trip page crashed', error, info.componentStack)
  }

  private retry = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Box role="alert">
        <p>המסך הזה לא נטען. אפשר לנסות שוב בלי לצאת מהטיול.</p>
        <Retry type="button" onClick={this.retry}>נסו שוב</Retry>
      </Box>
    )
  }
}
