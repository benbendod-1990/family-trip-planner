import styled from 'styled-components'
import { BRAND_ICON_SRC, BRAND_NAME } from '@/lib/brandAssets'

/**
 * Scrapbook polaroid of the PWA brand photo — same asset as the login gate.
 * Replaces the plain airplane tile in the signed-in Home header.
 */
const Polaroid = styled.figure`
  grid-area: mark;
  position: relative;
  flex-shrink: 0;
  margin: 4px 0 0;
  width: 96px;
  padding: 7px 7px 16px;
  background: ${({ theme }) => theme.colors.white};
  border-radius: 3px;
  box-shadow:
    0 1px 0 rgba(255, 253, 247, 0.95) inset,
    0 1px 2px rgba(120, 90, 40, 0.08),
    0 12px 28px rgba(80, 56, 20, 0.16);
  transform: rotate(-2.4deg);
  z-index: 1;

  @media (min-width: 768px) {
    width: 112px;
    padding: 8px 8px 18px;
  }

  @media (prefers-reduced-motion: reduce) {
    transform: none;
  }
`

const Tape = styled.div`
  position: absolute;
  top: -9px;
  inset-inline-end: 16px;
  width: 46px;
  height: 16px;
  border-radius: 1px;
  background: repeating-linear-gradient(
    90deg,
    rgba(196, 92, 62, 0.7) 0 7px,
    rgba(196, 92, 62, 0.38) 7px 9px
  );
  box-shadow: 0 2px 4px rgba(80, 56, 20, 0.18);
  transform: rotate(18deg);
  pointer-events: none;
`

const Well = styled.div`
  position: relative;
  overflow: hidden;
  border-radius: 5px;
  background: ${({ theme }) => theme.colors.gray[100]};
  box-shadow: 0 0 0 1px rgba(181, 99, 15, 0.16);
`

const Stamp = styled.div`
  position: absolute;
  inset: 3px;
  border-radius: 3px;
  border: 1px dashed rgba(181, 99, 15, 0.38);
  pointer-events: none;
  z-index: 1;
`

const Photo = styled.img`
  display: block;
  width: 82px;
  height: 82px;
  object-fit: cover;

  @media (min-width: 768px) {
    width: 96px;
    height: 96px;
  }
`

export function HomeBrandMark() {
  return (
    <Polaroid data-home-brand="journal">
      <Tape aria-hidden />
      <Well>
        <Photo
          src={BRAND_ICON_SRC}
          width={180}
          height={180}
          alt={BRAND_NAME}
        />
        <Stamp aria-hidden />
      </Well>
    </Polaroid>
  )
}
