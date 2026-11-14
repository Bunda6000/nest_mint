# NestMint

Personal financial coach: tracks bills, loans, installments and daily spending, shows monthly net savings, and helps reach savings goals.

Product docs (analysis, requirements, PRD, roadmap, backlog) live in Notion under **NestMint**.

## Structure

| Path                      | What                                         |
| ------------------------- | -------------------------------------------- |
| `apps/web`                | React + TypeScript + Vite + Tailwind         |
| `apps/api`                | NestJS API (`/api/v1`), Prisma, PostgreSQL   |
| `packages/finance-engine` | Pure TypeScript calculations, shared by all  |
| `packages/shared`         | Validation schemas and API types (web + API) |
| `docs/adr`                | Architecture decisions                       |

## Run locally

Requirements: Node 24 (22+ works), pnpm 9, Docker (for PostgreSQL).

```bash
pnpm install
cp .env.example .env
pnpm db:up                                  # PostgreSQL on localhost:5432
pnpm --filter @nestmint/api prisma:generate
pnpm --filter @nestmint/api prisma:deploy  # apply database migrations
pnpm dev:api                                # http://localhost:3000/api/v1/health
pnpm dev:web                                # http://localhost:5173 (register: /register)
```

No Docker? Install PostgreSQL 17 locally and set `DATABASE_URL` in `.env`.

Log in locally: register at `/register`, then log in at `/login`. Set your own `JWT_SECRET` in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

## API at a glance

`/api/v1`: `auth/register`, `auth/login`, `auth/refresh`, `auth/logout`, `me`, `categories` (list, add, rename,
archive/restore, reorder), `transactions` (add, recent or one month, edit, delete),
`income` (list, add, edit, delete), `obligations` (recurring bills: list, add, edit; `POST obligations/loans` adds a loan, with the monthly payment worked out if left empty; `GET obligations/:id/ledger?year=` is an obligation's history by year with totals; `POST obligations/groups` (and `PATCH`/`DELETE obligations/groups/:id`) manage groups of lines such as Streaming, a bill joins one with `groupId`; `POST obligations/installments` adds an installment plan (contract total, first and regular installment; the last month is worked out); `POST obligations/:id/rate-changes` records a rate change with the new payment typed in; `POST obligations/:id/extra-payments` and `POST obligations/:id/payoff` record extra money paid and an early payoff; `DELETE obligations/:id` deletes one without payments, `POST obligations/:id/archive` archives one with payments), `bills` (`GET bills/inbox?tab=due|overdue|paid`, `GET bills?month=`, `POST bills/sync` catches up missing bills, `POST bills/generate?month=`, `POST bills/:id/pay`, `POST bills/pay` for several, `POST bills/:id/undo-payment`, `PATCH bills/:id` for the actual amount and invoice reference), `summary` (one month's totals), `insights` (spending breakdown and 12-month history for the dashboard charts), `balance-check-ins` (`GET balance-check-ins?month=`, `PUT balance-check-ins/:month` saves the real balance of the main account and shows how much money is unaccounted for), `imports` (`POST imports/budget/preview` reads an uploaded Budget.xlsx and shows what it contains, saving nothing), `budget` (`GET budget?year=` the Буџет grid: groups by twelve months, planned and actual), `health`.
Everything except health and the auth endpoints needs a login. User data follows
`docs/adr/006-user-data-isolation.md`.

## Database changes

1. Edit `apps/api/prisma/schema.prisma`.
2. Generate the SQL: `pnpm --filter @nestmint/api prisma:diff` (compares your local database with the schema).
3. Save it as `apps/api/prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` and add
   `ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;` for every new table (a test fails without it).
4. Apply it: `pnpm --filter @nestmint/api prisma:deploy`.

Do not use `prisma migrate dev` (see `docs/adr/005-migrations-without-shadow-database.md`).

## Checks (same as CI)

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

## Workflow

Commits go directly to `main`. CI runs on every push (see `docs/adr/003-trunk-based-workflow.md`).
