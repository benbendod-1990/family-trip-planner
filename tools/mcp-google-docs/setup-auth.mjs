#!/usr/bin/env node
// One-time OAuth setup for the Google Docs MCP server.
//
// Run:  node tools/mcp-google-docs/setup-auth.mjs
//
// Prompts for the OAuth client id/secret (only the first time), opens Google's
// consent screen, catches the redirect on a loopback port, and stores the
// refresh token in the macOS Keychain. Re-run it any time the token expires.

import { createServer } from 'node:http'
import { createInterface } from 'node:readline/promises'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readSecret, writeSecret, SERVICE } from './keychain.mjs'
import { SCOPE } from './google.mjs'

const PORT = 47813
const REDIRECT_URI = `http://127.0.0.1:${PORT}`

const rl = createInterface({ input: process.stdin, output: process.stdout })

async function prompt(label, account, existing) {
  // When stdin isn't a terminal (e.g. Claude Code running this for you), we
  // can't ask anything — reuse what's in the Keychain or explain how to put it
  // there. This keeps the client secret out of any transcript.
  if (!process.stdin.isTTY) {
    if (existing) {
      console.log(`${label}: using the value already in the Keychain.`)
      return existing
    }
    throw new Error(
      `${label} is not in the Keychain and stdin is not interactive.\n` +
        `Store it yourself (the value is never echoed), then re-run:\n\n` +
        `  security add-generic-password -U -s ${SERVICE} -a ${account} -w`,
    )
  }
  if (existing) {
    const keep = await rl.question(`${label} already stored. Reuse it? [Y/n] `)
    if (!keep.trim() || /^y/i.test(keep)) return existing
  }
  let value = ''
  while (!value) value = (await rl.question(`${label}: `)).trim()
  return value
}

/** Waits for Google to redirect back with ?code=... and hands it over. */
function waitForCode(expectedState) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const state = url.searchParams.get('state')

      const done = (message) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          `<html dir="rtl"><body style="font-family:system-ui;padding:3rem;text-align:center">
             <h2>${message}</h2><p>אפשר לסגור את הטאב הזה.</p></body></html>`,
        )
        server.close()
      }

      if (error) {
        done('ההרשאה נדחתה ❌')
        return reject(new Error(`Google returned error=${error}`))
      }
      if (!code) {
        // Browsers also request /favicon.ico here; ignore anything without a code.
        res.writeHead(204)
        return res.end()
      }
      if (state !== expectedState) {
        done('State mismatch ❌')
        return reject(new Error('state mismatch — possible CSRF, aborting'))
      }
      done('התחברת בהצלחה ✅')
      resolve(code)
    })
    server.on('error', reject)
    server.listen(PORT, '127.0.0.1')
  })
}

async function main() {
  console.log(`\nGoogle Docs MCP — OAuth setup`)
  console.log(`Secrets are stored in the login Keychain under "${SERVICE}".\n`)
  console.log('If you have not created the OAuth client yet:')
  console.log('  1. https://console.cloud.google.com/apis/library/docs.googleapis.com → Enable')
  console.log('  2. APIs & Services → Credentials → Create credentials → OAuth client ID')
  console.log('  3. Application type: **Desktop app**  (loopback redirect works automatically)')
  console.log('  4. Copy the client ID and client secret below.\n')

  const clientId = await prompt('Client ID', 'client_id', readSecret('client_id'))
  const clientSecret = await prompt('Client secret', 'client_secret', readSecret('client_secret'))
  writeSecret('client_id', clientId)
  writeSecret('client_secret', clientSecret)

  const state = randomBytes(16).toString('hex')
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent', // force a refresh_token even on re-auth
      state,
    })

  console.log('\nOpening the consent screen in your browser…')
  console.log(`If it does not open, paste this:\n${authUrl}\n`)
  execFile('open', [authUrl], () => {})

  const pending = waitForCode(state)
  const code = await pending

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${body.slice(0, 400)}`)

  const tok = JSON.parse(body)
  if (!tok.refresh_token) {
    throw new Error(
      'Google did not return a refresh_token. Revoke the app at ' +
        'https://myaccount.google.com/permissions and run this again.',
    )
  }
  writeSecret('refresh_token', tok.refresh_token)

  console.log('\n✅ Refresh token stored in Keychain.')
  console.log('   Restart Claude Code so it picks up the google-docs MCP server.\n')
}

main()
  .catch((err) => {
    console.error(`\n❌ ${err.message}\n`)
    process.exitCode = 1
  })
  .finally(() => rl.close())
