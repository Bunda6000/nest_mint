# ADR-017: Loans as monthly obligations, and obligation totals

**Status:** Accepted · **Date:** 2026-11-14

**Context:** NM-14 (create loan) and NM-6 (obligation totals) open E4. In Budget.xlsx the Кредити sheet is two loans, Станбен (15,500 MKD a month) and Потрошувачки (19,500 MKD a month), as a flat payment per month and no principal or rate. The backlog wants the payment worked out as an annuity when it is left empty. The loan figures are entered by the user in the app (Roadmap, open questions).

**Decision:**

- **A loan is an obligation of kind `loan`,** not a new table. It is paid every month from the first to the last month, so ADR-014 already creates its bills (one per month, no duplicates, nothing new in the bills code). `expectedAmountMkd` is the monthly payment and the lender is the `payee`.
- **Loan fields:** `loan_type` (housing, consumer, other), `principal_mkd` and `annual_rate_bp` on `obligations`. The rate is in basis points (450 = 4.50 %), so no decimals are stored. The database checks that a bill has none of them and a loan has all of them, a lender, a last month and a monthly recurrence (`obligations_kind_fields_check`). No new table, so no new RLS policy.
- **Payment:** `POST /obligations/loans`. If `monthlyPaymentMkd` is left out, it is the annuity payment `annuityPaymentMkd` (finance engine) from principal, rate and the number of months, rounded to a whole denar; 0 % splits evenly. If given, the bank's figure is kept, as that is what really gets paid (the spreadsheet has only those figures). The form shows the worked-out payment before saving.
- **Rounding:** every bill carries the same rounded payment, so the real last payment can differ by a few denars. Not modelled; the actual amount of a bill can be changed (NM-23).
- **Totals (NM-6):** `obligationTotals` (finance engine) adds bills by year of the billing period and for the whole life, paid or not. It is only the engine for now; the ledger screen and its endpoint are NM-19.
- **Not in this slice:** editing a loan's rate, principal or term (NM-15), extra payments and early payoff (NM-16), and an amortization schedule (remaining principal). Until NM-15 a loan row has no Edit button, because the bill editor would change the payment without the loan's own fields.
- **The highest rate is in two places** (`MAX_LOAN_RATE_BP` in the engine and in shared, which do not depend on each other); a test keeps them equal.

**Consequences:** Importing Кредити (E9) creates two loans with the sheet's payments. NM-15 and NM-16 recalculate from the loan fields without a schema change; NM-13 (installments) can reuse the kind field. Because a loan's bills are ordinary bills, the inbox, "mark paid", the budget grid and needs-attention work for loans from day one.
