# AGENTS.md — Family Trip Planner

Operating rules for any AI coding agent (Cursor, Grok, Claude Code, …) working in this repo.
Personal/family context lives in `AGENTS.local.md` (git-ignored). Raw historical notes: `.agent-memory/`.

---

## What this is

Hebrew-first, RTL family trip-planning PWA. Forked from `drorgal/myk-trip-plan` on 2026-04-24.
React 19 + TypeScript + Vite 8 (Rolldown) + Zustand + styled-components. Installable on iPhone — the PWA is the product, not a nice-to-have.

**Hard constraints (non-negotiable):**
- **Multi-user from day one.** Ben and his wife access the same trip from two iPhones. Never design a single-user flow. Shared trips assume 2+ authorized members.
- **Free tier only.** Cloudflare Workers + Pages, Supabase, Gemini 2.5 Flash. If a service starts charging, we switch.
- **Secure by default.** Secrets in macOS Keychain locally, env vars in prod. RLS on every table. AI keys proxied through the Worker, never in the client.

Pages: Dashboard, Budget, Family, FamilyProfile, Home, Itinerary, Map, Packing, Tasks, Travel, Documents.

---

## Deploy — read this before saying "it's live"

There are **two** deploy targets and they are not the same command.

1. **Frontend → Cloudflare Pages.** `npm run deploy` from the **repo root** (`npm run build && wrangler pages deploy ../dist --project-name=family-trip-planner --branch=main`).
   A `.git/hooks/pre-push` hook runs this on any push to `main`. The hook is **not** in git — reinstall with `scripts/install-pre-push-hook.sh` after a fresh clone. It lets the push proceed even when the deploy fails, so read its output.
2. **Worker → `family-trip-planner-api`.** NOT covered by the hook. `cd worker && ./node_modules/.bin/wrangler deploy`.
   Live at `https://family-trip-planner-api.bendod-family.workers.dev`.

**Deploy the Worker first** whenever the change adds a route the new frontend calls — otherwise the fresh UI 404s until the Worker catches up.

**Gotcha:** both the root and `worker/` define a `deploy` script and the root one itself does `cd worker`. If your shell is already in `worker/`, `npm run deploy` silently ships the API instead of the frontend. Always `cd /Users/bendavid/family-trip-planner` first, absolute path.

### "Deploy" means Ben can SEE it live

A successful wrangler upload is necessary, not sufficient. Verify protocol:

1. Deploy. Capture the bundle hash from the build output (`dist/assets/index-XXXXXXXX.js`).
2. `curl -s https://family-trip-planner-end.pages.dev/ | grep -oE "assets/index-[^\"]+\.js"` — must match. If not, wait 10–20s; the production alias lags the deployment by a few seconds.
3. Grep the live bundle for a unique string from your change (a Hebrew label, a new function name). A count of 0 means the build never picked it up.
4. Also grep for `localhost:8787` to confirm `.env.production`'s `VITE_AI_BASE_URL` got baked in and the app isn't calling a dev worker.
5. **Proactively warn about cache.** Browser: ⌘⇧R. iPhone PWA: swipe the app away and reopen. Worst case: DevTools → Application → Clear storage.

- The production alias is `https://family-trip-planner-end.pages.dev` — note the `-end` suffix. `main.` 404s. `family-trip-planner.pages.dev` (no `-end`) is an unrelated app owned by someone else.
- `<hash>.family-trip-planner-end.pages.dev` is the immutable per-deploy preview. Never point Ben there when he asked for prod.
- `Uploaded 0 files (N already uploaded)` is normal — Vite builds are deterministic. The deployment record still becomes production.
- `wrangler pages deployment list` labels *every* entry "Production". Don't read failure into it.
- When wrangler's OAuth expires (`Failed to fetch auth token: 400`), run `wrangler login` in the background (it blocks on the OAuth callback) and ask Ben to click Allow. Don't hand it back as a blocker.

---

## Data model discipline — the bugs that keep coming back

### Seed JSON is not live data
`src/data/*-trip.json` are **seeds only** — the first-load values. The live trip lives in localStorage (Zustand persist) and, when signed in, Supabase. They diverge the moment anything is edited.

Never answer "what's in Ben's trip" from a seed file. Ask him, or read localStorage `tripStore`, or read Supabase. When behavior looks wrong, the first hypothesis is "his live data differs from what I assume" — not "the code is buggy", and cache last.

### Never use a far-future `updatedAt`
Seeds once shipped `updatedAt: "2099-12-31T23:59:59.999Z"` to force-win the merge. This silently broke cross-device sync — a real edit stamped "now" is *older* than 2099, so `cloud.updatedAt > local.updatedAt` rejected it and the spouse never saw the change. All three merge sites use strict newer-wins: `tripRealtime.ts`, `AuthContext.tsx` (wireUp), `CloudSyncButton.tsx`.

Seed `updatedAt` must be a real past date (use `createdAt`). `normalizeSeedTimestamp()` in `src/lib/seedNormalize.ts` rewrites the sentinel at both entry boundaries — cloud read (`hydrateTrip` in `tripRepo.ts`) and local rehydrate (`tripStore` `onRehydrateStorage`). Auto-push on background/exit/online is `src/lib/tripLifecycleSync.ts`.

### Propagating a seed itinerary change to existing users
Editing the seed does **not** reach anyone who already has the trip. Propagation runs through the `onRehydrateStorage` one-shot in `src/stores/tripStore.ts`:

1. Add a **content staleness marker** — true for the old content, false for the new (e.g. a regex over venue names the new plan dropped). Verify the new seed contains none of those strings, so it's self-limiting.
2. **Swap `days` only**, never the whole trip — Ben's tasks and budget edits must survive. `return { ...t, days: freshSeed.days, updatedAt: now }`. Full replacement is reserved for fundamentally broken copies (wrong flight/dates/missing coords).
3. Stamp `updatedAt: new Date().toISOString()` so it beats an older cloud copy on the next newer-wins merge and reaches the spouse's device.

Seed **task** changes do not propagate this way — sync those separately.

---

## The Google Doc is the source of truth

Ben's non-negotiable: **every trip has a linked Google Doc, and it is the starting point.** The app's trip data and the Doc must never diverge.

- Holland Aug-2026 Doc: `https://docs.google.com/document/d/1H22xt-Q6VrHNQ4PMvF0UvSw7K5XBvVc5VzZgfyEeyjc/edit` (trip id `34980c90-bd66-4270-8d45-3e96787b07ef`). Also stored as `docUrl` in `src/data/holland-trip.json`.
- **Read** with no auth (link-shared): `curl -sL "https://docs.google.com/document/d/<ID>/export?format=txt"`. This is the reliable way to diff Doc ↔ app.
- **Write** via the repo's own MCP server, `tools/mcp-google-docs/` (zero-dependency JSON-RPC over stdio): `docs_read`, `docs_replace_text`, `docs_batch_update`. Creds in Keychain service `family-trip-planner-google-docs`; setup via `node tools/mcp-google-docs/setup-auth.mjs`. You can also `import` `tools/mcp-google-docs/google.mjs` from a one-off node script — faster for a single sync, no MCP restart needed.
- Doc layout: header, "must book now" list, a wide quick-reference table (row block per day), then "הפירוט היומי המלא" with prose per day. **The two halves can disagree — the table is fresher, the prose has the detail. Every day lives in both; patch both or the Doc self-contradicts.**
- `docs_replace_text` returns `occurrencesChanged: 0` on a miss instead of erroring — **always check it**.
- Inserted text is unstyled (bold/bullets/links lost) — a second `docs_batch_update` pass restores formatting.
- Line breaks inside a cell are vertical tabs (`\v`), not `\n`.
- Watch for genuinely duplicated cells (two identical drive-time cells) — `replace_text` hits both; disambiguate with explicit indices, ordering requests back-to-front.

**Sync is manual, by the agent.** There is no automated pull — no auto-pull on trip open, no UI trigger. (Earlier notes claiming `src/lib/tripDoc.ts`, a `/api/gemini/docs/pull` route and `0005_doc_url.sql` were wrong; those never existed.)

What *does* exist is a drift **detector**, not an auto-merger: Worker `POST /api/docs/pull` (`worker/src/tripDoc.ts`) proxies the txt export (browsers can't fetch docs.google.com — no CORS; the doc id is extracted by strict regex so it can't be used as an open proxy), `src/lib/tripDocDiff.ts` does **anchor matching** (venue-name anchors per day section → in-sync / `moved_in_doc` / `missing_from_doc` / `missing_from_app`), and `TripDocCard` on the Dashboard surfaces it. **It reports; a human applies.** Do not "finish" it into an auto-apply without asking Ben — a bad automatic merge weeks before the trip is worse than a stale line.

Regression bar for any change to the differ: the current seed must report **0** issues, and `git show cd8981e:src/data/holland-trip.json` must report **8 of 10 days drifted**.

**A Doc sync is not done until it is on `main` and deployed.** In 2026-07 a sync commit sat on the unmerged branch `feat/lifecycle-autosync-seed-fix` and prod served a wrong itinerary for ~7 weeks. Check `git merge-base --is-ancestor <sync-commit> main`. That branch also doesn't compile standalone — never merge it wholesale.

Ben's explicit decision: **do not auto-create a Doc** for new trips. Manual linking satisfies the invariant.

---

## Supabase migrations always need Ben

The agent **cannot** apply SQL. The `supabase-service-key` in Keychain reaches PostgREST and Storage but returns **401 on the Management API**, which is the only DDL path. `scripts/apply-migration.sh` needs `SUPABASE_ACCESS_TOKEN` (`sbp_…`) in `.env.supabase`, which doesn't exist. No `supabase` CLI, no `psql`, no `pg` driver on this machine.

Write the `.sql` file, make it **idempotent** (`drop policy if exists`, `create table if not exists`, `on conflict do nothing`), and hand it to Ben to paste into the dashboard SQL editor — **say so up front**, not after trying and stalling.

---

## Gmail sync failures are almost never code

`syncFromGmail` → `fetchGmailAccessToken` returning 412 means Google expired the refresh token. The OAuth consent screen is in **Testing** status, which caps refresh tokens at **7 days**.

- Fix (Ben only): sign out, sign in with Google, re-approve. OAuth uses `access_type=offline` + `prompt=consent`, so re-login mints a fresh token. No redeploy.
- Permanent fix: publish the OAuth consent screen ("In production").
- The UI already handles this: `fetchGmailAccessToken` throws a typed `GmailAuthError` on 412 and `CloudSyncButton` shows a calm "חבר מחדש את Gmail" reconnect toast.
- The same 7-day expiry applies to the `google-docs` MCP credentials.

---

## UI / performance rules

**The CSS base must stay cream.** `src/index.css` base is `#FBF3DF`, text `#2A2013`; `index.html` carries a matching inline `<style>html{background-color:#FBF3DF}</style>` + `theme-color`; `public/manifest.json` uses the same `background_color`. The app is client-rendered, so the stylesheet is what paints for the seconds before React mounts — a dark base showed a near-black "broken" screen on every cold PWA launch. Keep those four values in sync. Dark is **opt-in** via `.dark-page` (only `FamilyProfile` uses it). Never reintroduce an app-wide dark `body` rule.

**Startup.** Service worker via `vite-plugin-pwa` (`registerType: 'prompt'`, `manifest: false` — the hand-written `public/manifest.json` is the source of truth, `injectRegister: null`); update toast in `src/components/pwa/PwaUpdatePrompt.tsx`. Route-level `lazy()` in `src/App.tsx` (Home + Login stay eager). `index.html` carries an inline JS-free boot skeleton (`#boot`) faded out by `src/boot.ts` — that is what actually killed the launch flash. Fonts are self-hosted in `public/fonts/`; do not reintroduce a render-blocking `fonts.googleapis.com` link.

- `Home` is the eager `start_url`, so **anything it or `TripCard` statically imports lands in the entry bundle** — that's how Supabase got there (`TripCard → InviteMemberModal → tripRepo`). Check `dist/index.html`'s `modulepreload` list after touching those files.
- **`myk-library` does not tree-shake and is the remaining wall.** One `Button` import pulls a ~1.18MB bundle; its `dist/index.es.js` statically imports recharts, monaco and tanstack-table, none of which this app uses. It's a published package — don't burn time re-diagnosing. The only lever is replacing/forking it.
- Vite 8 uses Rolldown: `build.rollupOptions.output.manualChunks` in **object** form is rejected. Use a function or `advancedChunks`.

**Navigation.** `<BrowserRouter unstable_useTransitions={false}>` in `src/main.tsx` — React Router v7 wraps navigations in `startTransition` by default, which keeps the OLD route on screen until the new one commits, producing a page flash on mobile. Safe here because no route component suspends. Ruled out and not worth re-chasing: the splash/RequireAuth loader, body background, `useBreakpoint`, the service worker, card animations.

The dev server runs on **:3002** (`npm run dev`). :3001 is an unrelated Express server.

---

## Conventions

- Hebrew RTL throughout. UI strings in Hebrew; code and comments in English.
- Secrets: macOS Keychain locally (`scripts/setup-keychain.sh`, `scripts/dev-vars-from-keychain.sh`, `scripts/wrangler-secrets-from-keychain.sh`). Never in code. `.env.supabase` is git-ignored.
- Medical or otherwise sensitive documents never go into the repo (drafts live in `~/Downloads/`).
- MCP: `.mcp.json` (Claude Code) and `.cursor/mcp.json` (Cursor) both declare the `google-docs` stdio server. Keep them in sync.
