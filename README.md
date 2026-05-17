# ✈️ מסע משפחתי — Family Trip Planner

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![CI](https://github.com/drorgal/myk-trip-plan/actions/workflows/ci.yml/badge.svg)](https://github.com/drorgal/myk-trip-plan/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://drorgal.github.io/myk-trip-plan)

A modern, Hebrew-first family trip planning app — built with React, TypeScript, and [myk-library](https://www.npmjs.com/package/myk-library).

> תכנן את הטיול המשפחתי הבא שלך: לוח זמנים יומי, ניהול תקציב, טיסות, לינה, וסנכרון מ-Gmail.

**[🚀 Live Demo](https://drorgal.github.io/myk-trip-plan)**

---

## Features

- 📅 **Daily Itinerary** — timeline per day with categories and cost tracking
- 💰 **Budget Management** — planned vs. actual expenses, category breakdown, over-budget alerts
- ✈️ **Flights & Accommodation** — manage booking confirmations, cabin class, ratings
- 👨‍👩‍👧‍👦 **Family Members** — add travelers with emoji avatars
- 📧 **Gmail Sync** — automatically import flights, hotels, and events from confirmation emails
- 📤 **Export / Import** — save and share trip plans as JSON
- 📱 **PWA** — installable on mobile and desktop
- 🌐 **Hebrew RTL** — full right-to-left layout with Heebo font
- 💾 **Offline-first** — all data stored in localStorage, no backend needed

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [React 19](https://react.dev) + [TypeScript](https://typescriptlang.org) |
| Build | [Vite 8](https://vitejs.dev) |
| State | [Zustand](https://zustand-demo.pmnd.rs) + localStorage persist |
| Routing | [React Router v7](https://reactrouter.com) |
| UI Library | [myk-library](https://www.npmjs.com/package/myk-library) |
| Styling | [styled-components v6](https://styled-components.com) |
| Icons | [lucide-react](https://lucide.dev) |
| Dates | [date-fns](https://date-fns.org) with Hebrew locale |

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/drorgal/myk-trip-plan.git
cd myk-trip-plan

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
# → http://localhost:3001
```

---

## Gmail Sync Setup

Gmail sync reuses the Google OAuth token from the Supabase Google sign-in —
no extra client ID, no extra `.env` var. Setup:

1. In Supabase → Authentication → Providers → Google: enable Google provider
   and add the `https://www.googleapis.com/auth/gmail.readonly` scope to the
   "Additional scopes" field.
2. In Google Cloud Console → OAuth Consent Screen, ensure the same scope is
   listed.
3. Sign out and sign in again from the app — Google's consent screen will
   show the Gmail read-only permission. Click the "Gmail" button to scan.

Read-only access only — the app never modifies your inbox.

---

## Scripts

```bash
npm run dev      # Start dev server on http://localhost:3001
npm run build    # TypeScript check + Vite build
npm run lint     # ESLint
npm run preview  # Preview production build locally
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, code style, and PR guidelines.

---

## License

[MIT](./LICENSE) © 2026 drorgal
