# ADR-008: Money, dates and exchange rates

**Status:** Accepted · **Date:** 2026-11-08

**Context:** Every number in NestMint is money, and Budget.xlsx converts MKD to EUR with a hardcoded `÷ 61.5`. Rounding errors or a wrong date would quietly corrupt totals.

**Decision:**

- **MKD amounts are whole denars** (integers). Checked against Budget.xlsx: all 159 amounts of the cash sheet are whole; the only fractions in the file are EUR values (`=C3/61.5`). Stored as `INTEGER` with a database `CHECK` of 1 to 100,000,000 per expense. If a bill ever needs deni, this is a deliberate migration, not a surprise.
- **EUR is derived, never stored**, as whole euro cents: `EUR = MKD ÷ rate effective on the transaction date` (BR-05), rounded to the nearest cent, halves away from zero. The calculation uses integer arithmetic only (the rate is held as a whole number of 1/10,000), so results never depend on floating point. Rates have at most 4 decimals.
- **Rates are effective-dated**: the entry with the latest `effectiveFrom` on or before the date wins; with no entry the default **61.5** applies. Managing rates in the UI is NM-36; until then everything uses the default.
- **The web app does the EUR conversion** with `@nestmint/finance-engine`. The API does not yet, because the engine ships as TypeScript source for Vite; it will be built for Node when the API needs it (monthly totals, NM-5).
- **A date is a calendar day**, stored as `DATE`, sent as `"YYYY-MM-DD"`, never as a timestamp, so time zones cannot move an expense to another day. An expense may be dated up to tomorrow (a phone can be a day ahead of the server's UTC date), not further.
- **The same rules live in three places on purpose:** the shared Zod schema (clear messages in the form), the service (rules that need data, such as an archived category) and the database (`CHECK`, foreign keys). A bug in one layer cannot save bad data.

**Consequences:** Spreadsheet parity is testable to the cent (`exchange-rate.test.ts` uses real rows). Entering amounts in EUR is possible later without changing storage.
