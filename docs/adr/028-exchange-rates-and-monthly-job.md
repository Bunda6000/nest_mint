# ADR-028: Exchange rates (NM-36) and the monthly job (NM-20)

**Status:** Accepted · **Date:** 2026-11-15

## Exchange rates (NM-36)

- Amounts stay in denars. A user can save **MKD-per-EUR rates, each effective from a day** (`exchange_rates`, unique per user and day, stored as whole 1/10,000 so they stay integers; 1 to 1,000 with at most 4 decimals). Before the first rate the default 61.5 (the spreadsheet's) applies, exactly as `rateOn` in the engine already did.
- `GET /settings/rates`, `PUT /settings/rates/:day`, `DELETE /settings/rates/:day`.
- The web loads the rates once after login (`RequireAuth`) and every euro amount goes through `src/rates.ts`; if loading fails the default rate is used and the app still opens. **A new rate never rewrites the past:** an old entry is converted at the rate in force on its own day. The Settings screen (`/settings`) lists, adds and deletes rates.

## Monthly job (NM-20)

- Bills were already created when a user opens Bills or Home (ADR-014). Now a **daily job** (`GET /api/v1/jobs/monthly`, 03:15 UTC, Vercel Cron) runs the same catch-up for every user, so bills exist and show as overdue even for someone who has not opened the app.
- It is not a user endpoint: it needs `Authorization: Bearer $CRON_SECRET` (compared in constant time) and is closed when no secret of at least 16 characters is set. **Action for the owner:** add `CRON_SECRET` to the `nestmint-api` Vercel project (Production).
- One user failing does not stop the others; the result lists users, bills created and failures. Running it twice creates nothing the second time (unique key on obligation and month, ADR-014).
