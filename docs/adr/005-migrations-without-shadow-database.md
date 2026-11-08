# ADR-005: Migrations without a shadow database

**Status:** Accepted · **Date:** 2026-11-08

**Context:** `prisma migrate dev` replays all migrations in a scratch database. Our RLS migration (`20261107230000_enable_rls`) alters Prisma's own `_prisma_migrations` table, which does not exist in that scratch database, so the command fails. The migration is already applied in the hosted database, so it is not edited.

**Decision:** Generate migrations with `prisma migrate diff` (local database vs schema), save the SQL by hand, and apply with `prisma migrate deploy`. See the README.

**Consequences:** Three manual steps instead of one command, but it works on every machine and keeps RLS in each migration. Revisit if Prisma supports skipping the shadow database.
