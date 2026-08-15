/*
 * Teardown for the boot shell inlined at the bottom of index.html.
 *
 * The shell exists because the app bundle is large enough that on a cold
 * cellular launch there were several seconds with nothing on screen but the
 * cream background. It is plain HTML in the document, so it paints from the
 * service-worker precache in the first frame, long before any of this runs.
 *
 * Handing it off cleanly matters as much as showing it: fade out one frame
 * *after* React has committed and painted, so the two never overlap in a
 * half-drawn state, and never leave the shell on top of a live app.
 */

const FADE_MS = 220

let dismissed = false

/** Called once React has committed its first frame. Idempotent. */
export function dismissBootShell() {
  if (dismissed) return
  dismissed = true

  const shell = document.getElementById('boot')
  if (!shell) return

  // Two frames: the first lets React's commit actually paint, the second
  // starts the fade. Fading in the same frame as the commit shows the cream
  // shell dissolving over a still-blank app on slower devices.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      shell.setAttribute('data-done', '')
      const drop = () => shell.remove()
      shell.addEventListener('transitionend', drop, { once: true })
      // transitionend never fires under prefers-reduced-motion (no transition),
      // and is not guaranteed if the tab is backgrounded mid-fade.
      setTimeout(drop, FADE_MS + 100)
    })
  })
}

/*
 * Failsafe: if the bundle throws before React ever commits, the shell would
 * sit on top of a dead page forever and hide the error. Tear it down anyway
 * so whatever the app did manage to render becomes reachable.
 */
export function installBootShellFailsafe() {
  window.addEventListener('error', dismissBootShell)
  window.addEventListener('unhandledrejection', dismissBootShell)
}
