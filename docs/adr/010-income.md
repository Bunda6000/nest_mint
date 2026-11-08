# ADR-010: Income

**Status:** Accepted · **Date:** 2026-11-09

**Context:** NM-11 needs a monthly salary and one-off income. NM-5 (monthly totals) and the dashboard later need "how much came in during month X".

**Decision:**

- **A monthly salary is stored once**, not as a row per month: amount, pay day (1 to 31; short months use their last day), first month, and an optional last month. A month's income is worked out from these in the finance engine (NM-5), so no month can be missed or counted twice and no background job is needed. One-off income (bonus, refund) is stored with its date. Both live in one table, `incomes`.
- **Salary changes.** Editing the amount changes it for every month, including past ones. For a raise, set the last month on the old salary and add the new one, so past months stay correct. The edit form says so. Effective-dated amounts on a single salary were considered and left out as more complexity than one user needs; they can be added later without breaking stored data.
- **Assumption (not yet confirmed by the owner):** the salary is the same amount every month. If a month differs, add a one-off entry for the difference. Revisit if that turns out to be common.
- **The type cannot be edited** (delete and add again), like the kind of a transaction in ADR-009. Fields that belong to the other type are refused (`400`, naming the field).
- **Delete is permanent after a confirmation**, as for expenses (ADR-009). Not found, not yours and a non-UUID id all answer `404`.
- **The database checks the shape**: amount 1 to 100,000,000, name 1 to 60 characters, pay day 1 to 31, months stored as the first of the month, end not before start, and monthly rows have a start month and pay day while one-off rows have only a date. Row Level Security is on.
- **Ownership** is enforced in the same three layers as expenses: service lookup by owner, a `userId` filter in every repository method (tested by calling the repository directly), and the user foreign key with cascade delete.
- **Euro amounts are display only.** A one-off shows its euro value at the rate of its date; a monthly salary at today's rate.

**Consequences:** NM-5 adds `incomeInMonth` to the engine and the monthly totals endpoint. The Income screen does not show a "this month" total until then.
