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

Schema change: edit `apps/api/prisma/schema.prisma`, then `pnpm --filter @nestmint/api prisma:migrate --name <change>`.

## Checks (same as CI)

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

## Workflow

Commits go directly to `main`. CI runs on every push (see `docs/adr/003-trunk-based-workflow.md`).
