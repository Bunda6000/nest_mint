# ADR-009: Editing, deleting and cash withdrawals

**Status:** Accepted · **Date:** 2026-11-08

**Context:** Expenses were add-only. NM-25 needs a monthly list with edit and delete; NM-26 needs cash withdrawals that leave the bank account but still count as expenses.

**Decision:**

- **Delete is permanent**, after an explicit confirmation ("Delete this expense? This cannot be undone."). Unlike categories (ADR-007), an expense has no history that other data depends on. Not found, not yours and a non-UUID id all answer `404`.
- **A cash withdrawal is a transaction with `kind = cash_withdrawal`** (Postgres enum `transaction_kind`, default `expense`), not a category convention. Renaming or archiving the "Cash withdrawal" category cannot hide it, and the balance check-in (NM-31) can later tell which spending left the bank account. It counts in every expense total. The **kind cannot be edited**: delete and re-add instead.
- **Editing is a partial `PATCH`.** Only sent fields change; an empty note clears it. Moving an expense to **another** category needs an active one (`409` if archived, `404` if it is not yours). **Keeping its own category is always allowed**, even if that category was archived since, so old entries stay editable. The no-future-date rule (tomorrow allowed) applies to edits too.
- **A month is `GET /transactions?month=YYYY-MM[&categoryId=…]`**: all rows of that calendar month, newest first, and `totalMkd` of exactly the rows listed (so it follows the category filter). `categoryId` without `month` is refused (`400`). Without `month` the old "newest N" list is unchanged.
- **The month's EUR total is `total MKD ÷ the rate on the last day of the month`**, the same as the spreadsheet's `=C/61.5` on a total. Each row shows its own EUR at its own date's rate, so with a single rate the rows can differ from the total by a cent or two of rounding. The official monthly totals are defined later in NM-5.
- **Ownership is enforced in three layers**, each tested on its own: the service looks the row up by owner first, every repository method filters by `userId` (tested by calling the repository directly), and the composite foreign key refuses a foreign category.

**Consequences:** Existing rows are `expense` after the migration, which only adds a defaulted column. The web edit form is the same `ExpenseForm` as the add form, so both follow the same rules.
