# PHASE 10 — FREE PRODUCTION DEPLOYMENT AND PRODUCTION READINESS

The application has completed Phases 0–9.

This phase is specifically about preparing and deploying the application for real-world use.

The application will initially be used by approximately **4–5 people**.

## IMPORTANT DEPLOYMENT CONSTRAINT

The goal is to deploy the application at **$0/month** using reliable free tiers wherever possible.

Do NOT assume that a paid service is necessary.

Before choosing hosting providers, investigate the currently available free-tier options and determine the best architecture for this specific application.

Free-tier availability and limitations change over time, so verify current information rather than relying on assumptions.

---

# 1. DEPLOYMENT ARCHITECTURE

The application consists of:

```text
React Frontend
       ↓
Node.js / Express Backend
       ↓
PostgreSQL Database
```

Determine the most appropriate free hosting arrangement for these three components.

The recommended solution should ideally provide:

- $0 monthly hosting cost
- HTTPS
- Persistent PostgreSQL storage
- Environment variables/secrets
- Ability to deploy from GitHub or another source repository
- Automatic or straightforward redeployment
- Sufficient bandwidth/resources for 4–5 users
- Reasonable reliability
- No unnecessary infrastructure complexity

A free provider subdomain is completely acceptable.

A custom domain is NOT required.

---

# 2. RESEARCH CURRENT FREE-TIER OPTIONS

Before implementing deployment, evaluate currently available free-tier services for:

### Frontend hosting

Examples may include:

- Vercel
- Netlify
- Cloudflare Pages
- Render
- other appropriate providers

### Backend hosting

Examples may include:

- Render
- Railway if a genuinely free option is currently available
- other suitable providers

### PostgreSQL

Examples may include:

- Neon
- Supabase
- Render PostgreSQL
- other suitable providers

Do not assume a service is free simply because it historically had a free tier.

Verify the current pricing/free-tier limitations.

Consider:

- monthly usage limits
- sleeping/idle behavior
- database storage limits
- bandwidth
- compute limits
- database expiration policies
- connection limits
- deployment restrictions
- whether persistent data survives deployments/restarts
- whether a credit card is required
- whether the service can realistically support this application

---

# 3. RECOMMEND ONE PRIMARY ARCHITECTURE

After evaluating the available options, recommend ONE primary deployment architecture.

For example, conceptually:

```text
React
  ↓
Free static hosting

Express
  ↓
Free Node hosting

PostgreSQL
  ↓
Free managed PostgreSQL
```

Do not choose a provider merely because it is popular.

Choose based on:

1. $0 cost
2. PostgreSQL persistence
3. reliability
4. simplicity
5. suitability for 4–5 users
6. ease of deployment
7. security
8. ability to recover/backup data

Briefly explain why the chosen architecture is preferable.

Also mention one or two reasonable alternatives in case the primary provider's free tier changes.

---

# 4. DO NOT CHANGE THE APPLICATION ARCHITECTURE UNNECESSARILY

The existing application has already been developed through Phase 9.

Do not rewrite the application just to fit a hosting provider.

The existing architecture is:

```text
React
Node.js
Express
PostgreSQL
```

Preserve it unless a deployment-specific change is genuinely necessary.

Do not replace PostgreSQL with another database.

Do not replace Express with another backend framework.

Do not convert the application into a completely different architecture merely to simplify deployment.

---

# 5. PRODUCTION ENVIRONMENT VARIABLES

Review all environment variables.

Ensure secrets are NOT committed to Git.

Create/update:

```text
.env.example
```

Document variables such as:

```text
NODE_ENV=
PORT=
DATABASE_URL=
SESSION_SECRET=
CORS_ORIGIN=
```

Add any additional variables required by the actual implementation.

Verify that:

- local development still works
- production variables are clearly documented
- no secret exists in source code
- `.env` is gitignored

---

# 6. FRONTEND PRODUCTION BUILD

Verify that the React application can be built for production.

Run the actual production build.

Check for:

- build errors
- broken imports
- environment variable problems
- API URL problems
- routing problems
- asset problems
- incorrect production configuration

Make sure the frontend knows the correct production backend URL.

Do not hardcode the production backend URL if environment configuration is more appropriate.

---

# 7. BACKEND PRODUCTION CONFIGURATION

Prepare Express for production.

Verify:

- correct PORT handling
- production environment handling
- CORS
- secure cookies if applicable
- authentication/session configuration
- error handling
- logging
- health endpoint
- graceful startup/shutdown

Do not expose development stack traces to users.

Ensure the backend can connect to the hosted PostgreSQL database.

---

# 8. DATABASE DEPLOYMENT

Deploy PostgreSQL using the selected free managed PostgreSQL provider.

The database must be persistent.

Verify:

- migrations can be executed
- schema is correct
- indexes exist
- constraints exist
- production database connection works
- database transactions work
- financial data persists across backend restarts/redeployments

Do NOT use ephemeral database storage.

---

# 9. DATABASE MIGRATIONS

Make sure the production database can be initialized from migrations.

Document the exact process.

For example:

```text
Create PostgreSQL database
        ↓
Set DATABASE_URL
        ↓
Run migrations
        ↓
Verify schema
        ↓
Optionally seed development/admin data
```

Do not blindly run development seed data against production.

Make it explicit which commands are safe for production.

---

# 10. PRODUCTION DATABASE SAFETY

Because this application contains financial and inventory records, production database safety is critical.

Verify that:

- transactions are atomic
- inventory updates are atomic
- foreign keys work
- constraints work
- historical transaction data persists
- transaction edits remain correct
- transaction deletions remain correct

Do not expose the PostgreSQL database directly to the public internet unless the selected provider requires a secure managed connection.

The backend should be the application's database access layer.

---

# 11. DATABASE BACKUPS

The application contains real business records.

Research the selected PostgreSQL provider's free-tier backup capabilities.

If automated backups are not included, document a simple manual backup strategy.

Provide instructions for exporting/backing up the PostgreSQL database.

The backup strategy should allow the business owner to recover historical:

- shops
- transactions
- inventory
- users
- financial records

Do not treat deployment as complete without addressing data recovery.

---

# 12. CORS AND SECURITY

Configure CORS so that the backend accepts requests from the actual production frontend.

Do NOT use:

```text
Access-Control-Allow-Origin: *
```

if the authentication architecture requires a restricted origin.

Use the production frontend URL through environment configuration.

Verify:

- HTTPS
- secure cookies where applicable
- authentication
- authorization
- CORS
- rate limiting where appropriate
- request validation
- safe error responses

Do not introduce excessive security infrastructure unnecessarily for a 4–5 person internal application.

Use proportional security.

---

# 13. HEALTH CHECK

Ensure the backend has a health endpoint such as:

```text
GET /health
```

It should return a simple successful response when the backend is running.

If appropriate, also verify database connectivity separately.

This will make diagnosing hosting issues much easier.

---

# 14. FREE-TIER LIMITATIONS

Explicitly document limitations of the chosen free hosting services.

For example, if the backend sleeps after inactivity, document:

```text
The first request after inactivity may take longer because the service needs to wake up.
```

If the PostgreSQL provider has:

- storage limits
- connection limits
- compute limits
- inactivity policies
- database expiration policies

document them.

Determine whether these limits are realistically acceptable for 4–5 users.

If a free provider has a serious limitation that makes it unsuitable for financial business data, do not use it merely because it is free.

---

# 15. PRODUCTION DEPLOYMENT

Actually deploy the application to the selected free services.

Do not stop at writing instructions.

Where possible, verify:

```text
Production frontend
        ↓
Production backend
        ↓
Production PostgreSQL
```

Verify that the complete system works.

---

# 16. END-TO-END PRODUCTION TEST

After deployment, perform a real end-to-end test against the production environment.

Test:

```text
Open production website
        ↓
Login
        ↓
Dashboard loads
        ↓
Create a test shop
        ↓
Create a test transaction
        ↓
Profit calculated correctly
        ↓
Inventory decreases
        ↓
Transaction appears in history
        ↓
Dashboard statistics update
        ↓
Analytics update
        ↓
Edit transaction
        ↓
Inventory adjusts correctly
        ↓
Profit recalculates
        ↓
Delete test transaction
        ↓
Inventory restores
        ↓
Analytics revert correctly
        ↓
Logout
```

Use clearly identifiable test data.

Do NOT leave unnecessary test transactions mixed into real production records.

---

# 17. PRODUCTION SMOKE TEST

After deployment, verify:

### Authentication

- Login works
- Logout works
- Staff permissions work
- Admin permissions work

### Shops

- Search works
- Autocomplete works
- Case-insensitive matching works

### Transactions

- Create works
- Edit works
- Delete works
- Financial calculations are correct

### Inventory

- Correct quantities
- Correct monetary values
- Correct updates

### Dashboard

- Correct statistics

### Analytics

- Correct date ranges
- Correct charts

### Database

- Data persists after backend restart/redeployment

---

# 18. README

Update the README with two clearly separated sections.

## Local Development

Document:

1. Prerequisites
2. PostgreSQL setup
3. Environment variables
4. Database creation
5. Migrations
6. Seed data
7. Backend startup
8. Frontend startup

## Production Deployment

Document:

1. Git repository setup
2. Selected hosting providers
3. PostgreSQL setup
4. Environment variables
5. Migrations
6. Frontend deployment
7. Backend deployment
8. CORS configuration
9. Production testing
10. Database backups
11. Redeployment/update process
12. Troubleshooting

The instructions should be understandable by someone who is comfortable following technical instructions but is not a DevOps expert.

---

# 19. COST VERIFICATION

At the end of the deployment phase, explicitly report:

```text
Frontend:
$0/month

Backend:
$0/month

PostgreSQL:
$0/month

Domain:
$0/month (provider subdomain)

Estimated total:
$0/month
```

Only report $0 if the selected services genuinely provide the required functionality at no cost under their current free-tier terms.

Clearly identify any optional paid upgrades.

---

# 20. DO NOT OPTIMIZE PREMATURELY

The application only has approximately 4–5 users.

Do not introduce:

- Kubernetes
- Docker orchestration
- microservices
- Redis
- message queues
- load balancers
- complicated CI/CD
- expensive monitoring
- unnecessary cloud infrastructure

unless there is a genuine requirement.

Keep the deployment simple.

The goal is:

**Reliable + secure + free + easy to maintain.**

---

# 21. FINAL DEPLOYMENT DOCUMENTATION

Create/update:

```text
DEPLOYMENT.md
```

It should contain:

- chosen architecture
- provider choices
- free-tier limitations
- setup steps
- environment variables
- database setup
- migration process
- deployment steps
- backup procedure
- redeployment procedure
- troubleshooting
- estimated monthly cost

Also update:

```text
PROJECT_STATUS.md
```

---

# 22. FINAL VERIFICATION

Before declaring Phase 10 complete:

1. Run the complete automated test suite.
2. Run the production frontend build.
3. Verify backend production startup.
4. Verify database migrations.
5. Verify production database connectivity.
6. Verify authentication.
7. Verify transaction creation.
8. Verify transaction editing.
9. Verify transaction deletion.
10. Verify inventory consistency.
11. Verify dashboard.
12. Verify analytics.
13. Verify charts.
14. Verify responsive UI.
15. Verify CORS.
16. Verify HTTPS.
17. Verify environment variables.
18. Verify no secrets are committed.
19. Verify database persistence.
20. Verify backup/recovery procedure.
21. Verify the actual monthly hosting cost is $0 under the selected free tiers.

Do not claim production readiness if critical issues remain.

---

# 23. FINAL REPORT

At the end of Phase 10 report:

### Deployment Architecture

```text
Frontend:
...

Backend:
...

Database:
...
```

### URLs

Provide the production frontend URL and backend/health URL where applicable.

### Cost

```text
Monthly cost:
$0
```

### Free-Tier Limitations

List the relevant limitations.

### Database Backup

Explain exactly how backups are performed.

### Production Test Results

List the tests performed and their results.

### Known Issues

List any remaining non-critical issues.

### Maintenance

Explain what needs to be monitored/maintained.

Finally update:

`PROJECT_STATUS.md`

with the final project status.

Do not proceed to another phase automatically.