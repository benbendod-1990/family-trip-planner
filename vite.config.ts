import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Precache the app shell so a cold PWA launch loads from the device
      // instead of re-downloading the bundle over cellular every time. This
      // is what turns "icon on the home screen" into an app that actually
      // starts instantly (and works offline).
      registerType: 'prompt',
      // public/manifest.json stays the hand-maintained source of truth and is
      // already linked from index.html — don't let the plugin emit a second one.
      manifest: false,
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // index.html must never be served stale from the precache without a
        // revalidation path, or a deploy can strand users on an old build.
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Google Fonts stylesheet — revalidate in the background so the
            // first paint never blocks on the network.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // The font files themselves are immutable — cache them for a year.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Keep the SW out of `npm run dev` — a precaching SW during development
        // serves stale modules and makes HMR behave unpredictably.
        enabled: false,
      },
    }),
  ],
  base: process.env.GITHUB_ACTIONS ? '/myk-trip-plan/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3002,
    strictPort: true,
    open: true,
  },
})
