# ADR-024: Monthly balance check-in

**Status:** Accepted · **Date:** 2026-11-15

**Context:** NM-31: "Enter main salary account balance; untracked = expected − actual; dashboard alert if > 10% of income." Money that leaves the account without being recorded is the biggest hidden error in a budget.

**Decision:**

- The user types the real balance of the **main salary account** at the end of a month. The app works out `expected = opening + income − expenses` and `untracked = expected − typed balance` (finance engine, `balanceCheckIn`). Positive means spending that was not recorded; negative means money in the account that was not recorded as income.
- The **alert** fires when untracked money is more than 10% of the income of the period (strict, integer comparison, so exactly 10% is fine). A negative gap never alerts.
- **Opening balance:** the first check-in asks for it; later ones start from the previous check-in's typed balance. If months were skipped, the period runs from the month after the previous check-in, so income and expenses of the gap are included.
- Stored per user and month in `balance_check_ins` (closing balance, and the opening balance only on the first one). Saving a month again replaces it. The figures are worked out on every read, so they follow later edits to income and expenses.
- `GET /balance-check-ins?month=` returns the check-in (or `null`) and whether the opening balance is needed; `PUT /balance-check-ins/:month` saves it. A month that has not started is refused; an opening balance is refused when an earlier check-in exists.
- The dashboard shows a **Balance check** card under the bills that need attention.

**Not in this slice:** more than one account, a reminder to check in at month end, and a trend of untracked money over months.
