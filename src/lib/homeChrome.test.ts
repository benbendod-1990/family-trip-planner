import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

function src(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8')
}

describe('signed-in Home chrome matches the cream login card', () => {
  it('uses a slab title, the PWA brand photo, and no airplane emoji in the heading', () => {
    const home = src('../pages/Home.tsx')
    const chrome = src('../components/home/HomeChrome.tsx')
    const brandMark = src('../components/home/HomeBrandMark.tsx')
    const brand = src('../lib/brandAssets.ts')
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    assert.match(chrome, /HomeHeaderCard/)
    assert.match(chrome, /warmDisplayFont/)
    assert.match(chrome, /warmPageBackground/)
    assert.equal(chrome.includes("from 'lucide-react'"), false)
    assert.equal(chrome.includes('HomePlaneMark'), false)
    assert.equal(chrome.includes('<Plane '), false)
    assert.match(brand, /\/apple-touch-icon\.png/)
    assert.match(brand, /המסע של משפחת בן דוד/)
    assert.match(brandMark, /BRAND_ICON_SRC/)
    assert.match(brandMark, /data-home-brand="journal"/)
    assert.match(home, /<HomeBrandMark/)
    assert.match(home, /<HomeTitle>הטיולים שלנו<\/HomeTitle>/)
    assert.equal(home.includes('✈️'), false)
    assert.equal(home.includes('🚪'), false)
    assert.equal(home.includes('✉️'), false)
    assert.equal(home.includes('🔄'), false)
    const theme = src('../theme/warmTheme.ts')
    assert.match(theme, /Frank Ruhl Libre/)
    const bootTitle = html.match(/class="boot-title">([^<]+)</)
    assert.equal(bootTitle?.[1], 'הטיולים שלנו')
    assert.equal(html.includes('✈️ הטיולים שלנו'), false)
  })

  it('replaces the emoji toolbar with lucide actions and keeps the Gmail admin gate', () => {
    const cloud = src('../components/cloud/CloudSyncButton.tsx')
    const home = src('../pages/Home.tsx')
    const layout = src('../components/layout/AppLayout.tsx')
    assert.match(home, /variant="home"/)
    assert.equal(layout.includes('variant="home"'), false)
    assert.match(cloud, /variant = 'compact'/)
    assert.match(cloud, /LogOut/)
    assert.match(cloud, /RefreshCw/)
    assert.match(cloud, /Mail/)
    assert.equal(cloud.includes('🚪'), false)
    assert.equal(cloud.includes('fontSize: 14'), false)
    assert.match(cloud, /<span>התנתק<\/span>|התנתק/)
    assert.match(cloud, /onClick=\{syncNow\}/)
    assert.match(cloud, /onClick=\{syncGmail\}/)
    assert.match(cloud, /onClick=\{signOut\}/)
    assert.match(cloud, /isFamilyCatalogEmail\(user\?\.email\)/)
    assert.match(cloud, /showGmail &&/)
    assert.match(home, /isFamilyCatalogEmail\(user\?\.email\)/)
    assert.match(home, /משתמשים רשומים/)
    assert.match(home, /טיול חדש/)
    assert.match(home, /ייבא/)
  })

  it('does not revive the signed-in login preview', () => {
    const home = src('../pages/Home.tsx')
    const app = src('../App.tsx')
    assert.equal(home.includes('login-preview'), false)
    assert.equal(home.includes('תצוגת מסך כניסה'), false)
    assert.equal(home.includes('LogIn'), false)
    assert.equal(app.includes('login-preview'), false)
    assert.equal(app.includes('LoginPreview'), false)
    assert.equal(existsSync(join(root, 'src/pages/LoginPreview.tsx')), false)
  })
})
