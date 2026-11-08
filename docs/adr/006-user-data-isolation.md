# ADR-006: User data isolation

**Status:** Accepted · **Date:** 2026-11-08

**Context:** NestMint holds personal financial data. One missing `WHERE user_id = …` would show one user's money to another, so safety cannot rely on remembering.

**Decision:** Four layers, each checked by a test.

1. **Ownership in the schema:** every table except `users` has `user_id`, a foreign key to `users` with `ON DELETE CASCADE`. `src/prisma/schema-ownership.spec.ts` fails CI for a new table that does not.
2. **Same-owner links in the database:** child rows reference their parent together with the owner (`categories` → `category_groups` on `(id, user_id)`), so a row can never point at another user's parent, even through a bug. Tested with a direct insert.
3. **Repositories always take the owner:** every method of a user-data repository has `userId` as its first parameter and filters by it, including in nested reads. Controllers pass `@CurrentUser()`; there is no way to call a repository without one.
4. **Two-user tests per endpoint:** `categories.e2e.spec.ts` registers two users and proves neither sees the other's rows. Copy its `newUser()` helper for every new user-data endpoint. For lookups by id, return 404 (not 403) for another user's row, so ids do not leak.

Row Level Security stays on for every table to block Supabase's public API (ADR-005).

**Default categories** are created on a user's first read, not at registration, behind a one-time flag (`users.categories_seeded_at`) claimed inside a transaction. This also covers accounts that existed before categories did, keeps registration fast, and means categories a user deletes are never brought back.

**Consequences:** A repository author could still forget the filter inside a method; layers 2 and 4 are what catch that. Reads of single rows by id will use `findFirst({ where: { id, userId } })`.
