# ADR-018: Loan rate changes

**Status:** Accepted · **Date:** 2026-11-14

**Context:** NM-15. A bank changes a loan's rate from some month on and sends a letter with the new monthly payment. Filip wants to type that payment, not have the app work it out. Payments already made must not change, and the months after the change must use the new figure (acceptance criteria of NM-15).

**Decision:**

- **Table `loan_rate_changes`** (obligation, effective month, new rate in basis points, new monthly payment in whole denars). The loan keeps its first terms on the obligation (`annual_rate_bp`, `expected_amount_mkd`); the terms of any month are those of the latest change that has started by then (`loanTermsInMonth` in the finance engine, `expectedAmountInMonth` in the API). One change per loan and month (unique index); a second change for the same month replaces the first, which is how a typing mistake is corrected. Checks in the database: month is a first of the month, rate 0 to 10,000, payment 1 to 100,000,000. Composite foreign keys and RLS follow ADR-006; changes are deleted with the loan.
- **Endpoint:** `POST /obligations/:id/rate-changes` with `effectiveMonth`, `annualRateBp`, `monthlyPaymentMkd`. 404 for an unknown or other user's loan, 409 for a plain bill, 400 when the month is outside the loan's first and last month.
- **Bills:** unpaid bills from the effective month on get the payment in force for their month (`setUnpaidExpectedAmounts`); a bill with a transaction (paid) and every earlier bill stay as they are, and an invoice amount already entered is kept. New bills use the payment in force for their month. The two steps (store the change, update the bills) are not one transaction; repeating the request completes a half-done change.
- **Typed, not calculated:** the payment is always typed. The finance engine's `suggestedPaymentMkd` (annuity over what is still owed and the months left) is shown as a hint under the box and never filled in.
- **Editing a loan:** `PATCH /obligations/:id` can now change loan type and principal, and name, lender, category, due day and the first and last month. The payment and the rate are refused there ("change the payment with a rate change"), as are removing the lender or last month, and dates that would leave a rate change outside the loan.

**Not in this slice:** deleting a rate change (replace it instead), an amortization schedule on screen, extra payments (NM-16), delete or archive of a loan (NM-18).

**Consequences:** the engine's `loanSchedule` and `balanceAtStartOfMonth` already take rate changes, so NM-16 and the ledger (NM-19) can reuse them without a schema change.
