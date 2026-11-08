# ADR-007: Archive instead of delete (categories)

**Status:** Accepted · **Date:** 2026-11-08

**Context:** Transactions will point at categories. Deleting a category would either erase history or leave transactions without a name.

**Decision:**

- Groups and categories are **archived** (`archived_at`), never deleted by the API. Archived items disappear from normal lists and pickers; `GET /categories?includeArchived=true` returns them flagged `archived`.
- Archiving a group archives all its categories. Restoring a group restores only the group. A category cannot be restored while its group is archived.
- A restored item goes to the **end** of its list, so saved positions never collide.
- Names are unique per user (groups) and per group (categories), **ignoring capital letters and including archived items**. A clash with an archived name answers `NAME_IN_ARCHIVE` ("restore it instead"); a clash with an active one answers `NAME_TAKEN`. The unique constraints in the database stay the final guard against two simultaneous requests.
- Reordering sends the complete new order of the active items. If the list no longer matches (for example it was changed in another tab) the API answers `CONFLICT` and the web app reloads.

**Why not let archived names be reused:** it needs a partial unique index, which Prisma cannot describe in its schema, so every `prisma:diff` would try to drop it (see ADR-005).

**Consequences:** Nothing a user does here loses history. Moving a category to another group and merging categories are not supported yet (backlog).
