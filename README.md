# Wealth — Personal Finance Dashboard

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql)

A full-stack personal finance application built for tracking transactions, balances, investments, and cashflow across multiple accounts and currencies.

<!-- screenshot -->

## Features

### Core Modules
- **Transactions** — Full CRUD with inline editing, filters, sort, CSV export/import, duplicate detection, and "Apply to Similar" bulk categorization
- **AI Import** — Upload bank statement screenshots and let Claude/Gemini/OpenAI extract transactions automatically. Includes duplicate detection against DB, review screen with editable cells, and re-analysis with feedback
- **Balances** — Real-time net worth computed from all transactions + equity positions. Shows assets (cash + investments) and liabilities with Net Worth Evolution chart
- **Plan vs Real** — Monthly budget planning with variance analysis across all income and expense categories
- **Cashflow** — Rolling 12-month cashflow with encadenated Opening Balance, simulation mode for plan editing, COP/USD toggle with projected TRM
- **Equity** — Investment portfolio tracker with monthly forecast, actual market value input, Net Flow from transactions, and estimated Cierre Real
- **FX Rates** — Automatic daily USD/COP rate ingestion with backfill and monthly reference rates
- **Data Source** — CRUD for accounts, categories, and event types. Creating an investment account auto-generates Equity rows
- **Dashboard** — KPI overview with income vs expense, monthly breakdown, and equity allocation

### Technical Features
- Multi-user authentication (JWT, httpOnly cookies, 30-day sessions)
- Dark/light mode with persistent preference
- Fully dynamic account system — no hardcoded account names anywhere
- Server-side pagination with server-computed summaries (fixes pagination bugs on totals)
- Colombian number format handling in AI Import (period=thousands, comma=decimal)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + CSS variables |
| ORM | Prisma 7 with PrismaPg adapter |
| Database | PostgreSQL 15 |
| Charts | Recharts |
| Auth | JWT (jose) + bcryptjs |
| AI Providers | Anthropic Claude, Google Gemini, OpenAI |
| Container | Docker (PostgreSQL) |

## Project Structure

```
wealth/
├── app/
│   ├── (dashboard)/          # Protected routes
│   │   ├── transactions/     # Transaction list + CRUD
│   │   ├── ai-import/        # AI bank statement importer
│   │   ├── balances/         # Net worth + asset allocation
│   │   ├── plan/             # Plan vs Real budget module
│   │   ├── cashflow/         # Rolling cashflow simulation
│   │   ├── equity-forecast/  # Investment portfolio tracker
│   │   ├── fx-rates/         # FX rate management
│   │   ├── data-source/      # Catalog management
│   │   └── dashboard/        # KPI overview
│   ├── api/                  # API routes (one per module)
│   ├── components/           # Shared components (Sidebar, ThemeProvider)
│   └── generated/            # Prisma client (auto-generated)
├── prisma/
│   ├── schema.prisma         # DB schema
│   ├── seed.ts               # Initial data seed
│   ├── seedAuth.ts           # User creation + data migration
│   └── migrateDollarApp.ts   # Dollar App account split migration
├── lib/
│   ├── prisma.ts             # Prisma singleton
│   ├── auth.ts               # JWT session management
│   └── fxService.ts          # FX rate fetch + backfill
└── middleware.ts             # Auth middleware (Next.js 16: exported as 'proxy')
```

## Database Schema

Key models:
- **User** — email, password (bcrypt), name
- **Transaction** — date, month_label, event_type, level_1/2/3, amount (COP), usd_amount, fx_rate, from_account, to_account, notes, user_id
- **AccountDef** — name, type (cash/investment/debt), is_active, user_id
- **CategoryDef** — level_1, level_2, level_3, is_active, user_id
- **EventTypeDef** — name, is_active, user_id
- **PlanVsAchievement** — month_label, event_type, level_2, level_3, plan, user_id
- **EquityForecast** — account, equity_type, annual_rate, monthly_rate, planned_contribution, user_id
- **EquityExecuted** — platform, start_balance, market_value_end, user_id
- **FxRate** — monthly reference rates
- **DailyFxRate** — daily USD/COP rates

## Getting Started

### Prerequisites
- Node.js 18+
- Docker Desktop
- npm

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/pjuan97/wealth.git
cd wealth

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your values

# 4. Start PostgreSQL
docker compose up -d

# 5. Run database migrations
npx prisma db push
npx prisma generate

# 6. Seed initial data (creates users + default catalogs)
DATABASE_URL="postgresql://wealth_user:wealth_pass@localhost:5435/wealth_db" \
  npx tsx prisma/seedAuth.ts

# 7. Start the development server
npm run dev -- --port 3001
```

Open [http://localhost:3001](http://localhost:3001)

## Environment Variables

```env
# Database connection
DATABASE_URL="postgresql://wealth_user:wealth_pass@localhost:5435/wealth_db"

# JWT secret for session signing
JWT_SECRET="your-secret-key-here"
```

## Seed Users

The seed creates two accounts, `juan@wealth.app` and `dani@wealth.app`. Their
passwords are read from the environment, never stored in this repo:

```bash
SEED_JUAN_PASSWORD="..." SEED_DANI_PASSWORD="..." npx tsx --env-file=.env prisma/seedAuth.ts
```

## Module Guide

### Transactions
- Browse by month using the tab navigation
- **Inline edit** any field by double-clicking the cell
- **Apply to Similar** — hover a row and click "↓ Apply" to propagate category changes to all transactions with the same notes
- **Find Duplicates** — scans all transactions for exact matches (date + amount + notes)
- **Export CSV** — choose current month, all time, or a custom range
- **Import CSV** — upload a modified CSV to bulk update transactions

### AI Import
1. Upload 1–3 screenshots of your bank statement (more images = more errors)
2. Enter your API key (Anthropic, Gemini, or OpenAI — never stored)
3. Review extracted transactions — edit any field inline
4. Transactions already in DB are auto-detected and deselected (badge: IN DB)
5. Click "Import X Transactions" to save

### Balances
- Net Worth = all cash accounts (from transactions) + investment accounts (from EquityExecuted) − debt accounts
- Chart shows 2026 evolution only
- All accounts read dynamically from AccountDef — no hardcodes

### Cashflow
- Rolling Opening Balance: Jan = real balance from selected cash accounts, Feb+ = previous month's closing balance
- **Simulation mode** — double-click any Plan cell to edit; changes propagate through the entire year in real time
- Save changes → syncs back to Plan vs Real
- Toggle COP/USD — projected months use average TRM from available daily rates

### Equity
- Monthly portfolio tracker per investment account
- **Cierre Real** — enter actual market value; if empty, estimated from Start Balance + Net Flow from transactions
- Net Flow computed automatically from all transactions involving that account

### Data Source
- Manage accounts, categories, and event types
- Creating an investment account automatically generates 12 months of EquityForecast + EquityExecuted rows
- Deactivating an account hides it from all dropdowns (data preserved)

## Git Workflow

```bash
# Always branch before work — never code on main
git checkout main && git pull origin main
git checkout -b feature/WEALTH-XXX-description

# After approval:
git checkout main
git merge feature/WEALTH-XXX-description
git push origin main
```

Branch naming: `feature/WEALTH-XXX-description`

## Notes

- **Number format**: The AI Import handles Colombian number format (period = thousands separator, comma = decimal). Example: `$935.743,74` → `935743.74`
- **Next.js 16 breaking change**: Middleware is exported as `proxy` (not `middleware`) due to a v16 naming conflict
- **CURRENT_MONTH**: Hardcoded as `'2026-06'` in several files — update monthly or make dynamic
- **Dollar App**: Split into `Dollar App (Cash)` (type: cash) and `Dollar App (ETFs)` (type: investment) — transactions must use the correct account name
