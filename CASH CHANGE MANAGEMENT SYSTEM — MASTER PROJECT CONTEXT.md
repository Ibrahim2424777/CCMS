# CASH CHANGE MANAGEMENT SYSTEM — MASTER PROJECT CONTEXT

You are the lead software architect and senior full-stack engineer responsible for building this entire application.

You will build the application incrementally in clearly defined phases.

**IMPORTANT:** This document contains the complete product requirements and architectural context. You must understand the entire system before implementing anything.

Do NOT immediately start writing the entire application.

First understand the requirements, architecture, data model, business rules, dependencies between features, and testing strategy.

The application will be developed phase-by-phase.

At the end of every phase you MUST:

1. Test the functionality implemented in that phase.
2. Run relevant automated tests.
3. Test important edge cases.
4. Verify that all previously completed functionality still works.
5. Fix any regressions before proceeding.
6. Update `PROJECT_STATUS.md`.
7. Clearly report what was implemented and tested.
8. Only then consider the phase complete.

Never knowingly leave the project in a broken state between phases.

---

# 1. PRODUCT

The application is a business management system for a company that provides **cash change / small denomination Pakistani currency bundles to retail shops and vendors**.

Shops frequently need smaller notes such as:

- Rs. 10
- Rs. 50
- Rs. 100

The business provides these notes in predefined bundles.

A shop gives us large-denomination cash and receives the equivalent value in smaller notes.

The system's primary purpose is to:

- Record transactions
- Track shops
- Track bundle quantities
- Automatically calculate transaction value
- Automatically calculate profit
- Track inventory
- Provide historical records
- Provide analytics
- Provide dashboards
- Support multiple users
- Maintain financial and inventory integrity

The application is intended for approximately **4–5 internal business users**, not thousands of concurrent users.

---

# 2. BUNDLE DEFINITIONS

Every bundle contains exactly 100 notes.

| Bundle | Notes | Value |
|---|---:|---:|
| Rs. 10 | 100 | Rs. 1,000 |
| Rs. 50 | 100 | Rs. 5,000 |
| Rs. 100 | 100 | Rs. 10,000 |

Therefore:

```text
1 × Rs. 10 bundle = Rs. 1,000
1 × Rs. 50 bundle = Rs. 5,000
1 × Rs. 100 bundle = Rs. 10,000
```

A transaction can contain:

- only Rs. 10 bundles
- only Rs. 50 bundles
- only Rs. 100 bundles
- any combination of the three

There is no requirement that all three types be used.

---

# 3. PROFIT / COMMISSION RULES

## Standard Rule

The standard commission is:

**1.5% of the total cash-change value provided.**

Example:

```text
Change provided = Rs. 10,000

Profit:
10,000 × 0.015 = Rs. 150

Amount collected:
10,000 + 150 = Rs. 10,150
```

---

## Special Rs. 10 Rule

If a transaction contains **ONLY Rs. 10 bundles**, the commission is:

**3%**

Example:

```text
3 × Rs. 10 bundles

Change value:
3 × 1,000 = Rs. 3,000

Profit:
3,000 × 0.03 = Rs. 90

Amount collected:
3,000 + 90 = Rs. 3,090
```

---

## Mixed Bundle Rule

If the transaction contains Rs. 10 bundles AND either Rs. 50 or Rs. 100 bundles, use the standard 1.5%.

Example:

```text
2 × Rs. 10
1 × Rs. 50

Change value:
2,000 + 5,000 = Rs. 7,000

Commission:
1.5%

Profit:
Rs. 105
```

The rule is:

```text
IF bundles_10 > 0
AND bundles_50 = 0
AND bundles_100 = 0

commission = 3%

ELSE

commission = 1.5%
```

This logic is a core business rule.

It must be implemented centrally on the backend.

Do NOT rely exclusively on frontend calculations.

---

# 4. FINANCIAL CONCEPTS

Always distinguish between:

### Change Value

The face value of the notes given to the shop.

Example:

```text
Rs. 10,000
```

### Profit

The commission earned.

Example:

```text
Rs. 150
```

### Amount Collected

Change value + profit.

Example:

```text
Rs. 10,150
```

These values must be clearly represented throughout the system.

---

# 5. TECHNOLOGY STACK

## Frontend

Use:

- React
- Bootstrap CSS
- React Router where appropriate
- Recharts or Chart.js for charts
- Modern React architecture

The UI must be polished and professional.

Do NOT make it look like a default Bootstrap template.

---

## Backend

Use:

- Node.js
- Express.js
- REST APIs
- EJS only if genuinely useful/necessary

React should handle the main application UI.

Express should handle:

- Authentication
- Authorization
- API
- Business logic
- Database operations
- Validation
- Analytics
- Inventory logic

---

## Database

Use:

**PostgreSQL**

PostgreSQL is already installed locally.

The application must also be structured so the database can later be hosted remotely for deployment.

---

# 6. AUTHENTICATION

The application requires authentication.

Users should be able to log in.

Store:

- id
- name
- username/email
- hashed password
- role
- created_at
- updated_at

Roles:

```text
ADMIN
STAFF
```

Passwords must never be stored in plaintext.

Use secure password hashing such as bcrypt/bcryptjs.

Use secure sessions or another appropriate authentication mechanism.

Protect API routes.

Protect frontend routes.

Implement logout.

Admins should have administrative capabilities.

Staff should not be able to perform sensitive administrative operations.

---

# 7. SHOPS

Shops must be represented as a separate database entity.

Do NOT simply store raw shop names inside transaction rows.

A shop should contain something similar to:

```text
id
shop_name
normalized_shop_name
created_at
updated_at
```

Shop names must be case-insensitive.

For example:

```text
Freshly
freshly
FRESHLY
FrEsHlY
```

must represent the same shop.

Do not allow duplicates that differ only by capitalization.

Use an appropriate PostgreSQL strategy such as:

- normalized names
- LOWER()
- unique index
- CITEXT

or another robust approach.

---

# 8. SHOP AUTOCOMPLETE

When creating a transaction, the shop field should provide autocomplete.

Example:

User types:

```text
f
```

Possible results:

```text
Freshly
Fresh Mart
Fresh Bakery
```

User types:

```text
fre
```

Only relevant matches should be returned.

Search must be case-insensitive.

If the shop doesn't exist, the user should have a convenient way to create it.

---

# 9. TRANSACTIONS

Every cash-change transaction must store:

```text
id
shop_id
transaction_date
bundles_10
bundles_50
bundles_100
total_change_value
commission_rate
profit
amount_collected
created_by
created_at
updated_at
```

The exact schema can be improved if necessary, but the underlying information must exist.

Example:

```text
Shop: Freshly

10 bundles: 2
50 bundles: 1
100 bundles: 0

Change:
2 × 1,000 + 1 × 5,000
= Rs. 7,000

Commission:
1.5%

Profit:
Rs. 105

Amount collected:
Rs. 7,105
```

Historical financial values should remain auditable.

---

# 10. TRANSACTION DATE

Users must be able to create transactions for:

- today
- yesterday
- previous dates
- historical dates

The system must not force every transaction to use the current date.

Use proper timestamp/date handling and make timezone behavior appropriate for Pakistan.

---

# 11. INVENTORY

The system tracks the current number of bundles available.

Track:

```text
Rs. 10 bundles
Rs. 50 bundles
Rs. 100 bundles
```

The interface should show:

```text
Bundle count
Individual note count
Monetary value
```

Example:

```text
Rs. 10
15 bundles
1,500 notes
Rs. 15,000

Rs. 50
8 bundles
800 notes
Rs. 40,000

Rs. 100
12 bundles
1,200 notes
Rs. 120,000

Total
35 bundles
3,500 notes
Rs. 175,000
```

---

# 12. INVENTORY TRANSACTION LOGIC

When a transaction is created:

```text
Inventory decreases
Transaction is created
```

If insufficient inventory exists:

```text
Reject transaction
Do not partially execute it
Do not create the transaction
Do not modify inventory
```

Example:

```text
Available:
2 Rs. 10 bundles

Requested:
4 Rs. 10 bundles

Result:
REJECT
```

---

# 13. ATOMIC TRANSACTIONS

Transaction creation must use a PostgreSQL database transaction.

Conceptually:

```text
BEGIN

Validate shop
Validate quantities
Lock/check inventory
Verify sufficient inventory
Calculate change value
Calculate commission
Calculate profit
Calculate amount collected
Insert transaction
Update inventory

COMMIT
```

If anything fails:

```text
ROLLBACK
```

Never allow:

```text
Transaction exists but inventory wasn't updated
```

or:

```text
Inventory was deducted but transaction wasn't created
```

---

# 14. EDITING TRANSACTIONS

Editing transactions is critical.

Example original:

```text
2 × Rs. 10
1 × Rs. 50
```

The inventory was already reduced.

If edited to:

```text
1 × Rs. 10
3 × Rs. 50
```

the system must:

1. Restore the original inventory quantities.
2. Check availability for the new quantities.
3. Deduct the new quantities.
4. Recalculate change value.
5. Recalculate commission.
6. Recalculate profit.
7. Recalculate amount collected.
8. Save everything atomically.

---

# 15. DELETING TRANSACTIONS

When a transaction is deleted:

- Restore its bundle quantities to inventory.
- Remove/void the transaction appropriately.
- Update analytics automatically.

Deletion must be protected by a confirmation dialog.

---

# 16. DASHBOARD

Dashboard is the primary landing page after login.

It should show:

## Today

- Total change provided
- Profit
- Number of transactions
- Shops served

## This Week

- Total change
- Profit
- Transactions

## This Month

- Total change
- Profit
- Transactions

## Inventory

- Rs. 10 bundles
- Rs. 50 bundles
- Rs. 100 bundles
- Total inventory value

Also show:

- Recent transactions
- Profit trend
- Useful visual summaries

The dashboard should immediately answer:

> "How is the business doing?"

---

# 17. ANALYTICS

Create a dedicated analytics/reporting page.

Support:

```text
Today
Yesterday
Last 7 days
Last 30 days
This week
This month
Previous month
Custom date range
```

Display:

- Total transactions
- Unique shops
- Total change provided
- Total profit
- Average transaction value
- Average profit per transaction
- Most frequent shops
- Most commonly distributed bundle
- Bundle quantities distributed
- Profit trend
- Inventory

---

# 18. CHARTS

Use charts when they provide useful information.

Examples:

### Profit Over Time

Line chart.

### Cash Change Over Time

Bar/line chart.

### Bundle Distribution

Compare:

- Rs. 10
- Rs. 50
- Rs. 100

### Profit Trends

Day/week/month depending on selected period.

Charts should update when date filters change.

Charts should be responsive.

Use useful tooltips and labels.

Do not add charts purely for decoration.

---

# 19. TRANSACTION HISTORY

Create a transaction history page.

Columns:

```text
Date
Shop
Rs. 10 bundles
Rs. 50 bundles
Rs. 100 bundles
Change value
Commission
Profit
Amount collected
Created by
Actions
```

Actions:

```text
View
Edit
Delete
```

Include:

- Search
- Shop filtering
- Date filtering
- Sorting
- Pagination

Prefer server-side filtering/pagination for scalability.

---

# 20. SHOP MANAGEMENT

Create a shop management page.

Show:

- Shop name
- Number of transactions
- Total change received
- Total profit generated
- Last transaction

Allow:

- Add
- Edit
- Search
- View history

Shop detail page should show:

```text
Total Transactions
Total Change
Total Profit
Average Transaction
Last Transaction
```

and the shop's transaction history.

---

# 21. API

Use a clean REST API.

Suggested structure:

```text
/api/auth
/api/users
/api/shops
/api/transactions
/api/inventory
/api/analytics
```

Possible endpoints:

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/shops
POST   /api/shops
GET    /api/shops/:id
PUT    /api/shops/:id
DELETE /api/shops/:id
GET    /api/shops/search?q=

GET    /api/transactions
POST   /api/transactions
GET    /api/transactions/:id
PUT    /api/transactions/:id
DELETE /api/transactions/:id

GET    /api/inventory

GET    /api/analytics/dashboard
GET    /api/analytics/profit
GET    /api/analytics/change
GET    /api/analytics/bundles
```

You may improve the exact structure where appropriate.

---

# 22. VALIDATION

Validate on both frontend and backend.

Rules include:

- quantities must be integers
- quantities cannot be negative
- at least one bundle must be selected
- inventory must be sufficient
- dates must be valid
- users must be authenticated
- permissions must be checked
- financial values must be calculated server-side

Return useful human-readable errors.

---

# 23. DATABASE INTEGRITY

Use:

- foreign keys
- unique constraints
- NOT NULL
- CHECK constraints
- indexes

Important indexes include:

- transaction date
- shop ID
- normalized shop name
- created_by

---

# 24. MONEY HANDLING

Do not use unsafe floating-point calculations for monetary values.

Use PostgreSQL NUMERIC/DECIMAL or integer minor units where appropriate.

The system must accurately represent:

```text
Rs. 10,000
Rs. 150
Rs. 10,150
```

without floating-point errors.

---

# 25. UI/UX

The UI must be professional.

Use:

- React
- Bootstrap
- custom CSS where necessary

Do NOT produce a bland default Bootstrap website.

The interface should have:

- strong visual hierarchy
- consistent spacing
- professional typography
- subtle shadows
- useful cards
- clear tables
- responsive forms
- loading states
- empty states
- error states
- confirmation dialogs
- toast notifications

Avoid:

- excessive gradients
- excessive animations
- random colors
- huge empty spaces
- generic AI dashboard aesthetics
- unnecessary decoration

The application should feel like a real business tool.

---

# 26. NAVIGATION

Suggested navigation:

```text
Dashboard
Transactions
Shops
Inventory
Analytics
Users        [Admin only]
Settings
Logout
```

Use responsive navigation on mobile/tablet.

---

# 27. RESPONSIVENESS

Support:

- desktop
- laptop
- tablet
- mobile

Transaction entry should be particularly mobile-friendly.

---

# 28. ERROR HANDLING

Handle:

- insufficient inventory
- invalid input
- database errors
- network errors
- expired authentication
- unauthorized access
- duplicate shop
- invalid date
- missing shop

Never expose raw stack traces to normal users.

---

# 29. LOADING STATES

Use:

- spinners
- skeletons where appropriate
- disabled submit buttons while requests are processing
- appropriate feedback for longer operations

Prevent accidental duplicate submissions.

---

# 30. AUDITABILITY

Because the application handles money, maintain:

- created by
- updated by where appropriate
- created timestamp
- updated timestamp

A dedicated audit log can be implemented if useful.

---

# 31. PROJECT STRUCTURE

Use a clean architecture similar to:

```text
project/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── utils/
│   │   └── App.jsx
│   │
│   └── package.json
│
├── server/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── models/
│   ├── db/
│   ├── utils/
│   └── server.js
│
├── database/
│   ├── migrations/
│   └── seed/
│
├── .env.example
├── README.md
└── package.json
```

You may improve the structure if you have a strong reason.

---

# 32. ENVIRONMENT

Use environment variables.

Example:

```text
DATABASE_URL=
PORT=
SESSION_SECRET=
NODE_ENV=
```

Never hardcode secrets.

Provide `.env.example`.

---

# 33. TESTING

Critical business logic must be tested.

At minimum:

```text
Rs. 10,000 → 1.5% → Rs. 150

Rs. 3,000 only Rs. 10 → 3% → Rs. 90

Rs. 10 + Rs. 50 → 1.5%

Inventory decreases after transaction

Inventory restored after deletion

Inventory correctly adjusted after editing

Cannot exceed available inventory

Freshly == freshly == FRESHLY
```

Also test API routes and important integration flows.

---

# 34. SEED DATA

Provide development seed data for:

- users
- shops
- transactions
- inventory

Make it clear that this is development data only.

---

# 35. DEPLOYMENT

The application will initially run locally with PostgreSQL.

However, structure it so it can later be deployed.

Deployment architecture:

```text
React Frontend
       ↓
Node/Express Backend
       ↓
PostgreSQL
```

Provide deployment instructions in README.

---

# 36. FUTURE EXTENSIBILITY

Do not implement these now unless required, but do not architect the system in a way that makes them unnecessarily difficult later:

- more denominations
- multiple locations
- additional providers/employees
- expenses
- CSV/Excel exports
- PDF reports
- WhatsApp notifications
- shop credit/debt
- advanced audit logs
- restocking
- daily closing reports

---

# 37. NON-NEGOTIABLE BUSINESS RULES

These must never be changed:

```text
Rs. 10 bundle = Rs. 1,000
Rs. 50 bundle = Rs. 5,000
Rs. 100 bundle = Rs. 10,000

Standard commission = 1.5%

ONLY Rs. 10 bundles = 3%

Rs. 10 + Rs. 50/100 = 1.5%
```

Do not invent taxes, fees, exchange rates, or other business rules.

---

# 38. DEVELOPMENT METHODOLOGY

The application MUST be developed in phases.

Do not attempt to implement everything at once.

Each phase must:

1. Build only the functionality required for that phase.
2. Integrate with the existing application.
3. Run tests.
4. Test important edge cases.
5. Run the application where practical.
6. Verify existing features.
7. Fix regressions.
8. Update `PROJECT_STATUS.md`.

After each phase, report:

```text
PHASE:
Status:

Implemented:
- ...

Tests:
- ...

Regression checks:
- ...

Known issues:
- ...

Files changed:
- ...

Next phase:
- ...
```

---

# 39. PROJECT_STATUS.md

Create and maintain:

```text
PROJECT_STATUS.md
```

This file should contain:

- current phase
- completed phases
- current implementation status
- database status
- API status
- frontend status
- tests
- known issues
- next phase
- important architectural decisions

Update it at the end of every phase.

This file is important because it acts as the project's persistent development state.

---

# 40. REGRESSION POLICY

This is extremely important.

Before starting a new phase:

> Assume everything from previous phases must continue working.

Never rewrite working functionality unnecessarily.

When modifying shared code:

1. Identify what existing functionality depends on it.
2. Make the change.
3. Run existing tests.
4. Run new tests.
5. Manually verify affected workflows.
6. Fix regressions.

Do not sacrifice previously working functionality just to implement a new feature.

---

# 41. CODE QUALITY

Write production-quality code.

Use:

- clear naming
- separation of concerns
- reusable components
- centralized business logic
- proper error handling
- clean API design
- database constraints
- appropriate comments
- consistent formatting

Do not scatter the commission calculation across multiple files.

Create centralized business logic for things such as:

```text
calculateBundleValue()
calculateCommissionRate()
calculateProfit()
calculateAmountCollected()
```

---

# 42. IMPORTANT DEVELOPMENT RULE

When you are unsure about an implementation detail, prefer:

1. Existing project requirements
2. Existing architecture
3. Existing code
4. Database integrity
5. Financial correctness
6. Security
7. Simplicity
8. UX

Do not introduce unnecessary technologies simply because they are popular.

Do not add dependencies unless they provide meaningful value.

---

# 43. FINAL PRODUCT

The final user workflow should be:

```text
LOGIN
 ↓
DASHBOARD
 ↓
SEE TODAY/WEEK/MONTH PERFORMANCE
 ↓
CREATE TRANSACTION
 ↓
SEARCH SHOP
 ↓
SELECT BUNDLES
 ↓
SEE CHANGE VALUE
 ↓
SEE AUTOMATIC PROFIT
 ↓
SAVE
 ↓
INVENTORY UPDATES
 ↓
TRANSACTION APPEARS IN HISTORY
 ↓
ANALYTICS UPDATE
```

The finished product must feel like a real internal financial/business management application rather than a basic CRUD/student project.

---

# 44. YOUR ROLE

You are responsible for making reasonable engineering decisions when the requirements do not specify an exact implementation.

However:

**Do not change business rules without explicitly explaining why.**

If a requirement is ambiguous and materially affects the database, financial calculations, security, or user workflow, stop and ask for clarification rather than silently inventing a business rule.

For minor implementation details, use reasonable engineering judgment.

---

# 45. NEXT STEP

Do NOT implement the application yet.

The next instruction will tell you which phase to implement.

When a phase is requested:

1. Review the entire master context.
2. Review the existing codebase.
3. Review `PROJECT_STATUS.md`.
4. Determine what has already been implemented.
5. Implement ONLY the requested phase.
6. Test it thoroughly.
7. Check for regressions.
8. Update `PROJECT_STATUS.md`.
9. Report the result.

Wait for the phase instruction.