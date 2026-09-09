import { useRegisterSW } from 'virtual:pwa-register/react'

/*
 * The service worker precaches the app so it launches from the device instead
 * of the network. vite.config uses `registerType: 'autoUpdate'` so a new
 * worker skipWaiting + clientsClaim and reloads on `activated` (isUpdate).
 *
 * That is the iPhone recovery path. `prompt` + a "רענן" toast failed here:
 * iOS standalone restores the last URL, so swipe-away lands back on a hung
 * לוח זמנים that never paints the toast. The old waiting worker then keeps
 * serving the frozen itinerary chunk forever.
 *
 * iOS also throttles SW update checks. Poll on an interval, on foreground,
 * and on pageshow (bfcache / PWA restore) so the next launch actually sees
 * the deploy. Dev keeps the SW off (`devOptions.enabled: false`).
 */
const UPDATE_POLL_MS = 15 * 60 * 1000

export default function PwaUpdatePrompt() {
  useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => { void registration.update() }
      window.setInterval(check, UPDATE_POLL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('pageshow', check)
    },
  })
  return null
}
