import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path)
  assert.equal(buf[0], 0x89)
  assert.equal(buf.toString('ascii', 1, 4), 'PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('PWA brand icons', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8')) as {
    name: string
    short_name: string
    background_color: string
    theme_color: string
    lang: string
    dir: string
    start_url: string
    icons: Array<{ src: string; sizes: string; type: string }>
  }
  const html = readFileSync(join(root, 'index.html'), 'utf8')

  it('uses the Hebrew brand name and cream theme', () => {
    assert.equal(manifest.name, 'המסע של משפחת בן דוד')
    assert.equal(manifest.short_name, 'משפחת בן דוד')
    assert.equal(manifest.background_color, '#FBF3DF')
    assert.equal(manifest.theme_color, '#FBF3DF')
    assert.equal(manifest.lang, 'he')
    assert.equal(manifest.dir, 'rtl')
    assert.equal(manifest.start_url, '/')
  })

  it('points the manifest at PNG brand icons, not the Vite favicon', () => {
    const srcs = manifest.icons.map((icon) => icon.src)
    assert.equal(srcs.includes('/icon-192.png'), true)
    assert.equal(srcs.includes('/icon-512.png'), true)
    assert.equal(srcs.includes('/apple-touch-icon.png'), true)
    assert.equal(srcs.some((src) => src.includes('favicon.svg')), false)
    for (const icon of manifest.icons) {
      assert.equal(icon.type, 'image/png')
    }
  })

  it('ships square PNGs at the PWA sizes and a PNG favicon', () => {
    assert.deepEqual(pngSize(join(root, 'public/apple-touch-icon.png')), { width: 180, height: 180 })
    assert.deepEqual(pngSize(join(root, 'public/icon-192.png')), { width: 192, height: 192 })
    assert.deepEqual(pngSize(join(root, 'public/icon-512.png')), { width: 512, height: 512 })
    assert.deepEqual(pngSize(join(root, 'public/favicon.png')), { width: 32, height: 32 })
    assert.equal(existsSync(join(root, 'public/favicon.svg')), false)
  })

  it('links the PNG icons from index.html and drops the Vite SVG favicon', () => {
    assert.equal(html.includes('href="/favicon.png"'), true)
    assert.equal(html.includes('href="/icon-192.png"'), true)
    assert.equal(html.includes('href="/apple-touch-icon.png"'), true)
    assert.equal(html.includes('favicon.svg'), false)
    assert.equal(html.includes('apple-mobile-web-app-title" content="המסע של משפחת בן דוד"'), true)
  })
})
