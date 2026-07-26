import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ActionIcon, Drawer, Stack, Typography, Alert, Spinner, Button,
} from 'myk-library'
import styled from 'styled-components'
import { Sparkles, Send, Trash2 } from 'lucide-react'
import { useAiStore } from '@/stores/aiStore'
import { useTripStore } from '@/stores/tripStore'
import { sendAiMessage } from '@/services/aiService'
// Lazy: this modal pulls in Leaflet, which is far too heavy to sit in the
// chunk that every trip screen loads. It only mounts once the user opens it.
const AiItineraryModal = lazy(() => import('@/components/ai/AiItineraryModal'))

const Fab = styled.button`
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 200;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 20px rgba(245, 158, 11, 0.55);
  }
`

const MessagesArea = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  min-height: 0;
`

const Bubble = styled.div<{ $role: 'user' | 'assistant' }>`
  max-width: 85%;
  padding: 10px 14px;
  border-radius: ${({ $role }) => ($role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px')};
  background: ${({ $role, theme }) =>
    $role === 'user' ? theme.colors.primary[500] : theme.colors.gray[100]};
  color: ${({ $role, theme }) =>
    $role === 'user' ? '#000' : theme.colors.gray[900]};
  align-self: ${({ $role }) => ($role === 'user' ? 'flex-end' : 'flex-start')};
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`

const QuickButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 8px;
`

const InputRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.gray[100]};
  background: ${({ theme }) => theme.colors.gray[50]};
`

const TextArea = styled.textarea`
  flex: 1;
  resize: none;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.gray[50]};
  color: ${({ theme }) => theme.colors.gray[900]};
  outline: none;
  line-height: 1.4;
  max-height: 120px;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`

const DrawerBody = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`

const QUICK_PROMPTS = [
  'תכנן לי יום מלא בהתאם ליעד',
  'מה לארוז לטיול הזה?',
  'איך לנהל את התקציב שלנו?',
  'המלץ על מסעדות מקומיות',
]

export default function AiChatDrawer() {
  const [open, setOpen] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const activeTripId = useTripStore(s => s.activeTripId)
  const trips = useTripStore(s => s.trips)
  const trip = trips.find(t => t.id === activeTripId)

  const { provider, openaiApiKey, openaiModel, ollamaUrl, ollamaModel, chatHistory, addMessage, clearHistory } = useAiStore()
  const messages = activeTripId ? (chatHistory[activeTripId] ?? []) : []

  const hasApiKey = provider === 'openai' ? !!openaiApiKey : true

  useEffect(() => {
    if (open) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages.length, open])

  if (!activeTripId || !trip) return null

  async function handleSend(text: string) {
    if (!text.trim() || loading || !trip) return
    setError(null)

    const userMsg = addMessage(activeTripId!, { role: 'user', content: text.trim() })
    setInput('')
    setLoading(true)

    try {
      const updatedMessages = [...messages, userMsg]
      const reply = await sendAiMessage(updatedMessages, trip, {
        provider, openaiApiKey, openaiModel, ollamaUrl, ollamaModel,
      })
      addMessage(activeTripId!, { role: 'assistant', content: reply })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(input)
    }
  }

  return (
    <>
      {showBuilder && activeTripId && (
        <Suspense fallback={null}>
          <AiItineraryModal
            open={showBuilder}
            onClose={() => setShowBuilder(false)}
            tripId={activeTripId}
          />
        </Suspense>
      )}

      <Fab onClick={() => setOpen(true)} title="עוזר AI" aria-label="פתח עוזר AI">
        <Sparkles size={22} />
      </Fab>

      <Drawer
        isOpen={open}
        onClose={() => setOpen(false)}
        placement="left"
        size="md"
        title={
          <Stack direction="row" align="center" justify="between" style={{ width: '100%' }}>
            <Stack direction="row" spacing="xs" align="center">
              <Sparkles size={16} />
              <span>עוזר AI — {trip.destination}</span>
            </Stack>
            {messages.length > 0 && (
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={() => clearHistory(activeTripId)}
                title="נקה שיחה"
                aria-label="נקה היסטוריית שיחה"
              >
                <Trash2 size={14} />
              </ActionIcon>
            )}
          </Stack>
        }
      >
        <DrawerBody>
          {!hasApiKey && (
            <div style={{ padding: '12px 16px' }}>
              <Alert variant="warning" title="נדרש API Key">
                <Stack direction="column" spacing="xs">
                  <span>הגדר OpenAI API Key בדף הפרופיל כדי להשתמש בעוזר AI</span>
                  <Button size="sm" variant="secondary" onClick={() => { setOpen(false); navigate('/profile') }}>
                    הגדרות
                  </Button>
                </Stack>
              </Alert>
            </div>
          )}

          {messages.length === 0 && hasApiKey && (
            <>
              <div style={{ padding: '16px 16px 8px' }}>
                <Typography variant="body2" style={{ color: '#9ca3af', textAlign: 'center' }}>
                  שאל אותי כל דבר על הטיול לـ{trip.destination} ✨
                </Typography>
              </div>
              <div style={{ padding: '0 16px 8px' }}>
                <Button
                  variant="primary"
                  style={{ width: '100%' }}
                  onClick={() => { setOpen(false); setShowBuilder(true) }}
                >
                  <Stack direction="row" spacing="xs" align="center" justify="center">
                    <Sparkles size={14} />
                    <span>בנה לי מסלול יום-יום עם AI</span>
                  </Stack>
                </Button>
              </div>
              <QuickButtons>
                {QUICK_PROMPTS.map(p => (
                  <Button key={p} size="sm" variant="secondary" onClick={() => handleSend(p)}>
                    {p}
                  </Button>
                ))}
              </QuickButtons>
            </>
          )}

          <MessagesArea>
            {messages.map(msg => (
              <Bubble key={msg.id} $role={msg.role}>
                {msg.content}
              </Bubble>
            ))}
            {loading && (
              <Bubble $role="assistant">
                <Spinner size="sm" />
              </Bubble>
            )}
            {error && (
              <Alert variant="error" title="שגיאה">{error}</Alert>
            )}
            <div ref={messagesEndRef} />
          </MessagesArea>

          <InputRow>
            <TextArea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="שאל שאלה..."
              rows={1}
              disabled={!hasApiKey || loading}
              dir="rtl"
            />
            <ActionIcon
              onClick={() => handleSend(input)}
              disabled={!input.trim() || loading || !hasApiKey}
              aria-label="שלח"
              title="שלח"
              size="md"
            >
              <Send size={18} />
            </ActionIcon>
          </InputRow>
        </DrawerBody>
      </Drawer>
    </>
  )
}
