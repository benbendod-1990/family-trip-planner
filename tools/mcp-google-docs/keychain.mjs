// macOS Keychain accessor for the Google Docs MCP server.
//
// Same pattern Ben uses in finance-dashboard: secrets never touch the repo or
// env files, they live in the login keychain and unlock with the OS.

import { execFileSync } from 'node:child_process'

export const SERVICE = 'family-trip-planner-google-docs'

/** Returns the stored secret, or null if it was never set. */
export function readSecret(account) {
  try {
    return execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/** Writes (or overwrites, via -U) a secret. */
export function writeSecret(account, value) {
  execFileSync('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', account, '-w', value], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}

export function deleteSecret(account) {
  try {
    execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', account], {
      stdio: 'ignore',
    })
  } catch {
    /* not present — fine */
  }
}
