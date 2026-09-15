import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Stack, Typography, Button, EmptyState, Spinner, Badge, Card } from 'myk-library'
import { FileText, BookOpen, Upload, Trash2, ExternalLink, Image as ImageIcon, MailSearch, Lock } from 'lucide-react'
import styled from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { fetchDocText } from '@/lib/tripDoc'
import { documentUrl, deleteDocument, uploadDocument, classifyDocument } from '@/lib/tripDocuments'
import { pullAllDocuments } from '@/lib/gmailSync'
import { GmailAuthError, GmailForbiddenError } from '@/lib/gmailToken'
import { documentHref, isLinkOnlyDocument } from '@/lib/seedBookingDocuments'
import { isFamilyCatalogEmail } from '@/lib/familyCatalog'
import { useAuth } from '@/lib/AuthContext'
import { ensureSensitiveUnlocked, probeAuthenticator, type UnlockCopy } from '@/lib/webauthnUnlock'
import { hasPassportFile, isPendingPassport, isSensitiveKind } from '@/lib/sensitiveDocument'
import TripDocCard from '@/components/dashboard/TripDocCard'
import AuthReconnectBanner from '@/components/auth/AuthReconnectBanner'
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

const PhotoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
`

const PhotoCard = styled(Card)`
  padding: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const KIND_LABEL: Record<TripDocument['kind'], string> = {
  flight: '✈️ טיסה',
  hotel: '🏨 לינה',
  car: '🚗 רכב',
  activity: '🎟️ כרטיסים',
  other: '📄 אחר',
  passport: '🛂 דרכון',
  photo: '📷 תמונה',
}

function prettySize(bytes: number): string {
  if (bytes <= 0) return 'קישור להזמנה'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function kindForUpload(file: File, forced?: TripDocument['kind']): TripDocument['kind'] {
  if (forced) return forced
  const classified = classifyDocument('', '', file.name)
  if (classified !== 'other') return classified
  if (file.type.startsWith('image/')) return 'photo'
  return 'other'
}

export default function TripDoc() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const { isMobile } = useBreakpoint()
  const { user } = useAuth()
  const canGmail = isFamilyCatalogEmail(user?.email)
  const [gmailReconnect, setGmailReconnect] = useState(false)

  const [openDoc, setOpenDoc] = useState<TripDocument | null>(null)
  const [openUrl, setOpenUrl] = useState<string | null>(null)
  const [docError, setDocError] = useState<string | null>(null)
  const [busyUpload, setBusyUpload] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const passportInput = useRef<HTMLInputElement>(null)
  const [passportSlot, setPassportSlot] = useState<TripDocument | null>(null)
  const [unlockCopy, setUnlockCopy] = useState<UnlockCopy | null>(null)

  const [planText, setPlanText] = useState<string | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  const [pullBusy, setPullBusy] = useState(false)
  const [pullNote, setPullNote] = useState<string | null>(null)

  const documents = useMemo(
    () => [...(trip?.documents ?? [])].sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [trip?.documents],
  )
  const passports = documents.filter(d => d.kind === 'passport')
  const photos = documents.filter(d => d.kind === 'photo')
  const bookings = documents.filter(d => d.kind !== 'passport' && d.kind !== 'photo')

  useEffect(() => {
    void probeAuthenticator().then(setUnlockCopy)
  }, [])

  // Signed URLs are short-lived, so one is minted when a document is opened
  // rather than for the whole list up front.
  useEffect(() => {
    if (!openDoc) return
    let cancelled = false
    documentUrl(openDoc)
      .then(u => { if (!cancelled) setOpenUrl(u) })
      .catch(e => { if (!cancelled) setDocError(e instanceof Error ? e.message : 'לא ניתן לפתוח') })
    return () => { cancelled = true }
  }, [openDoc])

  const showDoc = (doc: TripDocument | null) => {
    setOpenUrl(null)
    setDocError(null)
    setOpenDoc(doc)
  }

  const requirePassportUnlock = async () => {
    if (!user?.id) throw new Error('צריך להתחבר כדי לפתוח דרכון')
    const copy = await ensureSensitiveUnlocked(user.id, user.email ?? 'user')
    setUnlockCopy(copy)
  }

  if (!trip) return null

  const patchDocuments = (next: TripDocument[]) => {
    useTripStore.setState(state => ({
      trips: state.trips.map(t =>
        t.id === trip.id
          ? { ...t, documents: next, updatedAt: new Date().toISOString() }
          : t,
      ),
    }))
  }

  const onUpload = async (files: FileList | null, forcedKind?: TripDocument['kind'], slot?: TripDocument | null) => {
    if (!files?.length || !trip) return
    setBusyUpload(true)
    setDocError(null)
    try {
      if (forcedKind === 'passport' || slot?.kind === 'passport') {
        await requirePassportUnlock()
      }
      const added: TripDocument[] = []
      for (const file of Array.from(files)) {
        added.push(await uploadDocument(trip.id, {
          id: slot?.id,
          personId: slot?.personId,
          filename: slot ? slot.filename : file.name,
          mimeType: file.type || 'application/octet-stream',
          blob: file,
          kind: kindForUpload(file, forcedKind ?? slot?.kind),
        }))
      }
      const withoutSlots = (trip.documents ?? []).filter(d => !added.some(a => a.id === d.id))
      patchDocuments([...withoutSlots, ...added])
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'ההעלאה נכשלה')
    } finally {
      setBusyUpload(false)
      setPassportSlot(null)
    }
  }

  // Deliberately sweeps every trip, not just this one: the e-tickets sit in one
  // inbox, and filing them one trip at a time would mean re-scanning the same
  // two years of mail for each.
  const onPull = async () => {
    setPullBusy(true)
    setPullNote(null)
    setDocError(null)
    setGmailReconnect(false)
    try {
      const r = await pullAllDocuments()
      if (r.documentsUnavailable) {
        setDocError('אחסון המסמכים לא הוגדר — צריך להריץ את migration 0016 בפרויקט Supabase.')
      } else if (r.added) {
        setPullNote(`✓ צורפו ${r.added} מסמכים לכל הטיולים (מתוך ${r.scanned} מיילים שנסרקו).`)
      } else {
        const skipped = r.unmatched ? ` · ${r.unmatched} מיילים עם קבצים לא שויכו לטיול` : ''
        setPullNote(`לא נמצאו מסמכים חדשים (${r.scanned} מיילים נסרקו${skipped}).`)
      }
    } catch (e) {
      if (e instanceof GmailAuthError) {
        setGmailReconnect(true)
        setDocError(e.message)
      } else if (e instanceof GmailForbiddenError) {
        setDocError(e.message)
      } else {
        setDocError(e instanceof Error ? e.message : 'משיכת המסמכים נכשלה')
      }
    } finally {
      setPullBusy(false)
    }
  }

  const onDelete = async (doc: TripDocument) => {
    if (!confirm(`למחוק את "${doc.filename}"?`)) return
    try {
      if (isSensitiveKind(doc.kind) && hasPassportFile(doc)) await requirePassportUnlock()
      await deleteDocument(doc)
    } catch (e) {
      if (e instanceof Error && /אימות|דרכון/.test(e.message)) {
        setDocError(e.message)
        return
      }
      // Metadata is what the UI reads; drop it even if the object is already gone.
    }
    if (openDoc?.id === doc.id) showDoc(null)
    patchDocuments((trip.documents ?? []).filter(d => d.id !== doc.id))
  }

  const onOpenFile = async (doc: TripDocument) => {
    try {
      if (isPendingPassport(doc)) return
      if (isSensitiveKind(doc.kind)) await requirePassportUnlock()
      showDoc(doc)
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'האימות נכשל')
    }
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

  const renderDocRow = (doc: TripDocument) => {
    const href = documentHref(doc)
    const linkOnly = isLinkOnlyDocument(doc)
    const pendingPassport = isPendingPassport(doc)
    return (
      <DocRow key={doc.id} variant="outlined">
        <Thumb>
          {doc.kind === 'passport' ? <Lock size={18} /> : doc.mimeType.startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}
        </Thumb>
        <Meta
          onClick={() => {
            if (pendingPassport) return
            if (linkOnly && href) window.open(href, '_blank', 'noopener,noreferrer')
            else void onOpenFile(doc)
          }}
          style={{ cursor: pendingPassport ? 'default' : 'pointer' }}
        >
          <Typography variant="body1" style={{ fontWeight: 500 }}>{doc.filename}</Typography>
          <Typography variant="body2" style={{ color: '#8F7B5C' }}>
            {KIND_LABEL[doc.kind]} · {pendingPassport ? 'ממתין להעלאה' : linkOnly ? 'קישור להזמנה' : prettySize(doc.size)}
            {!linkOnly && !pendingPassport && doc.sourceSubject ? ` · ${doc.sourceSubject}` : ''}
          </Typography>
        </Meta>
        {pendingPassport ? (
          <Badge size="sm" variant="default">אין קובץ</Badge>
        ) : linkOnly ? (
          <Badge size="sm" variant="default">אין PDF עדיין</Badge>
        ) : doc.sourceMessageId ? (
          <Badge size="sm" variant="default">Gmail</Badge>
        ) : doc.kind === 'passport' ? (
          <Badge size="sm" variant="default">נעול</Badge>
        ) : null}
        {pendingPassport ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busyUpload}
            onClick={() => {
              setPassportSlot(doc)
              passportInput.current?.click()
            }}
          >
            העלה סריקה
          </Button>
        ) : linkOnly && href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost">
              <Stack direction="row" spacing="xs" align="center">
                <ExternalLink size={13} /><span>פתח הזמנה</span>
              </Stack>
            </Button>
          </a>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => void onOpenFile(doc)}>
            {doc.kind === 'passport' ? 'פתח עם אימות' : 'הצג'}
          </Button>
        )}
        {!pendingPassport && (
          <Button size="sm" variant="ghost" onClick={() => void onDelete(doc)} aria-label="מחק">
            <Trash2 size={14} />
          </Button>
        )}
      </DocRow>
    )
  }

  return (
    <PageWrapper $mobile={isMobile}>
      <Typography variant="h4" style={{ margin: 0 }}>📄 מסמכים</Typography>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={e => void onUpload(e.target.files)}
      />
      <input
        ref={photoInput}
        type="file"
        multiple
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => void onUpload(e.target.files, 'photo')}
      />
      <input
        ref={passportInput}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={e => void onUpload(e.target.files, 'passport', passportSlot)}
      />

      <Stack direction="column" spacing="sm">
        <Stack direction="row" align="center" justify="between">
          <Typography variant="body1" style={{ fontWeight: 600 }}>
            🛂 דרכונים ({passports.length})
          </Typography>
        </Stack>
        <Typography variant="body2" style={{ color: '#8F7B5C' }}>
          {unlockCopy?.body ?? 'לפני הצגת סריקת דרכון נבקש אימות מכשיר. שמות השמורים מופיעים בלי הקובץ.'}
        </Typography>
        {passports.length === 0 ? (
          <Typography variant="body2" style={{ color: '#8F7B5C' }}>אין משבצות דרכון בטיול הזה.</Typography>
        ) : (
          passports.map(renderDocRow)
        )}
      </Stack>

      <Stack direction="column" spacing="sm">
        <Stack direction="row" align="center" justify="between">
          <Typography variant="body1" style={{ fontWeight: 600 }}>
            📷 תמונות ({photos.length})
          </Typography>
          <Button
            size="sm"
            variant="ghost"
            disabled={busyUpload}
            onClick={() => photoInput.current?.click()}
          >
            <Stack direction="row" spacing="xs" align="center">
              {busyUpload ? <Spinner size="sm" /> : <Upload size={14} />}
              <span>העלה תמונה</span>
            </Stack>
          </Button>
        </Stack>
        <Typography variant="body2" style={{ color: '#8F7B5C' }}>
          כל חבר בטיול יכול להעלות ולראות. מי שלא חבר בטיול — לא.
        </Typography>
        {photos.length === 0 ? (
          <EmptyState
            icon={<ImageIcon size={40} />}
            title="אין תמונות עדיין"
            description="העלו צילומים מהטיול. כולם בטיול רואים את אותה גלריה."
          />
        ) : (
          <PhotoGrid>
            {photos.map(doc => (
              <PhotoCard key={doc.id} variant="outlined" onClick={() => void onOpenFile(doc)}>
                <Thumb><ImageIcon size={18} /></Thumb>
                <Typography variant="body2" style={{ fontWeight: 500 }}>{doc.filename}</Typography>
              </PhotoCard>
            ))}
          </PhotoGrid>
        )}
      </Stack>

      <Stack direction="column" spacing="sm">
        <Stack direction="row" align="center" justify="between">
          <Typography variant="body1" style={{ fontWeight: 600 }}>
            מסמכי הנסיעה ({bookings.length})
          </Typography>
          <Stack direction="row" spacing="xs" align="center">
            {canGmail && (
              <Button size="sm" variant="ghost" disabled={pullBusy} onClick={() => void onPull()}>
                <Stack direction="row" spacing="xs" align="center">
                  {pullBusy ? <Spinner size="sm" /> : <MailSearch size={14} />}
                  <span>{pullBusy ? 'שואב…' : 'שאב מ-Gmail'}</span>
                </Stack>
              </Button>
            )}
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
          </Stack>
        </Stack>

        <Typography variant="body2" style={{ color: '#8F7B5C' }}>
          כרטיסי טיסה, שוברים ואישורי הזמנה.
          {canGmail
            ? ' כדי לצרף קבצים מהמייל לחצו על «שאב מ-Gmail» — הסריקה רצה רק אז, שנתיים אחורה, לכל הטיולים. אין סריקה אוטומטית בפתיחת האפליקציה.'
            : ' משיכה מ-Gmail שמורה לבן ולגל. אפשר להעלות קובץ ידנית — כל חבר בטיול רואה אותו.'}
        </Typography>

        {pullNote && (
          <Typography variant="body2" style={{ color: '#8F7B5C' }}>{pullNote}</Typography>
        )}

        {gmailReconnect && docError ? (
          <AuthReconnectBanner
            message={docError}
            hint="אחרי ההתחברות אפשר לשאוב כרטיסים מהמייל. בינתיים מופיעות כאן ההזמנות שכבר ידועות מהטיול."
          />
        ) : docError ? (
          <Typography variant="body2" style={{ color: '#b91c1c' }}>{docError}</Typography>
        ) : null}

        {bookings.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} />}
            title="אין עדיין מסמכים"
            description={canGmail
              ? 'כרטיסי טיסה ושוברים יופיעו כאן. אפשר ללחוץ על «שאב מ-Gmail» אחרי התחברות, או להעלות קובץ ידנית.'
              : 'כרטיסי טיסה ושוברים יופיעו כאן. אפשר להעלות קובץ ידנית.'}
          />
        ) : (
          bookings.map(renderDocRow)
        )}

        {openDoc && !isLinkOnlyDocument(openDoc) && !isPendingPassport(openDoc) && (
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
