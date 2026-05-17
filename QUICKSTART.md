# ⚡ Quickstart — Family Trip Planner

Permanent reference. Bookmark this file. Updated as the system evolves.

---

## 🌐 כתובות

| מה | URL |
|---|---|
| **האתר (פרוד)** | https://family-trip-planner-end.pages.dev |
| **API Worker** | https://family-trip-planner-api.bendod-family.workers.dev |
| Dev (מקומי) | http://localhost:3002 |

---

## 🔑 חשבונות + מפתחות

| שירות | פרטים |
|---|---|
| Cloudflare account | `Benbendod@gmail.com` (account ID `aa35da8a0f8aac69dc5a83953e5cda0a`) |
| Supabase project ref | `fmybfgryipzlfukirizp` |
| Supabase publishable key | `sb_publishable_vmVd1BccNla7ykG4SZZ3AQ_oGAcYGK1` (in client, OK to be public) |
| Supabase secret key | macOS Keychain: `service=family-trip-planner/supabase-service-key, account=benbendod@gmail.com` |
| Anthropic API key | macOS Keychain: `service=finance-dashboard, account=ANTHROPIC_API_KEY` |
| Gemini API key | macOS Keychain: `service=family-trip-planner/gemini-api-key, account=$USER` (Google Cloud project `956360985712`, free tier — 1,500 req/day) |
| Worker secrets (set) | `ANTHROPIC_API_KEY`, `SUPABASE_JWT_SECRET` (יתווסף `GEMINI_API_KEY` כשנפעיל Deals Agent) |
| workers.dev subdomain | `bendod-family` |

לרענן secret ב-Worker:
```bash
cd worker
echo -n "<value>" | npx wrangler secret put <SECRET_NAME>
```

---

## 🗄️ Supabase

### SQL Editor (להריץ מיגרציות)
https://supabase.com/dashboard/project/fmybfgryipzlfukirizp/sql/new

### Auth → URL Configuration (אם משנים URL פרוד)
https://supabase.com/dashboard/project/fmybfgryipzlfukirizp/auth/url-configuration

צריך כאן:
- **Site URL:** `https://family-trip-planner-end.pages.dev`
- **Redirect URLs:** `https://family-trip-planner-end.pages.dev/**`

### Auth → Providers (Google OAuth)
https://supabase.com/dashboard/project/fmybfgryipzlfukirizp/auth/providers

### API Keys + JWT settings
https://supabase.com/dashboard/project/fmybfgryipzlfukirizp/settings/api

### מיגרציות SQL — סטטוס

| קובץ | תיאור | סטטוס |
|---|---|---|
| `supabase/migrations/0001_init.sql` | סכמה ראשית (trips, days, events, ...) + RLS + realtime | ✅ הורץ |
| `supabase/migrations/0002_invite.sql` | פונקציות הזמנת חברים (invite_user_to_trip, list_trip_members, remove_user_from_trip) | ✅ הורץ |
| `supabase/migrations/0003_fix_rls_recursion.sql` | תיקון infinite-recursion ב-policies של trip_members | ✅ הורץ |
| `supabase/migrations/0004_save_trip_rpc.sql` | RPC `save_trip(jsonb)` שעוקף RLS issues | ⚠ **ממתין להרצה** |

איך להריץ מיגרציה:
```bash
# במחשב Mac:
pbcopy < supabase/migrations/0004_save_trip_rpc.sql

# פתח: https://supabase.com/dashboard/project/fmybfgryipzlfukirizp/sql/new
# Cmd+V → Run
```

---

## ☁️ Cloudflare

### Pages dashboard
https://dash.cloudflare.com/aa35da8a0f8aac69dc5a83953e5cda0a/pages/view/family-trip-planner

### Worker dashboard (logs, secrets)
https://dash.cloudflare.com/aa35da8a0f8aac69dc5a83953e5cda0a/workers-and-pages/view/family-trip-planner-api

### Deploy commands
```bash
# Build + deploy frontend (Pages)
npm run build
npx wrangler pages deploy dist --project-name=family-trip-planner --branch=main --commit-dirty=true

# Deploy backend (Worker)
cd worker
npx wrangler deploy

# Set/rotate Worker secrets
echo -n "<value>" | npx wrangler secret put ANTHROPIC_API_KEY
```

### Health check
```bash
curl https://family-trip-planner-api.bendod-family.workers.dev/health
# {"ok":true}
```
ÏÔ
### AI endpoints

| נתיב | מודל | חינם? |
|---|---|---|
| `POST /api/deals/scan` | Claude Opus 4.7 + web_search | לא — לפי שימוש |
| `POST /api/blog/digest` | Claude Opus 4.7 + web_search | לא |
| `POST /api/map/insights` | Claude Opus 4.7 + web_search | לא |
| `POST /api/itinerary/parse` | Claude Haiku 4.5 | לא (זול) |
| **`POST /api/gemini/deals`** | Gemini 2.5 Flash + Google Search grounding | ✅ 1500/יום |
| **`POST /api/gemini/blog`** | Gemini 2.5 Flash + Google Search grounding | ✅ 1500/יום |

ה-Gemini routes זהים ב-input/output ל-Claude variants — אפשר להחליף את ה-fetch בלקוח בלי שום שינוי במבנה הנתונים.

---

## 📧 Gmail Sync (אופציונלי)

לכפתור "Gmail" באפליקציה — Google Cloud Console:
1. https://console.cloud.google.com/apis/credentials
2. OAuth Consent Screen → Scopes → הוסף `https://www.googleapis.com/auth/gmail.readonly`
3. שמור
4. באפליקציה: צא והיכנס שוב — תופיע הסכמה ל-Gmail
5. כפתור "Gmail" יסרוק מיילים אחרונים וישייך אוטומטית לפי תאריכי הזמנה

---

## 👥 הזמנת אישתך לטיול

1. שלח לה: **https://family-trip-planner-end.pages.dev**
2. היא תיכנס עם **Google שלה** + תאשר
3. אצלך → כרטיס הטיול → אייקון 👥 כחול → הזן ה-Gmail שלה → "הזמן"
4. תוך כמה שניות הטיול יופיע אצלה דרך realtime

המגבלה: היא חייבת להיכנס **לפחות פעם אחת** לפני שאפשר להזמין (אחרת ה-RPC יחזיר `user_not_found`).

---

## 📱 התקנה כאפליקציה באייפון

1. פתח ב-**Safari** (חייב Safari, לא Chrome)
2. https://family-trip-planner-end.pages.dev
3. כפתור Share (☐↑) → "Add to Home Screen"
4. הוסף

---

## 🔍 איך לבדוק מצב מסד הנתונים

```bash
# כל הטיולים בענן (עוקף RLS עם service key)
SK=$(security find-generic-password -a "benbendod@gmail.com" -s "family-trip-planner/supabase-service-key" -w)
curl -s -H "apikey: $SK" -H "Authorization: Bearer $SK" \
  "https://fmybfgryipzlfukirizp.supabase.co/rest/v1/trips?select=id,name,destination,created_by,created_at"

# רשימת חברי טיול
curl -s -H "apikey: $SK" -H "Authorization: Bearer $SK" \
  "https://fmybfgryipzlfukirizp.supabase.co/rest/v1/trip_members?select=trip_id,user_id,role"

# Auth users
curl -s -H "apikey: $SK" -H "Authorization: Bearer $SK" \
  "https://fmybfgryipzlfukirizp.supabase.co/auth/v1/admin/users?per_page=10"
```

---

## 🛠️ פיתוח מקומי

```bash
# Frontend
npm install
npm run dev      # http://localhost:3002

# Worker (משתמש ב-.dev.vars)
cd worker
cp .dev.vars.example .dev.vars   # ערוך את הסודות
npm run dev      # http://localhost:8787

# Type-check
npm run build           # frontend
cd worker && npm run typecheck
```

---

## 🚨 דחוף — לטפל

- [ ] easyJet KBFMXH5 — טיסת חזור AMS→TLV 27/8 בוטלה. בחר Switch / Voucher / Refund
- [ ] להזמין רכב שכור בשדה Schiphol
- [ ] לוודא תאריך טיסת Aegean הלוך (היה עדכון זמן)

---

## 🔒 אבטחה — נקודה לטיפול

- service key של Supabase הופיע פעם בצ'אט (הוסר מהמסמך). **לרוטט ב-Supabase Settings → API → "Reset Service Role Key"**, ואז לעדכן ב-Keychain עם הערך החדש.

---

## 📂 מבנה הפרויקט

```
family-trip-planner/
├── src/                       # React frontend
│   ├── pages/                 # Home, Login, Quickstart, Dashboard, ...
│   ├── components/            # TripCard, CloudSyncButton, InviteMemberModal, ...
│   ├── lib/                   # supabase, AuthContext, tripRepo, gmailSync, ...
│   ├── stores/                # Zustand stores (tripStore, archiveStore, ...)
│   ├── services/              # gmail.ts, emailParser.ts, weatherService.ts
│   └── data/                  # holland-trip.json, demoData.ts
├── worker/                    # Cloudflare Worker — AI proxy (Claude API)
│   └── src/                   # index.ts, deals.ts, blog.ts, prompts.ts, auth.ts
├── supabase/migrations/       # SQL schema (sequential)
├── public/migrations/         # מועתק לשם כדי שדף Quickstart בתוך האפליקציה יקרא
├── trip-holland-aug2026.json  # נתוני הטיול הקרוב
└── QUICKSTART.md              # ← הקובץ הזה
```

---

## ✅ Checklist להגדרה ראשונית מאפס (אם פעם תפתח חשבון Cloudflare/Supabase חדש)

1. Cloudflare: `npx wrangler login`
2. רישום workers.dev subdomain (פעם אחת)
3. יצירת Supabase project + העתקת URL + publishable key + service key
4. הרצת `0001..0004.sql` ב-SQL Editor לפי הסדר
5. Auth → Providers → Google → enable + Client ID/Secret
6. Auth → URL Configuration → הוספת ה-Pages URL
7. `cp .env.example .env.local`, מילוי URL+anon key
8. `cp worker/.dev.vars.example worker/.dev.vars`, מילוי secrets
9. `wrangler secret put` לכל secret ב-Worker (ANTHROPIC_API_KEY, SUPABASE_JWT_SECRET; כש-Deals Agent יופעל — גם GEMINI_API_KEY)
10. `npm run build && wrangler pages deploy dist --project-name=...`
11. `cd worker && wrangler deploy`
ÏÔ