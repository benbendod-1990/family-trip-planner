import { defaultTheme } from 'myk-library'

/**
 * Warm illustrated "trip journal" theme — cream background, terracotta accent,
 * standard (non-inverted) gray direction so gray[900] is the darkest text color.
 * Scoped to the Dashboard route for now; see feat/warm-illustrated-redesign.
 */
export const warmTheme = {
  ...defaultTheme,
  colors: {
    ...defaultTheme.colors,
    primary: {
      50: '#FDF3E3',
      100: '#FBE6C3',
      200: '#F5CE8F',
      300: '#EDB35C',
      400: '#E2953A',
      500: '#D67A1F',
      600: '#B5630F',
      700: '#8F4C0B',
      800: '#6B3708',
      900: '#472405',
    },
    gray: {
      50: '#FBF3DF',
      100: '#F5E9CC',
      200: '#EADCB5',
      300: '#D9C79A',
      400: '#B8A47E',
      500: '#8F7B5C',
      600: '#6E5C42',
      700: '#54452F',
      800: '#3D3120',
      900: '#2A2013',
    },
    white: '#FFFDF7',
  },
  shadows: {
    ...defaultTheme.shadows,
    sm: '0 1px 3px rgba(120,90,40,0.10)',
    md: '0 6px 16px rgba(120,90,40,0.14)',
    lg: '0 14px 28px rgba(120,90,40,0.18)',
    xl: '0 24px 48px rgba(120,90,40,0.22)',
  },
  typography: {
    ...defaultTheme.typography,
    fontFamily: {
      ...defaultTheme.typography.fontFamily,
      sans: "'Heebo', 'Segoe UI', Arial, sans-serif",
    },
  },
}

/** Decorative Hebrew/Latin serif used for hero headings and the countdown number. */
export const warmDisplayFont = "'Frank Ruhl Libre', 'Heebo', serif"

/** Page background — one step deeper than card surfaces (theme.colors.white). */
export const warmPageBackground = '#FBF3DF'

/** Per-destination accent palette, cycled by stop index (matches the reference design's colored pins). */
export const destinationPalette = [
  { name: 'pink', bg: '#F8DDE4', fg: '#D9607E' },
  { name: 'green', bg: '#E4EFD9', fg: '#7FA860' },
  { name: 'purple', bg: '#E9E1F5', fg: '#8F6FC2' },
  { name: 'orange', bg: '#FBE7CE', fg: '#D68A3A' },
] as const

export function destinationColor(index: number) {
  return destinationPalette[index % destinationPalette.length]
}
