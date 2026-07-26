import styled from 'styled-components'
import { useRegisterSW } from 'virtual:pwa-register/react'

/*
 * The service worker precaches the app so it launches from the device instead
 * of the network. The trade-off is that a deploy no longer reaches users on
 * the next refresh — the cached build keeps serving until the new worker takes
 * over. So we register with `registerType: 'prompt'` (see vite.config.ts) and
 * surface the waiting build here, rather than swapping it in mid-session and
 * risking a reload while someone is editing a trip.
 *
 * Styled to match the sync toast in components/cloud/CloudSyncButton.tsx.
 */
const Toast = styled.div`
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #3b82f6;
  color: #fff;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1100;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
  max-width: 90vw;
  text-align: center;
`

const ToastButton = styled.button`
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.55);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: rgba(255, 255, 255, 0.32); }
`

const ToastDismiss = styled.button`
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  &:hover { color: #fff; }
`

export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <Toast role="status">
      <span>יש גרסה חדשה</span>
      <ToastButton onClick={() => void updateServiceWorker(true)}>רענן</ToastButton>
      <ToastDismiss onClick={() => setNeedRefresh(false)} aria-label="סגור">✕</ToastDismiss>
    </Toast>
  )
}
