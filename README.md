# CCMS — Cash Change Management System

A web application for tracking cash-change transactions, commission, profit,
and Rs. 10/50/100 bundle inventory for a small business serving multiple shops.

See `ARCHITECTURE.md` for the technical design and `PROJECT_STATUS.md` for
current implementation status. For deploying this application to production,
see `DEPLOYMENT.md` — this file's Production section is a short pointer to it.

---

## Local Development

### 1. Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ running locally (or accessible over the network)

### 2. PostgreSQL setup

Create a local database (via `psql` or pgAdmin):

```sql
CREATE DATABASE ccms_dev;
```

### 3. Environment variables

Copy the example env files and fill in your local database credentials:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env` needs at minimum a working `DATABASE_URL` pointing at the database you just created, and a `SESSION_SECRET` (any long random string is fine for local dev). The defaults in `client/.env.example` already point at the local backend and don't need to change.

### 4. Install dependencies

```bash
cd server && npm install && cd ../client && npm install && cd ..
npm install
```

### 5. Database creation, migrations, and seed data

```bash
npm run db:migrate   # creates all tables/constraints/indexes
npm run db:seed      # inserts demo users/shops/transactions for local testing
```

Seeded dev login accounts — **development only, do not reuse anywhere real:**

| Name | Email | Role |
|---|---|---|
| Ibrahim Hassan | admin@ccms.local | ADMIN |
| Bilal Hussain | bilal@ccms.local | STAFF |
| Ayesha Malik | ayesha@ccms.local | STAFF |
| Usman Tariq | usman@ccms.local | STAFF |

Password for all seeded accounts: `Password123!`

Seed data dates are relative to when `npm run db:seed` is run — re-run it any time the demo data feels stale.

### 6. Backend and frontend startup

```bash
npm run dev    # runs both together: server on :5000, client on :5173
```

Or separately:

```bash
cd server && npm run dev     # backend only, :5000
cd client && npm run dev     # frontend only, :5173
```

### 7. Tests

```bash
npm run test:server
```

---

## Production Deployment

Full step-by-step instructions — chosen hosting providers, environment
variables, migrations, backups, redeployment, and troubleshooting — live in
**[`DEPLOYMENT.md`](./DEPLOYMENT.md)**.

Short version: React frontend on Cloudflare Pages, Node/Express backend on
Render, PostgreSQL on Neon — all free tiers, $0/month, no credit card
required. See `DEPLOYMENT.md` for why these were chosen over the obvious
alternatives (Vercel, Railway, Render Postgres) and exactly how to set each
one up from a fresh GitHub repository.
