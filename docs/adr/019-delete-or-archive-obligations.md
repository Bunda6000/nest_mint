# ADR-019: Delete or archive a bill or loan

**Status:** Accepted · **Date:** 2026-11-14

**Context:** NM-18: "Hard delete if no payments; otherwise archive with a warning; totals stay correct." A bill is paid when it has an expense (ADR-015), and the budget grid and totals are built from bills, so a paid bill must never disappear.

**Decision:**

- **`DELETE /obligations/:id`** deletes the obligation, its unpaid bills and (for a loan) its rate changes in one go. If any of its bills is paid it answers **409** with `details.paidBills` (the count) and changes nothing. 404 for an unknown or other user's obligation.
- **`POST /obligations/:id/archive`** sets `archived_at` and deletes the unpaid bills (all months). Paid bills stay, so history, the budget grid and every total are unchanged. An archived obligation is left out of `GET /obligations`, makes no new bills (the generator reads that list) and answers 404 to edits and rate changes.
- **Warning in two steps on screen:** Delete asks "delete X? unpaid bills go too"; if the API answers 409 the screen says how many payments there are and offers Archive, explaining what is kept and what is removed.
- Database: one nullable column, no new table, so no RLS change. The bills foreign key still refuses deleting an obligation that has bills; the service removes the unpaid ones first.

**Not in this slice:** unarchive and a view of archived items (they can be added without a schema change), deleting a single bill, and the ledger of everything ever paid (NM-19), which will include archived loans.

**Consequences:** the delete and archive code sits in its own module (`obligation-removal`) because it touches both obligations and bills. A bill added by mistake can be deleted until it is paid; after that it can only be archived.
