# ADR-013: Dashboard charts

**Status:** Accepted · **Date:** 2026-11-09

**Context:** NM-29 adds four charts to Home: spending by category, income vs expenses over 12 months, a savings trend, and the top 5 expenses.

**Decision:**

- **Two read-only endpoints, no database change:** `GET /insights/breakdown?month=` (spending per category, plus the 5 biggest transactions) and `GET /insights/history?month=` (the 12 months ending at `month`, oldest first). Both need a login and a valid month. The month maths stays in the finance engine (`monthlyHistory`, `donutSlices`), the SQL in the transactions repository, always filtered by user (ADR-006).
- **One query for the whole year:** expenses per month come from a single grouped query, not twelve. Income is worked out in the engine from the income sources, as in ADR-011, so every month of the history equals what `/summary` gives for it (tested for all twelve).
- **Cash withdrawals count everywhere,** as in the Expenses card (ADR-011), so the donut always adds up to the month's expenses. They are marked "Cash withdrawal" in the top list.
- **Donut by category group** (Food, Home, …), not by single category, so it stays readable on a phone; at most 6 slices, the smallest groups merged into "Other". The API returns per-category totals with their group, so another view is a front-end change.
- **Savings trend = monthly net (bars) plus a running total (line).** The running total starts from 0 at the first month shown, so it is the saving over the 12 months on screen, not an all-time balance.
- **Top 5 = the five biggest single transactions of the month,** newest first on a tie.
- **Charts are drawn by hand as SVG,** no chart library: small to load on a phone, the drawing maths is plain tested functions, and every chart has a table for screen readers (colour is never the only signal). They follow the month and the EUR/MKD toggle of Home (ADR-012); euro amounts use the rate on the month's last day.
- **Charts load on their own:** if they fail, the KPI cards stay and a "Try charts again" button appears.

**Consequences:** Forecasting (later) can use `/insights/history`. Moving to a chart library later would only touch `features/charts`.
