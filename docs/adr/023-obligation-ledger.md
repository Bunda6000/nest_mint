# ADR-023: Obligation ledger (history of one bill)

**Status:** Accepted · **Date:** 2026-11-15

**Context:** NM-19: "Year switcher; rows show period, invoice ref, amount, paid date; totals in MKD and EUR." In Budget.xlsx each bill sheet (Струја, Водовод, Телеком…) is a year-by-year list with a "Тотал" and "Платено" block.

**Decision:**

- `GET /obligations/:id/ledger?year=2026` returns the bills of that year (oldest period first) with the year's total, what of it is paid, and the total of all years. `years` lists the years that have bills, plus the one asked for. `year` defaults to the current year; a malformed one is a 400 naming `year`.
- It reuses the accrual rule of NM-6 (`obligationTotals`): a bill counts in the year of its billing period, not the year it was paid. A row's amount is what was paid, else the invoice amount, else the expected amount (`billAmount`).
- It reads bills only, so it also works for an **archived** obligation that has bills, which keeps the history of an old loan or bill readable. An obligation with no bills at all that is archived or unknown answers 404, as does another user's.
- The screen is `/obligations/:id/history`, reached with a **History** button on each bill. Euro amounts are converted on the paid day (or the due day while unpaid); the totals use today's rate, like the rest of the app.
- Code sits in its own module (`obligation-ledger`) because it reads both obligations and bills.

**Not in this slice:** a list of archived obligations to open their history from (the ledger endpoint is ready for it), grouped totals across the lines of a group, and a printable or exportable version.
