import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GMAIL_READONLY_SCOPE } from './googleOAuth.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

function src(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8')
}

describe('auth entry UI', () => {
  it('Login is a branded cream gate, not the luggage-emoji placeholder', () => {
    const login = src('../pages/Login.tsx')
    const entry = src('../components/auth/LoginEntry.tsx')
    const screen = src('../components/auth/AuthEntryScreen.tsx')
    assert.match(login, /LoginEntry/)
    assert.match(login, /signInWithGoogle\(\)/)
    assert.equal(login.includes('gmail: true'), false)
    assert.equal(login.includes('🧳'), false)
    assert.equal(login.includes("from 'myk-library'"), false)
    assert.match(entry, /AuthEntryScreen/)
    assert.match(entry, /GoogleSignInButton/)
    assert.match(entry, /המסע של משפחת בן דוד/)
    assert.match(entry, /יומן הטיולים המשפחתי/)
    assert.match(entry, /התחברות עם Google/)
    assert.equal(entry.includes('gmail: true'), false)
    assert.match(screen, /warmTheme/)
    assert.match(screen, /warmDisplayFont/)
    assert.match(screen, /BRAND_ICON_SRC/)
    assert.match(screen, /#FBF3DF|warmPageBackground/)
  })

  it('uses the real PWA brand PNG, not a generated mark', () => {
    const screen = src('../components/auth/AuthEntryScreen.tsx')
    const brand = src('../lib/brandAssets.ts')
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8')) as {
      name: string
      icons: Array<{ src: string }>
    }
    assert.match(screen, /BRAND_ICON_SRC/)
    assert.match(brand, /\/apple-touch-icon\.png/)
    assert.equal(html.includes('href="/apple-touch-icon.png"'), true)
    assert.equal(manifest.icons.some((icon) => icon.src === '/apple-touch-icon.png'), true)
    assert.equal(manifest.name, 'המסע של משפחת בן דוד')
    assert.equal(screen.includes('GenerateImage'), false)
  })

  it('Home guest wall shares the card and Google CTA, signed-in empty does not', () => {
    const home = src('../pages/Home.tsx')
    assert.match(home, /AuthEntryCard/)
    assert.match(home, /GoogleSignInButton/)
    assert.match(home, /התחברו כדי לראות את הטיולים/)
    assert.match(home, /הטיולים המשפחתיים זמינים רק אחרי התחברות עם Google/)
    assert.match(home, /signInWithGoogle\(\)/)
    assert.equal(home.includes('gmail: true'), false)
    assert.match(home, /אין טיולים עדיין/)
    assert.match(home, /צור טיול ראשון/)
    assert.match(home, /mark=\{null\}/)
    assert.equal(home.includes('login-preview'), false)
  })

  it('Join reuses the visual shell but keeps invite copy and claim flow', () => {
    const join = src('../pages/JoinTrip.tsx')
    assert.match(join, /AuthEntryScreen/)
    assert.match(join, /GoogleSignInButton/)
    assert.match(join, /הוזמנת לטיול/)
    assert.match(join, /התחברות עם Google/)
    assert.match(join, /לא את כל הקטלוג/)
    assert.match(join, /claimTripShareLink/)
    assert.match(join, /לא תודה/)
    assert.match(join, /לינק שיתוף לא תקין/)
    assert.match(join, /signInWithGoogle\(\{\s*redirectPath:/)
    assert.equal(join.includes('gmail: true'), false)
    assert.equal(join.includes(GMAIL_READONLY_SCOPE), false)
    assert.equal(join.includes('המסע של משפחת בן דוד'), false)
  })

  it('Google button is a custom CTA, not myk-library primary', () => {
    const btn = src('../components/auth/GoogleSignInButton.tsx')
    assert.match(btn, /התחברות עם Google/)
    assert.match(btn, /type="button"/)
    assert.match(btn, /min-height: 48px/)
    assert.equal(btn.includes('from \'myk-library\''), false)
    assert.equal(btn.includes(GMAIL_READONLY_SCOPE), false)
  })

  it('Home and routing have no signed-in login preview', () => {
    const home = src('../pages/Home.tsx')
    const app = src('../App.tsx')
    const entry = src('../components/auth/LoginEntry.tsx')
    assert.equal(home.includes('login-preview'), false)
    assert.equal(home.includes('תצוגת מסך כניסה'), false)
    assert.equal(home.includes('LogIn'), false)
    assert.match(home, /showAdminUsers && \(/)
    assert.match(home, /משתמשים רשומים/)
    assert.equal(home.includes('✈️ הטיולים שלנו'), false)
    assert.match(home, /<HomeTitle>הטיולים שלנו<\/HomeTitle>/)
    assert.equal(app.includes('login-preview'), false)
    assert.equal(app.includes('LoginPreview'), false)
    assert.match(app, /path="\/login"/)
    assert.equal(entry.includes('preview'), false)
    assert.equal(entry.includes('תצוגה בלבד'), false)
    assert.equal(entry.includes('onBack'), false)
    assert.equal(existsSync(join(dirname(fileURLToPath(import.meta.url)), '../pages/LoginPreview.tsx')), false)
  })
})
