import { LogIn } from 'lucide-react'
import styled from 'styled-components'
import { useAuth } from '@/lib/AuthContext'

const Banner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
  font-size: 13px;
  line-height: 1.5;
`

const Hint = styled.div`
  font-size: 12px;
  opacity: 0.85;
  color: #9f1239;
`

const Cta = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid #fecaca;
  background: #fff;
  color: #9f1239;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
`

interface Props {
  message: string
  hint?: string
}

/** Hebrew reconnect CTA — never show raw Worker 401 JSON to Ben. */
export default function AuthReconnectBanner({ message, hint }: Props) {
  const { signInWithGoogle, session } = useAuth()
  return (
    <Banner role="alert">
      <div>{message}</div>
      {hint && <Hint>{hint}</Hint>}
      <Cta type="button" onClick={() => void signInWithGoogle()}>
        <LogIn size={16} />
        {session ? 'חבר מחדש עם Google' : 'התחבר עם Google'}
      </Cta>
    </Banner>
  )
}
