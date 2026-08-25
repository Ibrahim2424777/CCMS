# DEPLOYMENT.md — CCMS Production Deployment

This document covers deploying CCMS to production at **$0/month**, for an internal
tool used by approximately 4–5 people. It assumes you've read `PROJECT_STATUS.md`
for what the application does and `README.md` for local development.

---

## 0. Deployment Progress (updated 2026-08-25)

**Deployment is complete and live.**

- [x] **Git repository**: `https://github.com/Ibrahim2424777/CCMS` (branch `main`).
- [x] **Database (Neon)**: migrated (`0001_init.sql`, `0002_fractional_bundles.sql`), first admin user bootstrapped via `db:seed-admin`.
- [x] **Backend (Render)**: live at `https://ccms-v3ov.onrender.com` (card verification completed — see §1, verification-only, no charge).
- [x] **Frontend (Cloudflare Pages)**: live at `https://ccms-4k9.pages.dev/`.
- [x] **CORS_ORIGIN**: set on Render to the Cloudflare Pages URL, confirmed via a live CORS preflight check.
- [x] **Session cookie cross-domain fix**: found live (login succeeded but the next request lost the session) and fixed — see §12 note below.
- [x] **End-to-end production test**: login, dashboard, and the full transaction lifecycle confirmed working in the browser against production.

The Neon connection string is not repeated in this file (it's a live credential); it's already configured in the Render dashboard's environment variables.

---

## 1. Chosen Architecture

```text
Browser
   ↓  (one origin: ccms.pages.dev)
Cloudflare Pages   (React static files + a Function proxying /api/* )
   ↓  (server-side, not subject to browser CORS/cookie rules)
Render   (Node.js / Express backend, $0/month)
   ↓
Neon   (managed PostgreSQL, $0/month)
```

**The Cloudflare Pages Function (`client/functions/api/[[path]].js`) is load-bearing, not optional.** It was added after a real production bug: with the frontend and backend on genuinely different domains, the session cookie is a cross-domain ("third-party") cookie from the browser's point of view. `SameSite=None; Secure` alone wasn't enough — Safari blocks third-party cookies by default regardless of `SameSite`, and Chrome/Firefox increasingly do too. One person's account worked fine (their specific browser/device combination happened not to block it); a friend's did not, with the exact same "login succeeds, then immediately bounces back to the login page" symptom. The Function proxies every `/api/*` call server-side to Render, so the browser only ever talks to one origin (`*.pages.dev`) and the cookie becomes an ordinary first-party cookie with no special-casing needed in any browser.

### Why this combination

| Component | Chosen | Why |
|---|---|---|
| Frontend | **Cloudflare Pages** | Unlimited bandwidth on the free tier, commercial use explicitly allowed (unlike Vercel's Hobby tier — see below), HTTPS by default, deploys straight from GitHub, no credit card required. |
| Backend | **Render** | Genuine free web service instance type (0.1 CPU/512MB, sleeps after 15 min idle — see §7), deploys from GitHub, environment variables/secrets in the dashboard, a real `PORT`/HTTPS setup out of the box. **Update, confirmed live during this phase's deployment attempt**: Render now requires a card on file at signup for identity/anti-abuse verification — this was not the case when Render first built its free-tier reputation, and third-party "no card required" articles about it are now out of date. Per Render's own billing model, this is a verification hold, not a charge: you remain on the Free instance type and are not billed unless you deliberately choose a paid plan. Still the strongest available option after evaluating the alternatives below. |
| Database | **Neon** | Free tier **never expires** and needs no credit card — unlike Render's free Postgres, which is hard-deleted 30 days after creation and is therefore unusable for data that must persist (this application's entire purpose). Neon's compute scales to zero after 5 minutes idle and resumes automatically on the next query, with no manual "un-pause" step required. |

**Why not the obvious alternatives:**
- **Vercel** was ruled out for the frontend: its free Hobby plan's Terms of Service explicitly restrict it to non-commercial personal use. CCMS is a real internal business tool, so deploying it on Vercel Hobby would be a ToS violation from day one.
- **Railway** was ruled out for the backend: as of this phase, Railway no longer has a genuine permanent free tier — it's a one-time $5 trial credit, then a paid plan. The phase brief explicitly says to only use Railway if a genuinely free option currently exists; it does not.
- **Koyeb** was tried and then ruled out for the backend during this phase's actual deployment attempt: Koyeb was acquired by Mistral AI in February 2026, and its dashboard now displays "Koyeb is joining Mistral! Stay tuned for a revamped Agentic experience" — signaling the general-purpose web-hosting product is being repositioned around Mistral's AI/agentic cloud strategy rather than continuing as a stable target for ordinary web apps. Not a safe bet for hosting real financial data long-term, free tier or not.
- **Fly.io** was ruled out: no longer has a real free tier as of 2026 — a short trial (2 VM-hours or 7 days) before a card is required and billing starts.
- **Zeabur** was ruled out: its own pricing page shows the real free plan is community-support-only (1 server); the usable tier is "$5/mo after a 14-day free trial" — the same trial-then-paid pattern as Railway/Fly.io, not genuinely free.
- **Northflank** was considered: also requires card verification for its best (always-on) free tier, so it offers no advantage over Render here.
- **Back4App Containers** was considered but not used: its own documentation doesn't state whether a card is required or give concrete resource limits, making it unverifiable enough to not be worth the risk over the better-known Render.
- **Render's own Postgres** was ruled out for the database specifically because of its 30-day hard expiration on the free tier — unacceptable for financial/inventory records that must persist indefinitely.

### Reasonable alternatives (if a provider's free tier changes)

- **Frontend**: Netlify (free tier explicitly allows commercial use; smaller bandwidth allowance via a credit system, still far more than 4–5 users need).
- **Database**: Supabase (free tier is also viable — 500MB storage, no expiration — but pauses fully after 7 days of *zero* database activity and needs a dashboard/scripted resume, vs. Neon's automatic resume on the next query. Neon is the safer default for a business tool that might go quiet over a slow weekend.)

---

## 2. Prerequisites

- A GitHub account and a repository containing this codebase (see §3).
- Free accounts on: [Neon](https://neon.tech) (no credit card), [Render](https://render.com) (requires a card for identity verification, but you stay on the Free instance type — see §1), [Cloudflare](https://pages.cloudflare.com) (no credit card).

---

## 3. Git Repository Setup

The project has been developed locally without commits so far. Before deploying:

```bash
# from the CCMS project root
git add .
git commit -m "Initial commit"
```

Then create an empty repository on GitHub (via github.com's "New repository" button — do **not**
initialize it with a README, since this repo already has one) and push:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

All three hosting providers below deploy directly from this GitHub repository.

---

## 4. Database Setup (Neon)

1. Sign up at [neon.tech](https://neon.tech) (GitHub sign-in is the fastest path).
2. Create a new project (any region close to your users; the free tier is one project's worth of usage across up to 100 projects, so defaults are fine).
3. From the Neon dashboard, copy the **connection string** — it looks like:
   ```text
   postgresql://<user>:<password>@<host>.neon.tech/<dbname>?sslmode=require
   ```
4. This is your production `DATABASE_URL`. Keep it secret — do not commit it anywhere.

### Run migrations against Neon

From your local machine (or any machine with Node installed and this repo checked out):

```bash
cd server
DATABASE_URL="<your neon connection string>" DB_SSL=true NODE_ENV=production npm run migrate
```

This creates all tables, constraints, indexes, and triggers (see `database/migrations/0001_init.sql`), and leaves `inventory` at zero and `users`/`shops`/`transactions` empty — the correct starting state for a real deployment.

**Do NOT run `npm run seed` against production.** That script inserts fake demo shops/transactions/users with a shared, publicly-documented password and is hard-blocked by the script itself if `NODE_ENV=production` is set (`seed.js` throws rather than run). It exists for local development only.

### Create the first admin login

Since there's no self-signup flow (users are created by an existing admin), a freshly-migrated production database has zero users — nobody can log in to create the first one. Use the dedicated bootstrap script instead:

```bash
cd server
DATABASE_URL="<your neon connection string>" DB_SSL=true NODE_ENV=production \
ADMIN_NAME="Your Name" ADMIN_EMAIL="you@yourdomain.example" ADMIN_PASSWORD="a-real-strong-password" \
npm run db:seed-admin
```

This creates exactly one `ADMIN` user and does nothing (safely, exit 0) if any user already exists — so it can't accidentally be re-run to create a second admin. Once you've logged in as this admin, use the app's own Users page to create accounts for the other 3–4 people.

---

## 5. Backend Deployment (Render)

1. Sign up at [render.com](https://render.com) and connect your GitHub account.
2. **New → Web Service**, select your CCMS repository.
3. Configure:
   - **Root Directory**: `server`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Add environment variables (Render's dashboard → Environment):
   ```text
   NODE_ENV=production
   DATABASE_URL=<your Neon connection string>
   DB_SSL=true
   SESSION_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
   CORS_ORIGIN=<your Cloudflare Pages URL, set after step 6 below>
   ```
   Leave `PORT` unset — Render injects it automatically and `server.js` already reads `process.env.PORT`.
5. Deploy. Render builds and starts the service, then gives you a URL like
   `https://ccms-backend.onrender.com`.
6. Verify: `https://ccms-backend.onrender.com/api/health` should return
   `{"status":"ok","db":"connected",...}`. If `db` shows `"error"`, double-check
   `DATABASE_URL` and that `DB_SSL=true` is set.

---

## 6. Frontend Deployment (Cloudflare Pages)

1. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com) and connect your GitHub account.
2. **Create a project → Connect to Git**, select your CCMS repository.
3. Configure:
   - **Root Directory**: `client`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Add a build-time environment variable:
   ```text
   VITE_API_BASE_URL=/api
   ```
   **A relative path, not the backend's own URL.** `client/functions/api/[[path]].js` (a Cloudflare Pages Function, already in the repo) proxies every `/api/*` request server-side to the real Render backend, so the browser only ever talks to one origin. This isn't a style preference - it's required for the app to work reliably across browsers. See §10's first troubleshooting row for why.
5. Deploy. Cloudflare gives you a URL like `https://ccms.pages.dev`.
6. **Go back to Render** and set `CORS_ORIGIN` to this exact URL (no trailing slash), then let Render redeploy (or trigger a manual redeploy). This is defense-in-depth for anyone hitting the Render URL directly - the proxied browser traffic doesn't actually depend on it, since a same-origin request through the proxy was never subject to CORS in the first place.

The `client/public/_redirects` file (`/* /index.html 200`) is already in the repo — this is required because the app uses client-side routing (`BrowserRouter`); without it, refreshing the browser on any page other than the homepage (e.g. `/transactions`) would 404 on static hosting. `_redirects` only applies to static asset requests that don't match a Function - `/api/*` is always handled by the Function first.

**If you ever change the Render backend's URL**, update `BACKEND_ORIGIN` at the top of `client/functions/api/[[path]].js` - it's a hardcoded constant there, not an environment variable (a Pages Function's env vars are a separate mechanism from Vite's build-time ones, and one fixed string didn't justify a second configuration path).

---

## 7. Free-Tier Limitations (documented, not hidden)

- **Render backend sleeps after 15 minutes of inactivity.** The first request after a quiet period takes an extra 30–60 seconds while it wakes up; subsequent requests are normal speed. For 4–5 people using this during business hours, this typically means one slow login in the morning, not a recurring problem.
- **Neon database compute scales to zero after 5 minutes of idle**, and resumes automatically on the next query — this happens transparently and is usually faster than Render's wake-up, so it's rarely the noticeable delay.
- **Neon free tier storage cap is 0.5GB.** For a 4–5 person shop's transaction/shop/inventory records, this is very unlikely to be a constraint for years of normal use (each transaction row is a few hundred bytes).
- **Neon free tier compute cap is 100 compute-hours/month.** Well within range for an internal tool with light, business-hours usage.
- **Render free web service**: 512MB RAM, 0.1 CPU, 100GB bandwidth/month, 750 compute-hours/month. All far more than 4–5 users generate.
- **Cloudflare Pages**: unlimited bandwidth on static assets, 500 builds/month — not a realistic constraint for a small internal app with occasional redeploys.

None of these limits are expected to be a real problem for this application's actual usage pattern. If usage ever grows well beyond 4–5 people, revisit this document before it becomes one.

---

## 8. Database Backups

Neon's free tier does **not** include automated long-term backups (paid tiers add point-in-time recovery). Since this application holds real financial and inventory records, do not treat deployment as complete without a backup habit.

### Manual backup (recommended: monthly, or before any risky change)

From any machine with `pg_dump` installed (comes with a local PostgreSQL install):

```bash
pg_dump "<your neon connection string>" -F c -f ccms_backup_$(date +%Y%m%d).dump
```

This produces a single compressed file containing the full schema and all data (users, shops, transactions, transaction_edits, inventory, sessions). Store it somewhere durable — a personal cloud drive is sufficient for a 4–5 person tool; this doesn't need enterprise backup infrastructure.

### Restoring from a backup

```bash
pg_restore -d "<a fresh/target neon connection string>" --clean --if-exists ccms_backup_YYYYMMDD.dump
```

### Lighter-weight alternative: plain-text SQL dump

```bash
pg_dump "<your neon connection string>" > ccms_backup_$(date +%Y%m%d).sql
```

Restore with:

```bash
psql "<target connection string>" < ccms_backup_YYYYMMDD.sql
```

---

## 9. Redeployment / Update Process

Both Render and Cloudflare Pages are connected directly to the GitHub repository:

```bash
git add .
git commit -m "your change"
git push
```

- **Render** automatically redeploys the backend on every push to `main` (or triggers a manual deploy from its dashboard if auto-deploy is off).
- **Cloudflare Pages** automatically rebuilds and redeploys the frontend the same way.

If a change includes a new database migration file under `database/migrations/`, run it against production **manually** after deploying the backend code that depends on it:

```bash
cd server
DATABASE_URL="<neon connection string>" DB_SSL=true NODE_ENV=production npm run migrate
```

(`migrate.js` tracks already-applied migrations in a `schema_migrations` table, so it's always safe to re-run — it only applies files it hasn't seen before.)

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend loads but login fails with a CORS error in the browser console | `CORS_ORIGIN` on Render doesn't exactly match the Cloudflare Pages URL | Check for a trailing slash mismatch or `http` vs `https`; update and let Render redeploy |
| `/api/health` returns `"db":"error"` | Wrong `DATABASE_URL`, or `DB_SSL` not set to `true` | Re-copy the connection string from Neon; confirm `DB_SSL=true` is set on Render |
| First request of the day is very slow, then fine | Render free tier woke from sleep | Expected — see §7 |
| Refreshing the browser on `/transactions` (or any non-home page) shows a 404 | `client/public/_redirects` missing from the deployed build, or Cloudflare Pages build output directory misconfigured | Confirm `_redirects` exists in the repo under `client/public/` and that the Pages project's output directory is `dist` |
| Can't log in on a fresh deployment — no accounts exist | Expected on a freshly-migrated database | Run the `db:seed-admin` bootstrap script (§4) |
| Login succeeds but the next request bounces back to the login page - possibly for some users/browsers but not others | **Hit this live during deployment (twice), already fixed in code both times.** First found: the session cookie's `SameSite` was `Lax`, which browsers withhold on cross-site requests since the frontend and backend are on different domains — fixed by setting `SameSite=None; Secure` in production (`server/src/config/session.js`). That alone wasn't sufficient, though: it worked on some devices/browsers but a friend's account failed the same way on theirs - modern browsers (Safari by default, increasingly Chrome/Firefox too) block or partition genuinely cross-domain ("third-party") cookies regardless of `SameSite`. The real fix was routing the frontend's API calls through `client/functions/api/[[path]].js`, a Cloudflare Pages Function that proxies `/api/*` to Render server-side - the browser then only ever talks to one origin, and the cookie is an ordinary first-party cookie in every browser. If this ever recurs: confirm `VITE_API_BASE_URL=/api` (a relative path, not the Render URL) was actually set at build time, and that the Function is deployed (check the Cloudflare Pages dashboard's Functions tab, or that `/api/health` on the pages.dev URL returns the backend's health response). |
| Session doesn't persist / logs out immediately after login in production | `SESSION_SECRET` not set | Confirm `SESSION_SECRET` is set on Render; both Cloudflare Pages and Render serve HTTPS by default, which `secure: true` cookies require in production |

---

## 11. Cost Verification

```text
Frontend (Cloudflare Pages):
$0/month

Backend (Render free web service):
$0/month

PostgreSQL (Neon free tier):
$0/month

Domain (provider subdomains: *.pages.dev / *.onrender.com):
$0/month

Estimated total:
$0/month
```

This is genuinely $0 under each provider's current free-tier terms as of this phase (verified via current provider documentation, not assumed from historical pricing) — not a "$0 to start, then surprise charges" arrangement. No credit card is required to create any of the three accounts.

**Optional future paid upgrades** (not needed for 4–5 users, listed for completeness):
- Render paid web service ($7/month+) removes the sleep-after-inactivity behavior.
- Neon paid tier adds point-in-time recovery backups and more storage/compute.
- A custom domain (not required by this phase) would cost whatever a registrar charges — unrelated to hosting cost.
