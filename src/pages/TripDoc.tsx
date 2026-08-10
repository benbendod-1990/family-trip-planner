import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Stack, Typography, Button, EmptyState, Spinner, Badge, Card } from 'myk-library'
import { FileText, BookOpen, Upload, Trash2, ExternalLink, Image as ImageIcon } from 'lucide-react'
import styled from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { fetchDocText } from '@/lib/tripDoc'
import { documentUrl, deleteDocument, uploadDocument, classifyDocument } from '@/lib/tripDocuments'
import TripDocCard from '@/components/dashboard/TripDocCard'
import type { TripDocument } from '@/types/trip-plan'

const PageWrapper = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '12px' : '24px')};
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const DocRow = styled(Card)`
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
`

const Thumb = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.gray[100]};
  color: ${({ theme }) => theme.colors.gray[600]};
`

const Meta = styled.div`
  flex: 1;
  min-width: 0;
  > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`

/* The preview is an <iframe> for PDFs and an <img> for scans — both render
   straight off the signed URL, so nothing is copied into the page. */
const Preview = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 12px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.white};
  iframe, img { display: block; width: 100%; border: 0; }
  iframe { height: 70vh; }
  img { height: auto; }
`

const DocText = styled.pre`
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.7;
  margin: 0;
  padding: 16px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  max-height: 70vh;
  overflow: auto;
`

const KIND_LABEL: Record<TripDocument['kind'], string> = {
  flight: '✈️ טיסה',
  hotel: '🏨 לינה',
  car: '🚗 רכב',
  activity: '🎟️ כרטיסים',
  other: '📄 אחר',
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function TripDoc() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const { isMobile } = useBreakpoint()

  const [openDoc, setOpenDoc] = useState<TripDocument | null>(null)
  const [openUrl, setOpenUrl] = useState<string | null>(null)
  const [docError, setDocError] = useState<string | null>(null)
  const [busyUpload, setBusyUpload] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const [planText, setPlanText] = useState<string | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  const documents = useMemo(
    () => [...(trip?.documents ?? [])].sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [trip?.documents],
  )

  // Signed URLs are short-lived, so one is minted when a document is opened
  // rather than for the whole list up front.
  useEffect(() => {
    if (!openDoc) return
    let cancelled = false
    documentUrl(openDoc.path)
      .then(u => { if (!cancelled) setOpenUrl(u) })
      .catch(e => { if (!cancelled) setDocError(e instanceof Error ? e.message : 'לא ניתן לפתוח') })
    return () => { cancelled = true }
  }, [openDoc])

  // Clearing here rather than in the effect keeps the effect to its one async
  // job — the lint rule against synchronous setState in effects is right that
  // the reset belongs with the interaction that caused it.
  const showDoc = (doc: TripDocument | null) => {
    setOpenUrl(null)
    setDocError(null)
    setOpenDoc(doc)
  }

  if (!trip) return null

  const onUpload = async (files: FileList | null) => {
    if (!files?.length || !trip) return
    setBusyUpload(true)
    setDocError(null)
    try {
      const added: TripDocument[] = []
      for (const file of Array.from(files)) {
        added.push(await uploadDocument(trip.id, {
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          blob: file,
          kind: classifyDocument('', '', file.name),
        }))
      }
      useTripStore.setState(state => ({
        trips: state.trips.map(t =>
          t.id === trip.id
            ? { ...t, documents: [...(t.documents ?? []), ...added], updatedAt: new Date().toISOString() }
            : t,
        ),
      }))
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'ההעלאה נכשלה')
    } finally {
      setBusyUpload(false)
    }
  }

  const onDelete = async (doc: TripDocument) => {
    if (!confirm(`למחוק את "${doc.filename}"?`)) return
    try {
      await deleteDocument(doc.path)
    } catch {
      // Metadata is what the UI reads; drop it even if the object is already gone.
    }
    if (openDoc?.id === doc.id) showDoc(null)
    useTripStore.setState(state => ({
      trips: state.trips.map(t =>
        t.id === trip.id
          ? { ...t, documents: (t.documents ?? []).filter(d => d.id !== doc.id), updatedAt: new Date().toISOString() }
          : t,
      ),
    }))
  }

  const readPlan = async () => {
    if (!trip.docUrl) return
    setPlanBusy(true)
    setPlanError(null)
    try {
      setPlanText(await fetchDocText(trip.docUrl))
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'קריאת המסמך נכשלה')
    } finally {
      setPlanBusy(false)
    }
  }

  return (
    <PageWrapper $mobile={isMobile}>
      <Typography variant="h4" style={{ margin: 0 }}>📄 מסמכים</Typography>

      <Stack direction="column" spacing="sm">
        <Stack direction="row" align="center" justify="between">
          <Typography variant="body1" style={{ fontWeight: 600 }}>
            מסמכי הנסיעה ({documents.length})
          </Typography>
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="application/pdf,image/*"
              style={{ display: 'none' }}
              onChange={e => void onUpload(e.target.files)}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={busyUpload}
              onClick={() => fileInput.current?.click()}
            >
              <Stack direction="row" spacing="xs" align="center">
                {busyUpload ? <Spinner size="sm" /> : <Upload size={14} />}
                <span>{busyUpload ? 'מעלה…' : 'העלה'}</span>
              </Stack>
            </Button>
          </>
        </Stack>

        <Typography variant="body2" style={{ color: '#8F7B5C' }}>
          כרטיסי טיסה, שוברים ואישורי הזמנה נשמרים כאן אוטומטית כשמריצים "סנכרן Gmail".
        </Typography>

        {docError && (
          <Typography variant="body2" style={{ color: '#b91c1c' }}>{docError}</Typography>
        )}

        {documents.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} />}
            title="אין עדיין מסמכים"
            description='הרץ "סנכרן Gmail" כדי למשוך את הכרטיסים והשוברים מהמייל, או העלה קובץ ידנית.'
          />
        ) : (
          documents.map(doc => (
            <DocRow key={doc.id} variant="outlined">
              <Thumb>
                {doc.mimeType.startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}
              </Thumb>
              <Meta onClick={() => showDoc(doc)} style={{ cursor: 'pointer' }}>
                <Typography variant="body1" style={{ fontWeight: 500 }}>{doc.filename}</Typography>
                <Typography variant="body2" style={{ color: '#8F7B5C' }}>
                  {KIND_LABEL[doc.kind]} · {prettySize(doc.size)}
                  {doc.sourceSubject ? ` · ${doc.sourceSubject}` : ''}
                </Typography>
              </Meta>
              {doc.sourceMessageId && <Badge size="sm" variant="default">Gmail</Badge>}
              <Button size="sm" variant="ghost" onClick={() => showDoc(doc)}>הצג</Button>
              <Button size="sm" variant="ghost" onClick={() => void onDelete(doc)} aria-label="מחק">
                <Trash2 size={14} />
              </Button>
            </DocRow>
          ))
        )}

        {openDoc && (
          <Stack direction="column" spacing="xs">
            <Stack direction="row" align="center" justify="between">
              <Typography variant="body1" style={{ fontWeight: 600 }}>{openDoc.filename}</Typography>
              <Stack direction="row" spacing="xs">
                {openUrl && (
                  <a href={openUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost">
                      <Stack direction="row" spacing="xs" align="center">
                        <ExternalLink size={13} /><span>פתח</span>
                      </Stack>
                    </Button>
                  </a>
                )}
                <Button size="sm" variant="ghost" onClick={() => showDoc(null)}>סגור</Button>
              </Stack>
            </Stack>
            <Preview>
              {!openUrl ? (
                <div style={{ padding: 24, textAlign: 'center' }}><Spinner size="md" /></div>
              ) : openDoc.mimeType.startsWith('image/') ? (
                <img src={openUrl} alt={openDoc.filename} />
              ) : (
                <iframe src={openUrl} title={openDoc.filename} />
              )}
            </Preview>
          </Stack>
        )}
      </Stack>

      <Stack direction="column" spacing="sm">
        <Typography variant="body1" style={{ fontWeight: 600 }}>מסמך התכנון</Typography>
        <TripDocCard trip={trip} />
        {trip.docUrl && !planText && (
          <Button onClick={readPlan} disabled={planBusy} variant="ghost">
            <Stack direction="row" spacing="xs" align="center" justify="center">
              {planBusy ? <Spinner size="sm" /> : <BookOpen size={16} />}
              <span>{planBusy ? 'קורא…' : 'קרא את מסמך התכנון כאן'}</span>
            </Stack>
          </Button>
        )}
        {planError && <Typography variant="body2" style={{ color: '#b91c1c' }}>{planError}</Typography>}
        {planText && <DocText>{planText}</DocText>}
      </Stack>
    </PageWrapper>
  )
}
