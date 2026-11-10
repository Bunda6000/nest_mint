# ADR-016: The budget grid and the needs-attention panel

**Status:** Accepted · **Date:** 2026-11-10

**Context:** NM-27 is the Буџет sheet as a screen: category groups by twelve months, with income, expense and net totals. NM-30 puts overdue and soon-due bills on Home. Budget.xlsx records what was paid and has no plan row; the PRD asks for planned vs actual on every amount. The only plan the app has is the expected amount of a bill.

**Decision:**

- **One endpoint, whole denars:** `GET /budget?year=YYYY` returns the grid of one year (income, a row per group, expense total, net, savings rate; row and column totals). The maths is `budgetGrid` in the finance engine; the API only fetches the data and maps names. Euro is derived by the app (ADR-008).
- **Actual = cash view.** Spending is summed per group and month by paid date, cash withdrawals included, so a row's total, a column's total and `sumByMonth` always agree. Income is by schedule (ADR-011). Net = income − actual expenses; savings rate = net ÷ income, `null` ("—") without income.
- **Planned = the expected amounts of the bills of that group and month,** paid or not. A group or month without a bill has `plannedMkd: null` ("no plan", shown as nothing), which is not a plan of 0 and is never "over plan". Income has no plan: it is already by schedule. There is no planned net, because only bills are planned and it would flatter the month.
- **No new tables.** Both sums read existing data through two new repository methods (`sumByGroupAndMonth` on transactions, `sumExpectedByGroupAndMonth` on bills) that keep the user filter. A real budgets table (planned amount per category and month) is for a later phase, when forecasting needs it.
- **A bill due in one month and paid in the next** is planned in the first and actual in the second. That is the cash view; the grid does not hide it.
- **Groups:** active groups always have a row, in display order, so the grid has the sheet's shape. An archived group appears only when it has amounts that year, so history stays complete (ADR-007).
- **Screen:** `/budget`, a table with a sticky first column that scrolls sideways on a phone, a year switcher (back to 2000, not past this year) and the EUR/MKD toggle. Cells are whole numbers without a unit; euro at the rate on the month's last day, the year column at December's. Spending over its plan is red and says so to screen readers.
- **Needs attention (NM-30):** Home shows overdue bills plus bills due within 7 days, each with a "Paid" button (pays today, for what the bill costs now; the same endpoint as the Bills screen). It first calls `POST /bills/sync`, so a bill that came due since the Bills screen was last opened is not missed. It shows nothing when all is well, and a failure shows a small retry without hiding the numbers. Paying refreshes the KPIs and charts.

**Consequences:** The parity test (NM-7) can compare the grid's group totals with Буџет Jan–Jun 2025 once the import (E9) has the data. Forecasting reuses `budgetGrid`'s planned amounts. A budgets table can replace the bill-based plan behind the same response.
