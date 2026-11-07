# ADR-001: Monorepo and stack

**Status:** Accepted · **Date:** 2026-11-07

**Context:** Web, API and calculation logic must share types and the same financial rules.

**Decision:** pnpm workspaces monorepo: `apps/web` (React, Vite, Tailwind), `apps/api` (NestJS, Prisma, PostgreSQL), `packages/finance-engine` (pure TypeScript). Node 24, TypeScript 6 strict.

**Consequences:** One install and one CI run. Every number comes from the finance engine, so web, API and future AI features agree. TypeScript 7 is postponed until the lint and test tooling support it.
