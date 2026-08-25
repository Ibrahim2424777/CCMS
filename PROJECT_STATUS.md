# PROJECT_STATUS.md

_Last updated: 2026-08-25_

## Current Phase

**Phase 10 — Free Production Deployment and Production Readiness**
Status: **Complete and live.** Deployed to Cloudflare Pages (frontend) + Render (backend) + Neon (PostgreSQL), all $0/month. One real production-only bug was found and fixed live during deployment: the session cookie needs `SameSite=None` (not `Lax`) because the frontend and backend are on different domains — `Lax` silently withheld the cookie from cross-site requests, bouncing users back to login right after a successful sign-in. Full detail below.

**Post-launch changes (2026-08-25)**: added support for partial/fractional bundle quantities (e.g. half a Rs. 100 bundle = Rs. 5,000), and manual inventory add/remove (admin-only) since inventory otherwise starts at zero with no way to stock it. Both are real business requirements discovered after go-live, not part of the original Phase 10 scope. See "Fractional Bundle Support" and "Manual Inventory Adjustment" below.

## Completed Phases

- **Phase 0 — Architecture & Implementation Plan** (2026-08-13): `ARCHITECTURE.md`, full technical design. Design-only.
- **Phase 1 — Project Setup and Database** (2026-08-13): Scaffolding, PostgreSQL schema (6 tables), migrations, seed data, health endpoint, frontend startup page.
- **Phase 2 — Authentication and Authorization** (2026-08-13): Sessions, login/logout/me, `requireAuth`/`requireRole`, protected frontend routing, admin user-management foundation.
- **Phase 3 — Shops and Core Transaction Engine** (2026-08-13): Shops API (CRUD + search/autocomplete), transaction creation API (atomic, inventory-checked), first transaction form in the UI.
- **Phase 4 — Inventory Management** (2026-08-13): Inventory API/page; atomic transaction edit (restore→validate→deduct→recalculate) and soft-delete with inventory restoration; shared `inventoryService`.
- **Phase 5 — Transaction History and Complete CRUD** (2026-08-13): Complete transaction management interface — history table, server-side search/shop filter/date filter/sort/pagination, View/Edit/Delete with a confirmation dialog, global toast notifications. Found and fixed a `transaction_date` timezone bug in the API layer.
- **Phase 6 — Main Dashboard** (2026-08-20): `GET /api/analytics/dashboard` (one optimized query for Today/Week/Month + inventory + profit trend + recent transactions); made the real landing page, replacing the Phase-1 placeholder.
- **Phase 7 — Analytics and Reporting** (2026-08-20): `GET /api/analytics/summary` — date-range-scoped reporting (8 master-context ranges) with totals, averages, top shops, bundle distribution, and an adaptively-grouped trend. A new Analytics page with a range selector and 4 charts.
- **Phase 8 — UI/UX and Responsive Design** (2026-08-20): Frontend-only visual/UX pass across every page, a real responsive nav, and thorough breakpoint testing.
- **Phase 9 — Security, Validation and Production Hardening** (2026-08-20): Full security/reliability audit; two real bugs fixed, one hardening addition.
- **Phase 10 — Free Production Deployment and Production Readiness** (2026-08-24, in progress): Deployment architecture chosen and documented, codebase made deployment-ready, one real bug fixed (SPA routing fallback). Actual hosting-provider deployment pending the account owner's action. Full detail below.

## Implementation Status

| Layer | Status |
|---|---|
| Database | No schema change. Migration/seed/backup process documented and verified locally; production bootstrap (`db:seed-admin`) added. |
| Backend (API) | One real fix (SPA-unrelated to backend, see below), one addition: graceful `SIGTERM`/`SIGINT` shutdown (closes the HTTP server and DB pool cleanly) so Render can redeploy without dropping in-flight requests or leaking connections. No business logic touched. |
| Frontend | One real bug fixed: missing SPA routing fallback (`client/public/_redirects`) — without it, refreshing the browser on any non-home route 404s on static hosting. Production build verified clean. |
| Deployment | Architecture researched and chosen; `DEPLOYMENT.md` and `README.md` written; **not yet actually deployed** — see Known Issues. |
| Tests | **153/153 passing**, unchanged from Phase 9 (no test-relevant logic changed this phase). |

## Research: Current (2026) Free-Tier Hosting Options

Verified against current provider documentation and pricing pages rather than assumed from memory, since free-tier terms change over time:

- **Vercel** (frontend) — ruled out. Its Hobby (free) plan's Terms of Service explicitly restrict it to non-commercial personal use; CCMS is a real internal business tool.
- **Railway** (backend) — ruled out. No longer has a genuine permanent free tier as of 2026 (one-time $5 trial credit, then paid) — the phase brief explicitly says to only use it if a genuinely free option currently exists.
- **Render Postgres** (database) — ruled out. Free tier is hard-deleted 30 days after creation; unacceptable for financial/inventory records that must persist indefinitely.
- **Chosen**: **Cloudflare Pages** (frontend — unlimited bandwidth, commercial use explicitly allowed, no card required), **Render** (backend — genuine free web service, no card required, sleeps after 15 min idle), **Neon** (database — free tier never expires, no card required, scales to zero after 5 min idle and auto-resumes on the next query with no manual step).
- **Alternatives noted** in `DEPLOYMENT.md` in case a provider's terms change: Netlify (frontend), Supabase (database — viable, but pauses fully after 7 days of *zero* activity vs. Neon's automatic per-query resume).

Full reasoning and comparison table in `DEPLOYMENT.md` §1.

## What Changed

**SPA routing fallback, fixed** (new `client/public/_redirects`): the app uses `react-router-dom`'s `BrowserRouter`, so a page refresh (or a bookmarked link, or a shared URL) on any route other than the homepage — `/transactions`, `/analytics`, etc. — would 404 on static hosting, since there's no `index.html` file at that literal path. Confirmed by inspecting the production build output and Cloudflare Pages' static-hosting behavior. Fixed with the standard `/* /index.html 200` rewrite rule (Cloudflare Pages and Netlify both honor this file); verified it's correctly copied into `client/dist/` by the production build.

**Graceful shutdown, added** (`server/server.js`): Render (and most PaaS hosts) sends `SIGTERM` before stopping or restarting a container for a redeploy. Previously the process would be killed immediately, mid-request, with the database pool's connections left dangling. Now `SIGTERM`/`SIGINT` trigger `server.close()` (let in-flight requests finish, stop accepting new ones) followed by `pool.end()` (close DB connections cleanly) before exiting. This is standard Node.js production practice; verified the process starts and serves `/api/health` correctly under `NODE_ENV=production` locally. The signal-handling itself could not be fully verified on this Windows/Git-Bash development machine — `kill` here does not deliver a true POSIX signal the way Render's Linux containers do — but the implementation is the standard, correct pattern for this exact scenario.

**Production admin bootstrap, added** (new `server/src/db/seedAdmin.js`, `npm run db:seed-admin`): a freshly-migrated production database has zero users and no self-signup flow, so nobody could log in to create the first account. This script creates exactly one `ADMIN` user from `ADMIN_NAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` environment variables, and safely no-ops (exit 0) if any user already exists — it can't be accidentally re-run to create a second admin. Distinct from `seed.js`, which is explicitly for local development only and already hard-refuses to run when `NODE_ENV=production`.

**`.env.example` files (both `server/` and `client/`), expanded**: previously only documented local development values. Now also document the production values each variable should hold (with real generation commands, e.g. for `SESSION_SECRET`), commented out so they can't be accidentally used locally.

**`README.md`, created** (root — didn't exist before): Local Development and Production Deployment sections as the phase brief requires, the latter pointing to `DEPLOYMENT.md` for full detail.

**`DEPLOYMENT.md`, created**: complete step-by-step production deployment guide — architecture and rationale, prerequisites, git/GitHub setup, database setup and migration process, backend deployment, frontend deployment, free-tier limitations, backup/restore procedure, redeployment process, a troubleshooting table, and cost verification.

**No application/business logic changed.** Per the brief's explicit instruction not to modify the existing architecture to fit a hosting provider: PostgreSQL, Express, and React are all unchanged; the existing `DATABASE_URL`/`DB_SSL`/`CORS_ORIGIN`/`SESSION_SECRET` environment-variable pattern (already present from earlier phases) turned out to already fit this deployment architecture with no changes needed.

## Local Verification Performed

- **Production frontend build**: `npm run build` in `client/` succeeds cleanly (695KB main bundle, gzipped 207KB — a size *advisory*, not an error; code-splitting was deliberately not added, since it would be unnecessary complexity for a 4–5 user internal tool per the brief's §20).
- **Production backend startup**: started with `NODE_ENV=production` against a real Postgres connection; `/api/health` returned `{"status":"ok","db":"connected",...}`.
- **Full test suite**: 153/153 passing, re-run after all changes above (later 156/156 after the fractional-bundle change below).

## Fractional Bundle Support (post-launch, 2026-08-25)

A real business need surfaced after go-live: shops don't always take a full bundle — e.g. half a Rs. 100 bundle (50 notes) = Rs. 5,000. Bundle quantities on all three denominations now accept partial amounts, in increments of 0.01 (one note out of a 100-note bundle) — no coarser restriction (e.g. halves-only), since a real cash count can land on any note count.

**What changed:**
- **Database** (new migration `0002_fractional_bundles.sql`): `transactions.bundles_10/50/100`, `transaction_edits.previous_bundles_10/50/100`, and `inventory.bundle_count` all moved from `INTEGER` to `NUMERIC(10,2)`. Existing whole-number data converted losslessly; all existing `CHECK` constraints stayed attached and valid across the type change with no rewrite needed.
- **A real, subtle bug caught and fixed before it could ship**: `pg`'s default parser returns `NUMERIC` columns as JS strings (to avoid float precision loss on values a double can't represent exactly). The transaction-edit flow reads a transaction's old bundle quantities back from the database and adds them to currently-available inventory (`available + oldBundles`) to compute what would be free after a conceptual "restore." With string values, JS's `+` operator does *string concatenation*, not addition — `"12.50" + "2.50"` becomes `"12.502.50"`, not `15`. This would have silently corrupted inventory math on every edit of a fractional-quantity transaction. Fixed at the root by adding a global `NUMERIC` type parser in `server/src/config/db.js` (parsing to a JS float), matching the same pattern already used for a `DATE` parsing fix from an earlier phase — every numeric value read from the database is now a real JS number everywhere in the app, not just at this one call site.
- **Validation** (`server/src/controllers/transactionController.js`): `validateBundleQuantity` now accepts any non-negative number in multiples of 0.01, with a generous upper bound (100,000) for the same "clean 400 instead of a raw DB error" reasoning as the earlier `parseId` fix.
- **Frontend** (`TransactionForm.jsx`): bundle quantity inputs now accept decimals (`step="0.5"` for convenient arrow-key increments, free typing for any valid precision), with a hint label. The live preview and all financial-value display code needed no changes — they already handled arbitrary numbers, not just integers.
- **No business rule changed**: commission-rate logic (3% only when exclusively Rs. 10, else 1.5%) applies identically to fractional quantities, since it only checks which denominations are present (`> 0`), not whole-number-ness.

**Verified**: 3 new automated tests (fractional create, fractional inventory deduction, and a fractional edit specifically exercising the restore-math bug above) plus a full live HTTP smoke test against a running local server — create → inventory decreases by exactly 0.5 → edit to 1.25 → inventory net-adjusts by exactly -0.75 → delete → inventory restores to exactly the original value — with explicit `typeof` checks confirming every value round-trips as a JSON number, never a string. Full 156-test suite passing.

## Manual Inventory Adjustment (post-launch, 2026-08-25)

Inventory previously only moved via the transaction pipeline (deduct on create, restore on edit/delete) — starting at zero with no way to actually stock it. Admins can now directly add or remove stock per denomination (e.g. an initial stock count, or correcting after a physical recount).

**What changed:**
- **New endpoint**: `POST /api/inventory/adjust` (`{ bundle_type, delta }`, signed — positive adds, negative removes), **ADMIN-only** (`requireRole('ADMIN')`, same pattern as user management and shop deletion) — a STAFF request gets a clean 403. This was a deliberate default, not dictated by the request; STAFF can still create/edit/delete transactions as before, which is the only inventory-changing action they need day-to-day.
- **Locking**: reuses the exact `SELECT ... FOR UPDATE` pattern already used for transaction-driven inventory changes, inside the same `withTransaction` helper, so a manual adjustment can never race a concurrent transaction (or another manual adjustment) touching the same bundle type.
- **Validation**: same 0.01 (one-note) precision rule as bundle quantities elsewhere, a non-zero delta required, and a clean 409 (not a raw DB constraint error) if a removal would take stock negative — inventory is left untouched on rejection.
- **Frontend** (`Inventory.jsx`): each bundle card gets a small "Adjust stock" control, visible only to admins (`useAuth().isAdmin`) — a quantity field plus "+ Add" / "− Remove" buttons, with a toast confirming the result and the page refetching afterward so the displayed count is always the server's real value, never assumed from the client-side delta.
- **No audit trail added.** Transaction edits are logged to `transaction_edits` because financial transactions specifically need that history; a manual stock correction is a simpler, less frequent, admin-only action, and adding a parallel audit table wasn't requested — this can be added later if it turns out to be wanted.

**Verified**: 8 new automated tests (auth required, admin-only, invalid bundle_type, zero delta, sub-note-precision delta, successful add, successful remove, and insufficient-stock rejection leaving inventory untouched) plus a live HTTP check confirming a STAFF login is blocked with 403 while an ADMIN login can add and remove stock correctly, including a fractional amount. Full 164-test suite passing. Production frontend build re-verified clean after the new JSX.

## Production URLs

- **Frontend**: https://ccms-4k9.pages.dev/
- **Backend / health check**: https://ccms-v3ov.onrender.com/api/health
- **Database**: Neon (connection string held privately, not in this repo)

## Known Issues

None outstanding. For the record, two things surfaced only once real, separate-domain hosting was live (neither was catchable from local dev, where frontend/backend share `localhost`):

- **Render requires a card on file for identity verification** to create a free-tier web service — this is a real 2026 industry shift from Render's older "no card" reputation, not an oversight in the original research. It's verification-only: the service stays on the Free instance type, no charge unless a paid plan is chosen deliberately. (A detour through Koyeb as a card-free alternative was tried first and abandoned after discovering Koyeb was acquired by Mistral AI in February 2026 and is being repositioned around Mistral's AI/agentic cloud strategy — not a safe long-term host for real business data.)
- **Cross-domain session cookie, found and fixed same-day**: login succeeded but the very next request lost the session, bouncing the user back to the login page. Cause: `SameSite=Lax` (correct for same-site local dev) is silently withheld by the browser on cross-site requests once frontend and backend are genuinely different domains (`*.pages.dev` vs `*.onrender.com`). Fixed in `server/src/config/session.js` — `SameSite=None` (paired with the existing `Secure` flag) in production, `Lax` still in local dev. Verified via the `Set-Cookie` response header and a real login in the browser.

## Important Architectural Decisions

Full Phase 0 rationale in `ARCHITECTURE.md` §20. New decisions made this phase:

- **Neon over Supabase for the database**, despite both having viable free tiers, because Neon's "scale to zero after 5 minutes, resume automatically on the next query" is more resilient to a real small business's usage pattern (e.g., a quiet long weekend) than Supabase's "fully pause after 7 days of zero activity, needs a dashboard or scripted resume."
- **A dedicated `seedAdmin.js` script instead of extending `seed.js`** or adding a self-signup flow. Extending `seed.js` would risk it eventually being run against production by mistake despite the guard; a signup flow would be a new feature the brief explicitly says not to add. A narrow, single-purpose, idempotent bootstrap script was the smallest change that solves the actual gap (a fresh production database has no way to create its first login).
- **No code-splitting added despite the 695KB bundle-size warning.** The brief's §20 explicitly warns against premature optimization for a 4–5 user application; splitting the bundle would be real engineering effort solving a problem this application doesn't have (a handful of users on a business tool, not a public site optimizing for first-load performance at scale).

## Next Phase

Not yet defined. Phase 10 is complete and the app is live in production. Awaiting a Phase 11 brief, if any.

## Local Development

```bash
# one-time setup
cd server && npm install && cd ../client && npm install && cd ..
npm install

# database
npm run db:migrate
npm run db:seed

# run both apps together
npm run dev                     # server on :5000, client on :5173

# tests
npm run test:server
```

Seeded dev login accounts — **development only, do not reuse anywhere real:**

| Name | Email | Role |
|---|---|---|
| Ibrahim Hassan | admin@ccms.local | ADMIN |
| Bilal Hussain | bilal@ccms.local | STAFF |
| Ayesha Malik | ayesha@ccms.local | STAFF |
| Usman Tariq | usman@ccms.local | STAFF |

Password for all seeded accounts: `Password123!`

Seed data dates are always relative to when `npm run seed` is run - re-run it any time the demo data feels stale to refresh Today/This Week/the trend charts with current dates.

For production deployment, see `DEPLOYMENT.md` instead of this section.

## Reference Documents

- `CASH CHANGE MANAGEMENT SYSTEM — MASTER PROJECT CONTEXT.md` — full product requirements
- `PHASE 0` through `PHASE 10` phase brief `.md` files
- `ARCHITECTURE.md` — full technical architecture
- `README.md` — local development and a pointer to production deployment
- `DEPLOYMENT.md` — full production deployment guide (providers, setup, migrations, backups, troubleshooting, cost)
