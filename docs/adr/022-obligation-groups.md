# ADR-022: Multi-line obligations as groups

**Status:** Accepted · **Date:** 2026-11-15

**Context:** NM-17: "Lines per obligation (e.g. Netflix, Disney; Tucson fuel, insurance; Punto) each with own amount and category." In Budget.xlsx the Стриминг, Претплати and Автомобили sheets are one sheet per topic with one column per line (Netflix, Disney, GoogleOne; Hyundai Tucson: Гориво…), a yearly total for the whole sheet, and one amount per line per month. In the template copy of the workbook these sheets are empty for 2026.

**Decision:**

- A new table **`obligation_groups`** (id, user, name) and a nullable `obligations.group_id`. A **line is an ordinary obligation** (bill, own amount, own category, own recurrence, own bills and payments) that points at a group. The group only ties lines together for display and totals.
- Why not "one obligation with several amounts": bills are one per obligation and month (ADR-014), paid with one expense in one category (ADR-015). Several amounts under one bill would break category totals, the budget grid and payments. Lines as separate obligations reuse all of that unchanged.
- Names are unique per user, ignoring letter case (409 otherwise; the database holds the exact-match unique index). Composite foreign key keeps a line in its owner's group (ADR-006); the table has row level security.
- API: `GET /obligations` now also returns `groups`; `POST /obligations/groups`, `PATCH /obligations/groups/:id`, `DELETE /obligations/groups/:id` (204; 409 while it has lines, archived ones included). A bill joins a group with `groupId` on create or edit, and leaves it with `groupId: null`.
- Screen: each group is a card with its lines, "Add a line", Rename, and Delete (only while empty). The card shows the count of lines and what the monthly lines cost every month.

**Not in this slice:** moving an existing bill into a group from the screen (the API supports it), grouping loans and installment plans (they stand alone), and the group's yearly and lifetime totals, which come with the obligation ledger (NM-19) and read across the lines.

**Consequences:** the Excel import (E9) can create a group per sheet and a line per column. Deleting a line leaves the group in place so it can be refilled.
