# ADR-021: Installment plans (the Кирби sheet)

**Status:** Accepted · **Date:** 2026-11-15

**Context:** NM-13: "Contract total, first and regular installment; shows remaining amount and installments left." In Budget.xlsx the Кирби sheet holds a purchase of 153,750 MKD paid as 5,500 first, then 3,075 a month. The sheet's remaining amount is `153,750 − paid`: 28 paid installments (88,525) leave 65,225.

**Decision:**

- A new obligation kind **`installment`**, monthly from the start month, with `contract_total_mkd` and `first_installment_mkd`. The regular installment is the obligation's own `expected_amount_mkd`. The seller is the optional payee. One database check keeps the fields of each kind apart (a bill has neither loan nor installment fields).
- **The last installment is whatever is left** of the contract total (Кирби: 5,500 + 48 × 3,075 + 650 = 153,750, so 50 installments, ending November 2027). The API works out the end month; it is not typed. This is an assumption from the sheet's numbers (21 × 3,075 + 650 = 65,225).
- **Each month's bill gets that month's installment** (first, regular, or the smaller last one) through the same `expectedAmountInMonth` that loans use, so bills generation needed no new path.
- **Progress counts what was really paid**: the amount of each paid bill's expense. Remaining = total − paid, installments left = count − paid bills. A late or different payment shows up honestly instead of being assumed.
- `POST /obligations/installments` creates a plan. Editing is limited to name, seller, category and due day; installment amounts and months are locked (400), because they define the plan. To change them, delete or archive the plan (ADR-019) and add a new one.
- Two migrations: PostgreSQL cannot use a new enum value in the transaction that adds it, so the value and the columns/check are separate.

**Not in this slice:** editing the amounts of a running plan, prepaying part of a plan, several lines under one contract (NM-17), and importing the old Кирби history (E9).

**Consequences:** the plan logic is pure and tested in `finance-engine` (`installments.ts`), including the sheet's 65,225 figure; the API and screen only lay it out.
