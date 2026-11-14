# ADR-020: Extra loan payment and early payoff

**Status:** Accepted · **Date:** 2026-11-14

**Context:** NM-16: "Extra payment recalculates remaining and end date; payoff closes the loan and stops scheduled payments." Filip chose: for an extra payment he picks the effect each time (keep the payment and end earlier, lower the payment and keep the end date, or no change), and for a payoff he types the amount from the bank.

**Decision:**

- **Table `loan_extra_payments`** (obligation, paid on, amount, kind `extra` or `payoff`), with composite foreign key, check on the amount and RLS (ADR-006); deleted with the loan. The matching expense is an ordinary transaction in the loan's category, not linked by a key, so deleting that expense never changes the loan (and the loan never blocks deleting it).
- **`POST /obligations/:id/extra-payments`** (`paidOn`, `amountMkd`, `effect`, `newMonthlyPaymentMkd` for `lower_payment`):
  - `shorten`: the finance engine's `loanSchedule` now takes extras (off what is owed after that month's regular payment). The loan ends in the month the schedule reaches zero; unpaid bills after it are removed and the last unpaid bill takes what is left to pay.
  - `lower_payment`: a rate change (ADR-018) from the next month with the rate in force and the typed payment; the end date stays.
  - `none`: only the payment and the expense are saved.
  - Refused (400, nothing saved): a day in the future or outside the loan's months, a loan already paid off, and an amount that would pay off the rest (the loan's last month always pays what is left, so use payoff).
- **`POST /obligations/:id/payoff`** (`paidOn`, `amountMkd` typed from the bank): saves the expense and a `payoff` row, sets the last month to the payoff month and removes unpaid bills from that month on (the payoff covers that month). Paid bills stay. Once, then the loan is closed (409 for another payoff or extra payment).
- **Estimates are hints:** the loan row shows "still owed about X" from the engine, and the payoff form shows it as a reference; the bank's figure is always what is typed.
- Saving is not one transaction (expense, then payment, then effect); everything that can be checked is checked first. Repeating a request after an infrastructure failure would duplicate the expense, which can be deleted by hand.

**Not in this slice:** undoing or editing an extra payment or payoff (to correct one, change the last month or add a rate change and delete the expense), and rate changes after a payoff month are left in place (the engine ignores them).

**Consequences:** the remaining balance for the future ledger (NM-19) and the forecast engine comes from `loanSchedule` and `balanceAtStartOfMonth`, which already include rate changes and extras.
