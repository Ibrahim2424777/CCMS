# CCMS — TECHNICAL ARCHITECTURE (PHASE 0 DELIVERABLE)

_Last updated: 2026-08-13_
_Companion documents: `CASH CHANGE MANAGEMENT SYSTEM — MASTER PROJECT CONTEXT.md` (source of truth for requirements, referenced below as "MC §N"), `PHASE 0 — ARCHITECTURE & IMPLEMENTATION PLAN.md` (this phase's brief), `PROJECT_STATUS.md` (living status tracker)._

## Executive Summary

CCMS is a small internal financial/inventory system for a business that exchanges large notes for bundles of small-denomination Pakistani currency (Rs. 10 / 50 / 100), earning a commission per transaction. This document is the complete technical design: database schema, API surface, frontend structure, business-logic architecture, and the specific mechanisms that keep money and inventory correct under concurrent, editable, deletable transactions.

**Status: Phase 0 complete.** All open questions (§21) have been reviewed and resolved.

**Non-goals for this document / this phase:** no code, no installed dependencies, no database created, no scaffolding. Per the Phase 0 brief, this is design only. Everything below is a plan to be implemented (and tested) in later phases.

---

## Table of Contents

1. [Recommended Project Structure](#1-recommended-project-structure)
2. [PostgreSQL Database Schema](#2-postgresql-database-schema)
3. [Entity Relationship Explanation](#3-entity-relationship-explanation)
4. [Database Constraints](#4-database-constraints)
5. [Required Indexes](#5-required-indexes)
6. [Authentication Architecture](#6-authentication-architecture)
7. [Authorization Model](#7-authorization-model)
8. [REST API Architecture](#8-rest-api-architecture)
9. [Frontend Page Structure](#9-frontend-page-structure)
10. [React Component Structure](#10-react-component-structure)
11. [State / Data-Fetching Strategy](#11-state--data-fetching-strategy)
12. [Transaction / Business-Logic Architecture](#12-transaction--business-logic-architecture)
13. [Inventory Architecture](#13-inventory-architecture)
14. [Analytics / Query Architecture](#14-analytics--query-architecture)
15. [Testing Strategy](#15-testing-strategy)
16. [Deployment Architecture](#16-deployment-architecture)
17. [Environment Variables](#17-environment-variables)
18. [Dependencies Required](#18-dependencies-required)
19. [Critical Focus Areas — Cross-Reference](#19-critical-focus-areas--cross-reference)
20. [Key Architectural Decisions & Rationale](#20-key-architectural-decisions--rationale)
21. [Open Questions / Needs Clarification](#21-open-questions--needs-clarification)

---

## 1. Recommended Project Structure

Two independently deployable apps (client, server) in one repo, plus root-level docs/status. This matches MC §31 with light refinement (src/ subfolders, docs).

```text
CCMS/
│
├── client/                          # React frontend (Vite)
│   ├── public/
│   ├── src/
│   │   ├── api/                     # one module per resource: authApi, shopsApi, transactionsApi...
│   │   ├── components/
│   │   │   ├── common/               # Modal, ConfirmDialog, Toast, Spinner, Skeleton, EmptyState, Pagination
│   │   │   ├── layout/               # Navbar, SidebarNav, AppLayout, AuthLayout
│   │   │   ├── shops/                # ShopAutocomplete, ShopForm, ShopTable, ShopSummaryCards
│   │   │   ├── transactions/         # BundleQuantityInput, TransactionForm, TransactionTable, TransactionFilters
│   │   │   ├── inventory/            # InventoryCard, InventoryTotals
│   │   │   ├── dashboard/            # StatCard, RecentTransactionsList
│   │   │   └── charts/               # ProfitTrendChart, ChangeOverTimeChart, BundleDistributionChart
│   │   ├── pages/                    # route-level: Login, Dashboard, Transactions, Shops, Inventory, Analytics, Users, Settings
│   │   ├── layouts/
│   │   ├── hooks/                    # useAuth, useDebounce, useShopSearch...
│   │   ├── context/                  # AuthContext, ToastContext
│   │   ├── utils/                    # currency.js, date.js, constants.js (mirrors backend calc for live preview only)
│   │   ├── routes/                   # ProtectedRoute, AdminRoute, AppRouter
│   │   └── App.jsx
│   └── package.json
│
├── server/                          # Express backend
│   ├── src/
│   │   ├── config/                   # db.js (pg Pool), session.js, env.js
│   │   ├── controllers/              # authController, shopController, transactionController, inventoryController, analyticsController, userController
│   │   ├── routes/                   # one router per resource, mounted under /api/*
│   │   ├── services/                 # businessLogic.js, shopService, transactionService, inventoryService, analyticsService
│   │   ├── middleware/               # requireAuth, requireRole, errorHandler, validate
│   │   ├── repositories/             # SQL query modules per entity (thin data-access layer)
│   │   ├── validators/               # request schemas
│   │   ├── utils/                    # money.js, withTransaction.js, errors.js, dateRange.js
│   │   └── app.js                    # Express app assembly (no listen())
│   ├── server.js                     # entrypoint — imports app, calls listen()
│   └── package.json
│
├── database/
│   ├── migrations/                   # numbered, forward-only SQL migrations
│   └── seed/                         # dev-only seed scripts (MC §34)
│
├── PROJECT_STATUS.md
├── ARCHITECTURE.md                   # this file
├── CASH CHANGE MANAGEMENT SYSTEM — MASTER PROJECT CONTEXT.md
├── PHASE 0 — ARCHITECTURE & IMPLEMENTATION PLAN.md
├── .gitignore
├── README.md
└── package.json                      # root: dev-convenience scripts only (concurrently client+server)
```

**Why two separate `package.json`s instead of a monorepo tool (Turborepo/Nx/workspaces):** client and server have different runtimes, different build outputs, and may be deployed to different hosts (MC §35). A root script runner (`concurrently`) gives one-command local dev without imposing a monorepo tool the project doesn't need at this scale (MC §42 — simplicity, no unnecessary tooling).

---

## 2. PostgreSQL Database Schema

Design goals, in priority order (MC §42): financial correctness → inventory consistency → auditability → simplicity. Full DDL below is the authoritative design; it will become `database/migrations/0001_init.sql` in the implementation phase — **no migration is being run in Phase 0.**

```sql
-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- Shared trigger: keep updated_at accurate regardless of caller
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         CITEXT NOT NULL UNIQUE,          -- case-insensitive login identifier
  password_hash VARCHAR(255) NOT NULL,           -- bcrypt hash, never plaintext (MC §6)
  role          VARCHAR(10) NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,   -- deactivate leavers instead of deleting (preserves FK history)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- SHOPS  (MC §7 — case-insensitive identity, explicit normalized column)
-- ============================================================
CREATE TABLE shops (
  id                    SERIAL PRIMARY KEY,
  shop_name             VARCHAR(150) NOT NULL,        -- preserves user's original casing for display
  normalized_shop_name  VARCHAR(150) NOT NULL,        -- LOWER(TRIM(shop_name)), DB-maintained
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_shops_normalized_name UNIQUE (normalized_shop_name)
);

CREATE OR REPLACE FUNCTION shops_set_normalized_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_shop_name = LOWER(TRIM(NEW.shop_name));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shops_normalize_name
  BEFORE INSERT OR UPDATE OF shop_name ON shops
  FOR EACH ROW EXECUTE FUNCTION shops_set_normalized_name();

CREATE TRIGGER shops_set_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_shops_normalized_name ON shops (normalized_shop_name text_pattern_ops);
-- text_pattern_ops makes `WHERE normalized_shop_name LIKE 'fre%'` index-friendly for autocomplete.

-- ============================================================
-- TRANSACTIONS  (MC §9)
-- ============================================================
CREATE TABLE transactions (
  id                   SERIAL PRIMARY KEY,
  shop_id              INTEGER NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  transaction_date     DATE NOT NULL,                 -- business date (MC §10), distinct from created_at audit time
  bundles_10           INTEGER NOT NULL DEFAULT 0 CHECK (bundles_10 >= 0),
  bundles_50           INTEGER NOT NULL DEFAULT 0 CHECK (bundles_50 >= 0),
  bundles_100          INTEGER NOT NULL DEFAULT 0 CHECK (bundles_100 >= 0),
  total_change_value   NUMERIC(12,2) NOT NULL CHECK (total_change_value >= 0),
  commission_rate      NUMERIC(5,4)  NOT NULL CHECK (commission_rate IN (0.0150, 0.0300)),
  profit               NUMERIC(12,2) NOT NULL CHECK (profit >= 0),
  amount_collected     NUMERIC(12,2) NOT NULL CHECK (amount_collected >= 0),
  status               VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
  created_by           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by           INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_at_least_one_bundle CHECK (bundles_10 > 0 OR bundles_50 > 0 OR bundles_100 > 0),
  CONSTRAINT chk_amount_collected_math CHECK (amount_collected = total_change_value + profit)
);

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_transactions_date        ON transactions (transaction_date);
CREATE INDEX idx_transactions_shop_id     ON transactions (shop_id);
CREATE INDEX idx_transactions_created_by  ON transactions (created_by);
CREATE INDEX idx_transactions_status_date ON transactions (status, transaction_date);

-- ============================================================
-- TRANSACTION_EDITS  (before-snapshot history — auditability, MC §9/§30)
-- ============================================================
CREATE TABLE transaction_edits (
  id                            SERIAL PRIMARY KEY,
  transaction_id                INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  previous_shop_id              INTEGER NOT NULL,
  previous_transaction_date     DATE NOT NULL,
  previous_bundles_10           INTEGER NOT NULL,
  previous_bundles_50           INTEGER NOT NULL,
  previous_bundles_100          INTEGER NOT NULL,
  previous_total_change_value   NUMERIC(12,2) NOT NULL,
  previous_commission_rate      NUMERIC(5,4) NOT NULL,
  previous_profit               NUMERIC(12,2) NOT NULL,
  previous_amount_collected     NUMERIC(12,2) NOT NULL,
  edit_type                     VARCHAR(10) NOT NULL CHECK (edit_type IN ('UPDATE', 'VOID')),
  edited_by                     INTEGER NOT NULL REFERENCES users(id),
  edited_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transaction_edits_transaction_id ON transaction_edits (transaction_id);

-- ============================================================
-- INVENTORY  (MC §11 — one row per bundle type, current snapshot)
-- ============================================================
CREATE TABLE inventory (
  bundle_type   SMALLINT PRIMARY KEY CHECK (bundle_type IN (10, 50, 100)),
  bundle_count  INTEGER NOT NULL DEFAULT 0 CHECK (bundle_count >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER inventory_set_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Row existence (not real counts — those come from Phase-1 seed data, MC §34):
INSERT INTO inventory (bundle_type, bundle_count) VALUES (10, 0), (50, 0), (100, 0);
```

**Note:** the `session` table used for login sessions is auto-created and managed by `connect-pg-simple` (see §6) — it is infrastructure, not domain schema, so it isn't hand-defined above.

---

## 3. Entity Relationship Explanation

```mermaid
erDiagram
    USERS ||--o{ TRANSACTIONS : "creates (created_by)"
    USERS ||--o{ TRANSACTIONS : "edits (updated_by)"
    USERS ||--o{ TRANSACTION_EDITS : "performs"
    SHOPS ||--o{ TRANSACTIONS : "receives"
    TRANSACTIONS ||--o{ TRANSACTION_EDITS : "history"

    USERS {
        int id PK
        varchar name
        citext email UK
        varchar password_hash
        varchar role
        boolean is_active
    }
    SHOPS {
        int id PK
        varchar shop_name
        varchar normalized_shop_name UK
    }
    TRANSACTIONS {
        int id PK
        int shop_id FK
        date transaction_date
        int bundles_10
        int bundles_50
        int bundles_100
        numeric total_change_value
        numeric commission_rate
        numeric profit
        numeric amount_collected
        varchar status
        int created_by FK
        int updated_by FK
    }
    TRANSACTION_EDITS {
        int id PK
        int transaction_id FK
        int edited_by FK
        varchar edit_type
    }
    INVENTORY {
        smallint bundle_type PK
        int bundle_count
    }
```

- **users → transactions**: one-to-many twice (`created_by` always set; `updated_by` set only after the first edit).
- **shops → transactions**: one-to-many. A shop cannot be deleted while it has transactions (`ON DELETE RESTRICT`) — see §21 Q3 for whether shop deletion should be exposed at all.
- **transactions → transaction_edits**: one-to-many; each edit or void inserts one row capturing the *pre-edit* state, so the full timeline is `transaction_edits` rows (in order) + the current `transactions` row.
- **inventory** has **no foreign key** to transactions. It is a running aggregate, not a per-transaction record. The relationship is enforced procedurally: every service-layer operation that writes a transaction row also writes to `inventory` **inside the same database transaction** (see §13). Because `transactions` records the exact bundle counts of every active transaction, inventory is always theoretically reconstructable as `seeded_count − Σ(active transaction bundle counts)`, which gives us a free reconciliation check without needing a separate movements ledger table (kept out for simplicity — see §20).

---

## 4. Database Constraints

| Constraint | Table | Purpose |
|---|---|---|
| `UNIQUE(email)` via CITEXT | users | case-insensitive login uniqueness |
| `CHECK role IN ('ADMIN','STAFF')` | users | MC §6 roles, enforced even if app logic has a bug |
| `UNIQUE(normalized_shop_name)` | shops | MC §7 — Freshly/freshly/FRESHLY collapse to one row |
| `NOT NULL` on all financial columns | transactions | no transaction can exist with unknown money values |
| `CHECK (bundles_x >= 0)` ×3 | transactions | MC §22 — quantities cannot be negative |
| `CHECK (bundles_10>0 OR bundles_50>0 OR bundles_100>0)` | transactions | MC §22 — at least one bundle required |
| `CHECK commission_rate IN (0.0150, 0.0300)` | transactions | MC §37 — the two non-negotiable rates, enforced at the DB layer as well as in code |
| `CHECK amount_collected = total_change_value + profit` | transactions | MC §4 — the definition of "amount collected" is a DB-enforced invariant, not just an app convention |
| `CHECK status IN ('ACTIVE','VOID')` | transactions | supports soft-delete (see §13, §20) |
| `FK shop_id → shops.id ON DELETE RESTRICT` | transactions | a shop with transaction history can never be deleted out from under it |
| `FK created_by/updated_by → users.id ON DELETE RESTRICT` | transactions | financial history can never lose its author; deactivate users instead of deleting (`is_active`) |
| `CHECK bundle_type IN (10,50,100)` | inventory | matches MC §2's fixed denominations |
| `CHECK bundle_count >= 0` | inventory | MC §12 — inventory can never go negative |

---

## 5. Required Indexes

| Index | Table / Columns | Serves |
|---|---|---|
| `idx_transactions_date` | `transactions(transaction_date)` | date-range filtering (history, analytics, dashboard) — MC §23 |
| `idx_transactions_shop_id` | `transactions(shop_id)` | shop detail page transaction history — MC §23 |
| `idx_transactions_created_by` | `transactions(created_by)` | MC §23; also supports a future "my transactions" view |
| `idx_transactions_status_date` | `transactions(status, transaction_date)` | the single most common query shape: active transactions in a date range (dashboard + analytics + history all filter this way) |
| `uq_shops_normalized_name` (unique index, implicit from constraint) | `shops(normalized_shop_name)` | case-insensitive dedup **and** doubles as the lookup index for exact/prefix shop search |
| `idx_shops_normalized_name` (`text_pattern_ops`) | `shops(normalized_shop_name)` | efficient `LIKE 'prefix%'` for autocomplete (MC §8) |
| unique index on `users.email` (implicit from CITEXT UNIQUE) | `users(email)` | login lookup |
| `idx_transaction_edits_transaction_id` | `transaction_edits(transaction_id)` | fetching a transaction's edit history |

At the expected data volume (4–5 users, a modest number of shops and transactions per day — MC §1), none of these need partitioning, materialized views, or covering indexes. Revisit only if real usage proves otherwise.

---

## 6. Authentication Architecture

**Mechanism: server-side sessions**, not JWT.

- `express-session` + `connect-pg-simple` as the session store (sessions persist in Postgres, survive server restarts, and — critically for a financial tool — can be **instantly revoked server-side** by deleting the session row, e.g. when offboarding staff). MC §6 explicitly offers "secure sessions **or** another appropriate mechanism"; sessions were chosen over JWT because this is a small internal tool with no cross-domain/mobile API consumers, and stateless JWT revocation would need an extra denylist mechanism anyway — sessions get that for free.
- Cookie: `httpOnly`, `secure` (enabled in production over HTTPS), `sameSite=lax`, signed with `SESSION_SECRET`.
- Passwords hashed with `bcryptjs` (cost factor 10–12). Never logged, never returned in any API response.

**Flow:**
```
POST /api/auth/login   { email, password }
  → look up user by CITEXT email (case-insensitive)
  → bcrypt.compare(password, password_hash)
  → reject if !user.is_active
  → on success: regenerate session, store { userId, role }
  → respond with { id, name, email, role }  (never password_hash)

GET  /api/auth/me      → current user from session, or 401
POST /api/auth/logout  → destroy session, clear cookie
```

- **Brute-force protection:** `express-rate-limit` on `/api/auth/login` (e.g. a handful of attempts per minute per IP). Small addition, meaningful security value for a money-handling app (MC §42 ranks security above simplicity).
- **Security headers:** `helmet` applied globally — minimal cost, standard hardening.
- **CORS:** `cors` middleware, `origin` restricted to the known frontend origin(s) from `CORS_ORIGIN`, `credentials: true` (required for cookies to flow between the Vite dev server and the API during local development).

---

## 7. Authorization Model

Two roles (MC §6): `ADMIN`, `STAFF`.

- `requireAuth` middleware — rejects with 401 if no valid session.
- `requireRole('ADMIN')` middleware — rejects with 403 if session role isn't ADMIN.

| Area | STAFF | ADMIN |
|---|---|---|
| Dashboard, Analytics, Inventory (view) | ✅ | ✅ |
| Shops: view/search/autocomplete/create/edit | ✅ | ✅ |
| Transactions: create | ✅ | ✅ |
| Transactions: edit / delete | ✅ (any transaction, not just own — confirmed §21) | ✅ |
| Users management (create/edit/deactivate) | ❌ | ✅ |
| Settings (own account) | ✅ (own account only) | ✅ |

All checks are enforced **server-side** in route middleware (MC §6, §22 — never trust the client). The frontend additionally uses `ProtectedRoute` (redirect to `/login` if unauthenticated) and `AdminRoute` (hide/redirect for non-admins on `/users`) wrappers, but these exist purely for UX — the API is the actual authorization boundary.

---

## 8. REST API Architecture

Base structure extends MC §21:

```
/api/auth
  POST   /login
  POST   /logout
  GET    /me

/api/users                      [ADMIN only]
  GET    /                       list
  POST   /                       create
  GET    /:id
  PUT    /:id                    update name/role/is_active
  PUT    /:id/password           reset a user's password

/api/shops                      [authenticated]
  GET    /                       list (paginated, ?search=)
  POST   /                       create
  GET    /:id
  PUT    /:id
  DELETE /:id                    [ADMIN only; blocked by FK RESTRICT if shop has transactions]
  GET    /search?q=              lightweight autocomplete (limited fields/rows, MC §8)
  GET    /:id/summary            total transactions / change / profit / avg / last transaction (MC §20)
  GET    /:id/transactions       paginated transaction history for that shop

/api/transactions                [authenticated]
  GET    /                       list — filters: shop_id, date_from, date_to, search, sort, page, pageSize
  POST   /                       create (atomic, inventory-checked)
  GET    /:id
  PUT    /:id                    edit (atomic, inventory-adjusted, MC §14)
  DELETE /:id                    delete/void (atomic, inventory restored, MC §15)
  GET    /:id/edits              edit history

/api/inventory                   [authenticated]
  GET    /                       current snapshot: bundle_count, notes, value per type + totals (MC §11)
                                  (no direct mutation endpoint — inventory only changes via transactions;
                                   restocking is out of scope per MC §36 but this leaves room for a future
                                   POST /api/inventory/restock without redesigning this resource)

/api/analytics                   [authenticated]
  GET    /dashboard              today/week/month summary + inventory + recent transactions + trend (MC §16)
  GET    /summary?range=         totals for a given range (MC §17's range list, or custom from/to)
  GET    /profit-trend?range=&groupBy=day|week|month
  GET    /bundle-distribution?range=
  GET    /top-shops?range=&limit=
```

**Conventions:**
- Errors: `{ error: { message, code } }` with proper status codes — 400 (validation), 401 (unauthenticated), 403 (unauthorized), 404 (not found), 409 (conflict — e.g. insufficient inventory, duplicate shop), 500 (unexpected; never a raw stack trace, MC §28).
- Pagination: `?page=1&pageSize=20` → `{ data: [...], pagination: { page, pageSize, total, totalPages } }`.
- All monetary fields are serialized as strings (e.g. `"10150.00"`) to avoid JSON-number float round-tripping issues — the frontend formats them for display but never does authoritative math on them.

**Illustrative contract — the core "reject, don't partially execute" rule (MC §12) surfaced as an API error:**
```json
POST /api/transactions
{ "shop_id": 4, "transaction_date": "2026-08-12", "bundles_10": 4, "bundles_50": 0, "bundles_100": 0 }

409 Conflict
{
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "message": "Not enough Rs. 10 bundles available. Requested 4, available 2.",
    "details": { "bundle_type": 10, "requested": 4, "available": 2 }
  }
}
```

---

## 9. Frontend Page Structure

React Router routes:

```
/login                     public — AuthLayout
/                           → redirect to /dashboard
/dashboard                  protected
/transactions                protected — history/list (MC §19)
/transactions/new            protected — create form
/transactions/:id            protected — view detail
/transactions/:id/edit        protected — edit form
/shops                       protected — shop management (MC §20)
/shops/:id                   protected — shop detail
/inventory                   protected (MC §11)
/analytics                   protected (MC §17)
/users                       protected, ADMIN only (MC §6)
/settings                    protected — own account
```

`AppLayout` wraps all protected routes: top navbar (MC §26 nav items) that collapses to an off-canvas/hamburger menu on mobile/tablet (MC §27), plus a content region. `AuthLayout` is a minimal centered-card shell for `/login`.

---

## 10. React Component Structure

Grouped by domain (folder layout in §1). Notable components:

- **`ShopAutocomplete`** — debounced (~250–300ms) search-as-you-type against `GET /api/shops/search`, shows matching shops, and an inline **"+ Create new shop: '{query}'"** affordance when nothing matches (MC §8's "convenient way to create it").
- **`BundleQuantityInput`** — three numeric inputs (Rs. 10/50/100) with live client-side preview of change value / commission / profit / amount collected, computed via the same small pure-function shapes as the backend (see §12) — explicitly labeled as a *preview*, since the server recalculates authoritatively on submit.
- **`TransactionForm`** — composes `ShopAutocomplete` + `BundleQuantityInput` + date picker (defaults to today, but allows past dates per MC §10) + submit, with a disabled/loading submit state to prevent duplicate submissions (MC §29).
- **`ConfirmDialog`** — generic confirmation modal, used for transaction deletion (MC §15 requires this) and other destructive actions.
- **`StatCard`** — the Dashboard's today/week/month tiles (MC §16).
- **Chart components** (`ProfitTrendChart`, `ChangeOverTimeChart`, `BundleDistributionChart`) — thin wrappers around Recharts, each taking already-aggregated data from the analytics API (no client-side aggregation of raw transactions).
- **`EmptyState` / `ErrorState` / `Skeleton`** — used consistently across every list/table view (MC §25, §29).

---

## 11. State / Data-Fetching Strategy

- **Server state:** `@tanstack/react-query`. Rationale: the app has many views that must stay consistent after a single mutation (creating a transaction must invalidate the dashboard, the transaction list, *and* inventory simultaneously); hand-rolling this with `useEffect`/`useState` means re-solving caching, refetch, and loading/error states repeatedly across ~7 pages. This is a deliberate dependency addition beyond MC §5's explicit list, confirmed in §21.
- **Client state:** plain React state/Context for anything local or small-and-global:
  - `AuthContext` — current user/role, populated from `GET /api/auth/me` on load.
  - `ToastContext` — global toast notification queue (MC §25).
- **HTTP client:** a single `axios` instance (`baseURL` from `VITE_API_BASE_URL`, `withCredentials: true` for the session cookie), with a response interceptor that normalizes error shapes and redirects to `/login` on a 401.

---

## 12. Transaction / Business-Logic Architecture

All financial math lives in **one centralized backend module** (MC §41), using the exact function names given in the master context:

```text
server/src/services/businessLogic.js

BUNDLE_VALUES = { 10: 1000, 50: 5000, 100: 10000 }   // Rs. per bundle — non-negotiable, MC §37
NOTES_PER_BUNDLE = 100                                // MC §2

calculateBundleValue({ bundles_10, bundles_50, bundles_100 }) → total_change_value
calculateCommissionRate({ bundles_10, bundles_50, bundles_100 }) → 0.015 | 0.03   // MC §3's exact IF/ELSE
calculateProfit(total_change_value, commission_rate) → profit
calculateAmountCollected(total_change_value, profit) → amount_collected
```

**Why no decimal library (e.g. decimal.js) is needed:** every bundle value is a multiple of Rs. 1,000, and both commission rates (1.5%, 3%) are exact multiples of 0.0005. `1000 × 0.015 = 15` and `1000 × 0.03 = 30` are both exact integers, so *any* valid combination of bundles produces a whole-rupee profit — there is no fractional-paisa case to round. The code still stores results in `NUMERIC(12,2)` and rounds defensively (`Math.round(value * 100) / 100` before persisting) as a safety net, but does not need arbitrary-precision decimal arithmetic to be correct.

- Calculation happens **server-side only** and is the sole source of truth (MC §3, §22). The frontend's live preview (in `BundleQuantityInput`) duplicates these same small pure functions client-side purely for responsiveness — clearly understood as non-authoritative.
- `calculateCommissionRate` is the literal encoding of MC §3's rule:
  ```js
  if (bundles_10 > 0 && bundles_50 === 0 && bundles_100 === 0) return 0.03;
  return 0.015;
  ```

---

## 13. Inventory Architecture

`inventoryService` exposes operations that always run **inside an existing database transaction** (never on their own connection), via a shared `withTransaction(fn)` helper that wraps `BEGIN`/`COMMIT`/`ROLLBACK` and connection release so this boilerplate isn't duplicated per MC §41.

**Locking rule:** inventory rows are always locked with `SELECT bundle_count FROM inventory WHERE bundle_type = ANY($1) ORDER BY bundle_type ASC FOR UPDATE` — the `ORDER BY` is deliberate: acquiring locks in a fixed, consistent order across all code paths prevents deadlocks between two concurrent transactions that touch overlapping bundle types (MC §13/§39's explicit "PostgreSQL transactions/locking" focus area). Default `READ COMMITTED` isolation is sufficient given this explicit row locking — `SERIALIZABLE` would add retry-handling complexity for no additional correctness benefit here.

**Create flow** (MC §13):
```
BEGIN
  validate shop exists (or create, if requested)
  validate quantities (integers, ≥ 0, at least one > 0)
  SELECT inventory rows FOR UPDATE (ordered)
  IF any requested bundle_type > available → ROLLBACK, return 409 (MC §12 — reject, don't partially execute)
  total_change_value   = calculateBundleValue(...)
  commission_rate       = calculateCommissionRate(...)
  profit                 = calculateProfit(...)
  amount_collected       = calculateAmountCollected(...)
  INSERT transaction row
  UPDATE inventory rows (decrement)
COMMIT
```

**Edit flow** (MC §14 — restore, re-check, re-deduct, recalculate, atomically):
```
BEGIN
  SELECT the transaction row FOR UPDATE   -- prevents concurrent edits/deletes racing on the same transaction
  SELECT inventory rows FOR UPDATE (ordered, union of old and new bundle types)
  restore OLD quantities to inventory (add back)
  IF any NEW requested bundle_type > (now-restored) available → ROLLBACK — original transaction and inventory are untouched
  deduct NEW quantities
  recalculate change value / commission / profit / amount collected
  INSERT a transaction_edits row (snapshot of pre-edit values, edit_type='UPDATE')
  UPDATE the transaction row (new values, updated_by, updated_at)
COMMIT
```

**Delete flow** (MC §15):
```
BEGIN
  SELECT the transaction row FOR UPDATE
  restore its bundle quantities to inventory
  INSERT a transaction_edits row (snapshot, edit_type='VOID')
  UPDATE transaction SET status = 'VOID'      -- soft delete; see §20 for rationale, §21 Q2 to confirm
COMMIT
```

Every one of these three flows is a single database transaction — any failure at any step rolls back everything, so it is never possible to have "transaction exists but inventory wasn't updated" or vice versa (MC §13's explicit invariant).

---

## 14. Analytics / Query Architecture

- `analyticsService` runs parameterized, read-only queries against `transactions WHERE status = 'ACTIVE'` (voided transactions are excluded from all figures).
- `resolveDateRange(rangeKey, customFrom?, customTo?)` — one shared utility mapping `today | yesterday | last7days | last30days | thisWeek | thisMonth | previousMonth | custom` (MC §17's exact list) to concrete `{from, to}` dates in **Asia/Karachi** time, used by both the dashboard and analytics endpoints so date-boundary logic exists in exactly one place.
- The dashboard endpoint computes today/week/month in a single query using conditional aggregation (`FILTER (WHERE ...)`) rather than three separate round trips:
  ```sql
  SELECT
    COALESCE(SUM(total_change_value) FILTER (WHERE transaction_date = CURRENT_DATE), 0) AS today_change,
    COALESCE(SUM(profit)             FILTER (WHERE transaction_date = CURRENT_DATE), 0) AS today_profit,
    COUNT(*)                          FILTER (WHERE transaction_date = CURRENT_DATE)     AS today_count,
    -- ...repeated with the week/month boundaries from resolveDateRange()
  FROM transactions
  WHERE status = 'ACTIVE' AND transaction_date >= <month_start>;
  ```
- Trend charts: `GROUP BY date_trunc('day'|'week'|'month', transaction_date)`.
- "Most frequent shops": `GROUP BY shop_id ORDER BY COUNT(*) DESC LIMIT N`.
- "Bundle quantities distributed": `SUM(bundles_10), SUM(bundles_50), SUM(bundles_100)` over the resolved range.
- No caching layer at this scale (4–5 users) — plain parameterized queries are fast enough; revisit only if real usage proves otherwise.

---

## 15. Testing Strategy

**Backend (primary focus, per MC §33):** Jest + Supertest against a dedicated `ccms_test` database (migrations applied fresh before the suite runs; truncate-between-tests for isolation).

Required unit tests for `businessLogic.js` (MC §33's literal minimum, plus edge cases):
```
10,000  →  1.5%  →  150                      (standard rule)
3,000, only Rs. 10  →  3%  →  90              (special rule)
2,000 (Rs.10) + 5,000 (Rs.50) → 1.5%          (mixed rule, MC §3's example)
only Rs. 50 / only Rs. 100 → 1.5%             (edge: special rule must NOT apply)
all-zero bundles → rejected                   (validation)
```

Required integration tests:
```
Inventory decreases after transaction creation
Inventory restored after deletion
Inventory correctly adjusted after editing (including edits that change bundle mix, not just quantity)
Cannot exceed available inventory → transaction rejected, inventory unchanged, no row created
Freshly == freshly == FRESHLY  → resolve to the same shop row, no duplicate created
Concurrent transaction submissions against limited inventory → exactly one succeeds if only one can be satisfied
Auth: unauthenticated request → 401; STAFF hitting an ADMIN-only route → 403
```

**Frontend:** lighter priority per MC §33's emphasis on backend business logic; React Testing Library for the `BundleQuantityInput` preview calculation and form validation, added opportunistically rather than exhaustively in Phase 0's follow-on phases.

---

## 16. Deployment Architecture

Per MC §35:
```
React (Vite build → static dist/)  →  served by Express via express.static in production
                                        (single deployable process; simplest ops for a 4–5 user internal tool)
Node/Express (API)                 →  any Node host (Render/Railway/VPS/etc.)
PostgreSQL                         →  local now; a managed Postgres provider later
```

The one architectural rule that makes "local now, remote later" actually true without rework: **all database access goes through a single `pg.Pool` configured from `DATABASE_URL`**, with SSL toggled by an env flag — nothing ever hardcodes `localhost`. Swapping environments is a `.env` change, not a code change.

The client/server split also supports deploying the frontend separately (Netlify/Vercel) with the API on its own origin, at the cost of needing `CORS_ORIGIN` configured correctly — the architecture doesn't block this, it's just not the default recommendation for this project's size.

---

## 17. Environment Variables

To be created as actual `.env.example` files once `client/` and `server/` exist (Phase 1) — documented here as the planned contract:

**`server/.env.example`**
```
NODE_ENV=development
PORT=5000
DATABASE_URL=postgres://user:password@localhost:5432/ccms_dev
SESSION_SECRET=replace_with_long_random_string
SESSION_MAX_AGE_MS=43200000
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
```

**`client/.env.example`**
```
VITE_API_BASE_URL=http://localhost:5000/api
```

Never commit a real `.env`; both live only as `.env.example` in version control.

---

## 18. Dependencies Required

Nothing below is speculative — each line is tied to a specific requirement. None are installed yet (Phase 0 is planning only).

**Server (runtime):**
| Package | Why |
|---|---|
| `express` | MC §5 — explicit stack |
| `pg` | MC §5 — PostgreSQL driver |
| `bcryptjs` | MC §6 — password hashing |
| `express-session`, `connect-pg-simple` | session-based auth (§6) |
| `cors` | client/server run on different origins in dev |
| `dotenv` | MC §32 — env var loading |
| `helmet` | baseline security headers, negligible cost |
| `express-rate-limit` | login brute-force protection |
| `zod` (or `express-validator`) | centralized request validation (MC §22); zod recommended for composable schemas reusable between routes |

**Server (dev only):** `nodemon`, `jest`, `supertest`.

**Client (runtime):**
| Package | Why |
|---|---|
| `react`, `react-dom` | MC §5 |
| `react-router-dom` | MC §5 |
| `bootstrap` | MC §5 (plain CSS, not `react-bootstrap` — see §20) |
| `recharts` | MC §5/§18 — chosen over Chart.js, see §20 |
| `axios` | HTTP client with interceptors |
| `@tanstack/react-query` | server-state caching/invalidation — an addition beyond MC's explicit list, confirmed in §21 |

**Client (dev only):** `vite`, `@vitejs/plugin-react`, `eslint`, `prettier`.

**Root (dev only):** `concurrently` — runs client+server together with one command.

**Database:** the `citext` extension (`CREATE EXTENSION IF NOT EXISTS citext`) — not an npm package.

---

## 19. Critical Focus Areas — Cross-Reference

The Phase 0 brief calls out eight areas for particular attention. Where each is addressed:

| Focus area | Where addressed |
|---|---|
| Financial accuracy | §2 (`NUMERIC` columns, `chk_amount_collected_math`), §12 (centralized calc, integer-exactness proof) |
| Inventory consistency | §2 (`bundle_count >= 0`), §13 (locking + atomic flows) |
| Transaction editing | §13 (restore → re-check → re-deduct → recalculate, single DB transaction) |
| Transaction deletion | §13 (restore + soft-delete), §21 Q2 (confirming soft- vs hard-delete) |
| Case-insensitive shop names | §2 (`normalized_shop_name` + trigger + unique constraint), §5 (supporting index) |
| PostgreSQL transactions/locking | §13 (`FOR UPDATE`, fixed lock ordering to avoid deadlocks, isolation level rationale) |
| Authentication | §6 |
| Authorization | §7 |

---

## 20. Key Architectural Decisions & Rationale

Decisions made using MC §44's priority order (requirements → architecture → existing code → DB integrity → financial correctness → security → simplicity → UX):

1. **Sessions over JWT.** Simpler server-side revocation for a small internal tool; MC §6 explicitly permits either.
2. **Bundle values as backend constants, not a database table.** MC §37 calls these values non-negotiable; a hardcoded constant is *harder* to accidentally change than a database row, which better matches "non-negotiable" than making them admin-editable data. Adding a future denomination (MC §36) would need a new `bundles_X` column either way (the master schema is column-per-denomination, not a normalized line-items model), so a lookup table wouldn't actually remove that migration cost.
3. **`commission_rate` DB-constrained to exactly `{0.0150, 0.0300}`.** Enforces MC §37's non-negotiable rule at the database layer, not just in application code — defense in depth.
4. **`transaction_edits` history table (narrow, transaction-scoped) instead of a generic cross-entity audit log.** MC §30 explicitly calls a generic audit log optional ("if useful") and MC §36 lists "advanced audit logs" as future scope. A before-snapshot table scoped just to the one entity that legally needs it (money-moving transactions) satisfies MC §9's auditability requirement without over-building.
5. **No `inventory_movements` ledger table.** Inventory is reconstructable at any time from seed values + the sum of active transactions' bundle columns (which `transaction_edits` also preserves across edits) — a separate ledger would be redundant with data already captured. Noted as an easy future addition if reconciliation tooling ever needs it.
6. **Soft-delete (`status = 'VOID'`) for transaction deletion**, keeping the `DELETE /api/transactions/:id` HTTP verb as the trigger. MC §15 says "remove/void the transaction appropriately" — void is explicitly an acceptable reading, and it's the only reading compatible with MC §9/§30's auditability requirement. **Confirmed — §21 Q2.**
7. **Recharts over Chart.js.** More idiomatic in React (declarative, `ResponsiveContainer` handles MC §18's "charts should be responsive" requirement for free).
8. **Vite over Create React App.** CRA is deprecated; Vite is the modern standard for "modern React architecture" (MC §5).
9. **Plain Bootstrap 5 + custom CSS over `react-bootstrap`.** MC §25 explicitly warns against looking like "a default Bootstrap template" — a component library doesn't help avoid that look, and hand-rolled markup with Bootstrap utility classes gives more control over a polished, non-generic UI without an extra dependency.
10. **CITEXT for `users.email`, but an explicit `normalized_shop_name` column (not CITEXT) for shops.** MC §7's example schema explicitly names a `normalized_shop_name` column, implying shops need both the original display casing *and* a normalized comparison value; email has no such display-casing requirement, so CITEXT alone is simpler there.

---

## 21. Open Questions / Needs Clarification — RESOLVED

Per MC §44, three items were surfaced as genuinely ambiguous rather than silently decided. All three have been reviewed and confirmed; **Phase 0 is now fully signed off.**

**Q1 — Transaction edit/delete permissions. RESOLVED:** Any authenticated user (ADMIN or STAFF) can edit or delete any transaction, regardless of who created it. No `created_by`-based restriction is enforced in the authorization layer. The `transaction_edits` history still records who performed each change.

**Q2 — Soft-delete vs. hard delete for transactions. RESOLVED:** Soft-delete. `DELETE /api/transactions/:id` sets `status = 'VOID'` (schema in §2 already reflects this); the row is retained, excluded from active totals/views, and remains queryable for audit history.

**Q3 — Add `@tanstack/react-query`? RESOLVED:** Yes. It is confirmed as part of the frontend dependency set in §11/§18 for server-state caching and cross-view invalidation after mutations.

*(Two smaller judgment calls stand as made, since they're minor per MC §44 and don't block anything structurally: shop deletion is included in the API per MC §21 but restricted to ADMIN and blocked by `ON DELETE RESTRICT` if the shop has any transactions, even though MC §20's page description doesn't list "delete" as a shop-management action; and "appropriate timezone for Pakistan" is treated as `Asia/Karachi`, Pakistan's single national timezone with no DST, so there's no real ambiguity there.)*
