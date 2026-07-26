import { useState } from 'react'
import styled from 'styled-components'
import { Card } from 'myk-library'
import { FileText, ExternalLink, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useTripStore } from '@/stores/tripStore'
import { checkDocSync, DocSyncError } from '@/lib/tripDoc'
import type { DocDiffResult, DocIssue } from '@/lib/tripDocDiff'
import type { TripPlan } from '@/types/trip-plan'
import { formatDateShort } from '@/utils/date'

interface Props {
  trip: TripPlan
}

const Wrap = styled(Card)`
  padding: 16px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
`

const Title = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.gray[500]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const OpenDoc = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${({ theme }) => theme.colors.primary[600]};
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 6px;
  &:hover { background: ${({ theme }) => theme.colors.primary[50]}; }
`

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.gray[100]};
  color: ${({ theme }) => theme.colors.gray[900]};
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease;
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.gray[200]}; }
  &:disabled { opacity: 0.6; cursor: default; }
`

const Spin = styled(RefreshCw)`
  animation: doc-spin 900ms linear infinite;
  @keyframes doc-spin { to { transform: rotate(360deg); } }
`

const Banner = styled.div<{ $tone: 'ok' | 'warn' | 'error' }>`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
  ${({ $tone }) => {
    if ($tone === 'ok') return 'background: rgba(34,197,94,0.12); color: #15803d;'
    if ($tone === 'warn') return 'background: rgba(214,122,31,0.16); color: #B5630F;'
    return 'background: rgba(239,68,68,0.12); color: #dc2626;'
  }}
`

const Hint = styled.div`
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.85;
`

const DayList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
`

const DayRow = styled.div`
  padding: 10px 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray[100]};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
`

const DayHead = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray[900]};
  margin-bottom: 6px;
`

const IssueLine = styled.div`
  font-size: 12.5px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.gray[700]};
`

const Meta = styled.div`
  margin-top: 10px;
  font-size: 11.5px;
  color: ${({ theme }) => theme.colors.gray[500]};
`

const LinkForm = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const Input = styled.input`
  flex: 1 1 200px;
  min-width: 0;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.gray[100]};
  color: ${({ theme }) => theme.colors.gray[900]};
  font-family: inherit;
  font-size: 14px;
  direction: ltr;
  text-align: left;
`

const SmallButton = styled(Button)`
  width: auto;
  flex: 0 0 auto;
`

function issueText(issue: DocIssue): string {
  const term = `"${issue.term}"`
  switch (issue.kind) {
    case 'missing_from_doc':
      return `${term} מופיע באפליקציה אבל לא במסמך${issue.eventTitle ? ` — ${issue.eventTitle}` : ''}`
    case 'moved_in_doc':
      return `${term} מופיע במסמך בתאריך ${issue.docDate ? formatDateShort(issue.docDate) : '?'} ולא כאן`
    case 'missing_from_app':
      return `${term} מופיע במסמך אבל לא באפליקציה`
  }
}

export default function TripDocCard({ trip }: Props) {
  const setDocUrl = useTripStore(s => s.setDocUrl)
  const markDocChecked = useTripStore(s => s.markDocChecked)

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DocDiffResult | null>(null)
  const [error, setError] = useState<DocSyncError | null>(null)
  const [draftUrl, setDraftUrl] = useState('')

  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const diff = await checkDocSync(trip)
      setResult(diff)
      markDocChecked(trip.id, diff.checkedAt)
    } catch (err) {
      setError(err instanceof DocSyncError ? err : new DocSyncError('הבדיקה נכשלה'))
    } finally {
      setBusy(false)
    }
  }

  const drifted = result?.days.filter(d => d.status !== 'in_sync') ?? []

  return (
    <Wrap variant="outlined">
      <Header>
        <Title><FileText size={14} /> מסמך התכנון</Title>
        {trip.docUrl && (
          <OpenDoc href={trip.docUrl} target="_blank" rel="noopener noreferrer">
            פתח <ExternalLink size={13} />
          </OpenDoc>
        )}
      </Header>

      {!trip.docUrl ? (
        <>
          <IssueLine>
            המסמך הוא מקור האמת של הטיול. הדבק את הקישור כדי להשוות מולו.
          </IssueLine>
          <LinkForm style={{ marginTop: 10 }}>
            <Input
              value={draftUrl}
              onChange={e => setDraftUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              aria-label="קישור למסמך התכנון"
            />
            <SmallButton
              disabled={!draftUrl.trim()}
              onClick={() => {
                setDocUrl(trip.id, draftUrl.trim())
                setDraftUrl('')
              }}
            >
              קשר
            </SmallButton>
          </LinkForm>
        </>
      ) : (
        <Button onClick={run} disabled={busy}>
          {busy ? <Spin size={16} /> : <RefreshCw size={16} />}
          {busy ? 'קורא את המסמך…' : 'בדוק סנכרון מול המסמך'}
        </Button>
      )}

      {error && (
        <Banner $tone="error">
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            {error.message}
            {error.hint && <Hint>{error.hint}</Hint>}
          </div>
        </Banner>
      )}

      {result && result.inSync && (
        <Banner $tone="ok">
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>הלו״ז מסונכרן עם המסמך — כל {result.days.length} הימים תואמים.</div>
        </Banner>
      )}

      {result && !result.inSync && (
        <>
          <Banner $tone="warn">
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              {drifted.length} מתוך {result.days.length} ימים לא תואמים למסמך.
              <Hint>המסמך הוא מקור האמת — תקן את הלו״ז לפיו, לא הפוך.</Hint>
            </div>
          </Banner>
          <DayList>
            {drifted.map(day => (
              <DayRow key={day.date}>
                <DayHead>
                  {formatDateShort(day.date)} {day.label ? `· ${day.label}` : ''}
                </DayHead>
                {day.status === 'no_doc_section' ? (
                  <IssueLine>אין ליום הזה שום אזכור במסמך.</IssueLine>
                ) : (
                  day.issues.map((issue, i) => (
                    <IssueLine key={i}>• {issueText(issue)}</IssueLine>
                  ))
                )}
              </DayRow>
            ))}
          </DayList>
        </>
      )}

      {(result || trip.docLastPulledAt) && (
        <Meta>
          נבדק לאחרונה:{' '}
          {new Date(result?.checkedAt ?? trip.docLastPulledAt!).toLocaleString('he-IL', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </Meta>
      )}
    </Wrap>
  )
}
