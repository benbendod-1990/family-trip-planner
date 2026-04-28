import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { Button, Container, Stack, Typography, Badge } from 'myk-library'
import { Copy, ExternalLink, Check, Home as HomeIcon, Database, Cloud, Mail } from 'lucide-react'

const Wrap = styled.div`
  padding: 16px 0 64px;
  max-width: 800px;
  margin: 0 auto;
`

const Section = styled.section`
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  color: #111827;
`

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  flex-wrap: wrap;
`

const URLS = {
  supabaseSQL: 'https://supabase.com/dashboard/project/fmybfgryipzlfukirizp/sql/new',
  supabaseAuth: 'https://supabase.com/dashboard/project/fmybfgryipzlfukirizp/auth/url-configuration',
  supabaseAuthProviders: 'https://supabase.com/dashboard/project/fmybfgryipzlfukirizp/auth/providers',
  supabaseAPI: 'https://supabase.com/dashboard/project/fmybfgryipzlfukirizp/settings/api',
  cloudflarePages: 'https://dash.cloudflare.com/aa35da8a0f8aac69dc5a83953e5cda0a/pages/view/family-trip-planner',
  cloudflareWorker: 'https://dash.cloudflare.com/aa35da8a0f8aac69dc5a83953e5cda0a/workers-and-pages/view/family-trip-planner-api',
  prodSite: 'https://family-trip-planner-end.pages.dev',
  workerHealth: 'https://family-trip-planner-api.bendod-family.workers.dev/health',
  googleCloud: 'https://console.cloud.google.com/apis/credentials',
}

const MIGRATIONS = [
  { file: '0001_init.sql',                title: 'יצירת סכמה ראשית', status: 'ran' },
  { file: '0002_invite.sql',              title: 'פונקציות הזמנת חברים', status: 'ran' },
  { file: '0003_fix_rls_recursion.sql',   title: 'תיקון RLS recursion',   status: 'ran' },
  { file: '0004_save_trip_rpc.sql',       title: 'RPC לשמירה (עוקף RLS)', status: 'pending' },
] as const

function CopyButton({ file }: { file: string }) {
  const [done, setDone] = useState(false)
  const onClick = async () => {
    try {
      const res = await fetch(`/migrations/${file}`)
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1800)
    } catch (e) {
      alert('כשל בהעתקה: ' + (e instanceof Error ? e.message : 'unknown'))
    }
  }
  return (
    <Button variant="ghost" onClick={onClick}>
      <Stack direction="row" spacing="xs" align="center">
        {done ? <Check size={14} /> : <Copy size={14} />}
        <span>{done ? 'הועתק' : 'העתק SQL'}</span>
      </Stack>
    </Button>
  )
}

function LinkButton({ href, icon, children }: { href: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Button variant="ghost" onClick={() => window.open(href, '_blank')}>
      <Stack direction="row" spacing="xs" align="center">
        {icon}
        <span>{children}</span>
        <ExternalLink size={12} />
      </Stack>
    </Button>
  )
}

export default function Quickstart() {
  const navigate = useNavigate()
  const [workerStatus, setWorkerStatus] = useState<'…' | 'ok' | 'down'>('…')

  useEffect(() => {
    fetch(URLS.workerHealth)
      .then(r => setWorkerStatus(r.ok ? 'ok' : 'down'))
      .catch(() => setWorkerStatus('down'))
  }, [])

  return (
    <Container size="md" style={{ padding: '0 12px' }} dir="rtl">
      <Wrap>
        <Stack direction="row" justify="between" align="center" style={{ marginBottom: 16 }}>
          <Typography variant="h3" style={{ margin: 0 }}>⚡ Quickstart</Typography>
          <Button variant="ghost" onClick={() => navigate('/')}>
            <Stack direction="row" spacing="xs" align="center">
              <HomeIcon size={16} />
              <span>חזרה</span>
            </Stack>
          </Button>
        </Stack>

        <Section>
          <Typography variant="h6" style={{ marginTop: 0 }}>📊 סטטוס המערכת</Typography>
          <Row>
            <span>Frontend (Pages)</span>
            <Stack direction="row" spacing="xs" align="center">
              <Badge variant="success" size="sm">פרוס</Badge>
              <LinkButton href={URLS.prodSite} icon={<Cloud size={14} />}>פתח</LinkButton>
            </Stack>
          </Row>
          <Row>
            <span>API Worker</span>
            <Stack direction="row" spacing="xs" align="center">
              <Badge variant={workerStatus === 'ok' ? 'success' : workerStatus === 'down' ? 'error' : 'default'} size="sm">
                {workerStatus === 'ok' ? '🟢 חי' : workerStatus === 'down' ? '🔴 לא מגיב' : '… בודק'}
              </Badge>
              <LinkButton href={URLS.cloudflareWorker} icon={<Cloud size={14} />}>Dashboard</LinkButton>
            </Stack>
          </Row>
          <Row>
            <span>Database (Supabase)</span>
            <Stack direction="row" spacing="xs" align="center">
              <Badge variant="success" size="sm">חי</Badge>
              <LinkButton href={URLS.supabaseAPI} icon={<Database size={14} />}>הגדרות</LinkButton>
            </Stack>
          </Row>
        </Section>

        <Section>
          <Typography variant="h6" style={{ marginTop: 0 }}>🗄️ מיגרציות SQL</Typography>
          <Typography variant="body2" style={{ color: '#6b7280', marginBottom: 8 }}>
            לחץ "העתק SQL" → "פתח SQL Editor" → Cmd+V → Run
          </Typography>
          {MIGRATIONS.map(m => (
            <Row key={m.file}>
              <Stack direction="row" spacing="sm" align="center">
                <Badge variant={m.status === 'ran' ? 'success' : 'warning'} size="sm">
                  {m.status === 'ran' ? '✓ הורץ' : '⚠ ממתין'}
                </Badge>
                <span style={{ fontSize: 13 }}>{m.file} — {m.title}</span>
              </Stack>
              <Stack direction="row" spacing="xs">
                <CopyButton file={m.file} />
              </Stack>
            </Row>
          ))}
          <div style={{ marginTop: 8 }}>
            <LinkButton href={URLS.supabaseSQL} icon={<Database size={14} />}>פתח SQL Editor חדש</LinkButton>
          </div>
        </Section>

        <Section>
          <Typography variant="h6" style={{ marginTop: 0 }}>🔐 Supabase Auth</Typography>
          <Row>
            <span>הגדרות URLs (Site URL + Redirect URLs)</span>
            <LinkButton href={URLS.supabaseAuth}>פתח</LinkButton>
          </Row>
          <Row>
            <span>Providers (Google, וכו')</span>
            <LinkButton href={URLS.supabaseAuthProviders}>פתח</LinkButton>
          </Row>
        </Section>

        <Section>
          <Typography variant="h6" style={{ marginTop: 0 }}>📧 Gmail Sync</Typography>
          <Typography variant="body2" style={{ color: '#6b7280' }}>
            כדי שכפתור "Gmail" בעמוד הבית יעבוד, ב-Google Cloud Console:
            <br />1. פתח OAuth Consent Screen → Scopes
            <br />2. הוסף <code>https://www.googleapis.com/auth/gmail.readonly</code>
            <br />3. שמור. אחר כך — צא מהאפליקציה והיכנס מחדש.
          </Typography>
          <div style={{ marginTop: 8 }}>
            <LinkButton href={URLS.googleCloud} icon={<Mail size={14} />}>Google Cloud Console</LinkButton>
          </div>
        </Section>

        <Section>
          <Typography variant="h6" style={{ marginTop: 0 }}>🔗 קישורים שימושיים</Typography>
          <Row>
            <span>אתר פרוד (לאישתך)</span>
            <LinkButton href={URLS.prodSite}>{URLS.prodSite.replace('https://', '')}</LinkButton>
          </Row>
          <Row>
            <span>Cloudflare Pages dashboard</span>
            <LinkButton href={URLS.cloudflarePages}>פתח</LinkButton>
          </Row>
          <Row>
            <span>Worker dashboard (logs, secrets)</span>
            <LinkButton href={URLS.cloudflareWorker}>פתח</LinkButton>
          </Row>
        </Section>

        <Section>
          <Typography variant="h6" style={{ marginTop: 0 }}>📱 הוספה כאפליקציה לאייפון</Typography>
          <Typography variant="body2" style={{ color: '#6b7280' }}>
            פתח ב-Safari → כפתור Share (☐↑) → "Add to Home Screen" → הוסף.
            <br />
            המייל לאישתך עם קישור: <code>{URLS.prodSite}</code>
          </Typography>
        </Section>
      </Wrap>
    </Container>
  )
}
