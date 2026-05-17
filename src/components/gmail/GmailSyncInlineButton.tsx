import { useState } from 'react'
import { Button, Stack } from 'myk-library'
import { Mail, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { syncFromGmail, type GmailSyncReport } from '@/lib/gmailSync'

// Inline trigger for Gmail sync used inside trip pages (Travel, Itinerary).
// Uses the same Supabase-token flow as the topbar CloudSyncButton — no
// separate Google OAuth client ID, no popup, no extra env var.
export default function GmailSyncInlineButton() {
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!session) {
      alert('כדי לסנכרן מ-Gmail, התחבר עם Google מהכפתור "התחבר" בראש העמוד.')
      return
    }
    setBusy(true)
    try {
      const r: GmailSyncReport = await syncFromGmail()
      const parts: string[] = []
      if (r.flightsAdded) parts.push(`${r.flightsAdded} טיסות`)
      if (r.hotelsAdded) parts.push(`${r.hotelsAdded} מלונות`)
      if (r.carsAdded) parts.push(`${r.carsAdded} רכבים`)
      const summary = parts.length ? `הוסף: ${parts.join(', ')}` : 'לא נמצאו הזמנות חדשות'
      const ai = r.aiAugmented ? ` · 🤖 ${r.aiAugmented} שוחזרו ע״י AI` : ''
      const skipped = r.unmatched ? ` · דולגו ${r.unmatched} הזמנות שלא תאמו טיול` : ''
      const quota = r.aiQuotaExceeded
        ? `\n\n⚠️ הגעת למכסת Gemini החינמית (15/דקה או 1500/יום).${r.aiSkipped ? ` ${r.aiSkipped} מיילים לא נסרקו ע״י AI.` : ''} נסה שוב בעוד דקה־שתיים, או מחר אם זו המכסה היומית.`
        : ''
      alert(`📧 ${summary} (סרקתי ${r.scanned} מיילים${ai}${skipped})${quota}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה'
      const quota = /\b429\b|quota|rate.?limit/i.test(msg)
      alert(quota
        ? '⚠️ הגעת למכסת Gemini החינמית (15/דקה או 1500/יום). נסה שוב בעוד דקה־שתיים, או מחר אם זו המכסה היומית.'
        : `סנכרון Gmail נכשל: ${msg.slice(0, 200)}`)
    }
    setBusy(false)
  }

  return (
    <Button size="sm" variant="ghost" onClick={run} disabled={busy}>
      <Stack direction="row" spacing="xs" align="center">
        {busy ? <Loader2 size={14} className="spin" /> : <Mail size={14} />}
        <span>סנכרן מ-Gmail</span>
      </Stack>
    </Button>
  )
}
