# ADR-011: Monthly totals and packaging the finance engine

**Status:** Accepted · **Date:** 2026-11-09

**Context:** NM-5 needs the cash-view totals of a month in the API. Until now only the web used `packages/finance-engine`, as plain TypeScript source; Node cannot run that.

**Decision:**

- **The engine is packaged like `shared`:** `exports` points to the source for development and tests and to the compiled `dist` otherwise, relative imports carry `.js`, `module` is NodeNext, and `build` compiles it. The API build on Vercel builds it next to `shared` (`apps/api/vercel.json`); the web already builds its dependencies. All calculations stay in one place, as the architecture intends.
- **What a month contains (cash view, by paid date):** income = every monthly salary that runs in the month (first and last month included) plus one-off income received in it; expenses = everything dated in the month, cash withdrawals included (ADR-009); net = income − expenses; savings rate = net ÷ income, `null` (shown as "—") when income is 0, and negative when more was spent than earned.
- **`GET /summary?month=YYYY-MM`** returns whole denars only (`incomeMkd`, `expensesMkd`, `netMkd`, `savingsRate`). Euro amounts are derived by the app (ADR-008). The month is required and may be any month from 2000-01 on, also a future one; a future month shows the salary that is expected, nothing more.
- **Where the sum happens:** income is read through the income repository and worked out by the engine (the data set is small); expenses are summed by the database (`sumMonth`), which keeps the user filter and the month's first-day and next-month's-first-day boundaries in one tested place.

**Consequences:** Forecasting and scenarios (later phases) reuse `incomeInMonth` and `monthlyTotals` unchanged. The Home page still shows the example month until NM-28 swaps in this endpoint.
