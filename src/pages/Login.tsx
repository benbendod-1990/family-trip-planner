import { Navigate } from 'react-router-dom'
import styled from 'styled-components'
import { Button, Container, Stack, Typography } from 'myk-library'
import { useAuth } from '@/lib/AuthContext'

const Wrap = styled.div`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 32px 16px;
`

const Card = styled.div`
  background: #fff;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 16px;
  padding: 32px;
  max-width: 420px;
  width: 100%;
  text-align: center;
`

export default function Login() {
  const { session, loading, signInWithGoogle } = useAuth()

  if (loading) return null
  if (session) return <Navigate to="/" replace />

  return (
    <Container>
      <Wrap>
        <Card>
          <Stack direction="column" spacing="lg" align="center">
            <div style={{ fontSize: 48 }}>🧳</div>
            <Typography variant="h2">מתכנן הטיול המשפחתי</Typography>
            <Typography variant="body1" style={{ color: '#6b7280' }}>
              התחברו כדי לסנכרן את הטיול בין כל המשתמשים במשפחה
            </Typography>
            <Button variant="primary" onClick={signInWithGoogle}>
              התחברות עם Google
            </Button>
          </Stack>
        </Card>
      </Wrap>
    </Container>
  )
}
