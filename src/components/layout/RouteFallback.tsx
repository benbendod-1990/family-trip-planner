import { Loader2 } from 'lucide-react'
import styled from 'styled-components'

/*
 * Shown while a lazily-loaded route chunk arrives. It sits on the same warm
 * background as the rest of the app so a slow chunk reads as "loading", never
 * as a different broken screen — the same reason src/index.css keeps the base
 * cream. After the first visit the service worker serves chunks from the
 * device, so this is usually invisible.
 */
const Wrap = styled.div`
  min-height: 60vh;
  display: grid;
  place-items: center;
  color: #8F7B5C;
`

export default function RouteFallback() {
  return (
    <Wrap>
      <Loader2 className="spin" size={28} aria-label="טוען" />
    </Wrap>
  )
}
