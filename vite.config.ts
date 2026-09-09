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
      // autoUpdate skipWaiting+clientsClaim so an iPhone PWA does not keep
      // serving a hung itinerary chunk until someone taps "רענן". iOS restores
      // the last URL; a frozen לוח זמנים never shows the prompt. See
      // PwaUpdatePrompt.tsx (visibility/pageshow poll + controllerchange reload).
      registerType: 'autoUpdate',
      // public/manifest.json stays the hand-maintained source of truth and is
      // already linked from index.html — don't let the plugin emit a second one.
      manifest: false,
      injectRegister: null,
      workbox: {
        // Bump when swapping home-screen icons so old precaches cannot keep
        // serving the Vite bolt (or any previous PNG) after a Pages deploy.
        cacheId: 'family-trip-planner-brand-v1',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Family itineraries are lazy-loaded after Google sign-in. Precaching
        // them would put usa-trip.json on every guest PWA install.
        globIgnores: ['**/familySeeds-*.js'],
        skipWaiting: true,
        clientsClaim: true,
        // index.html must never be served stale from the precache without a
        // revalidation path, or a deploy can strand users on an old build.
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // Heebo and Frank Ruhl Libre are served from public/fonts and picked up
        // by globPatterns above, so they precache alongside the shell. The old
        // runtimeCaching rules for fonts.googleapis.com / fonts.gstatic.com are
        // gone with the <link> that used to need them: a runtime cache can only
        // help on the *second* launch, and the first one was the problem.
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
      // myk-library doesn't tree-shake, so its Chart/CodeEditor components
      // dragged recharts + monaco into every launch as a 932kB eager chunk.
      // This app renders neither — see src/stubs/unused-vendor.tsx.
      // @tanstack/react-table is intentionally left alone: DataTable is used.
      'recharts': path.resolve(__dirname, './src/stubs/unused-vendor.tsx'),
      '@monaco-editor/react': path.resolve(__dirname, './src/stubs/unused-vendor.tsx'),
    },
  },
  server: {
    port: 3002,
    strictPort: true,
    open: true,
  },
})
