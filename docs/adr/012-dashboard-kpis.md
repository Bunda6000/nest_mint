# ADR-012: Dashboard KPIs

**Status:** Accepted · **Date:** 2026-11-09

**Context:** NM-28 puts the month's income, expenses, net and savings rate on Home, each compared with the month before, in EUR or MKD.

**Decision:**

- **No new API.** The page asks `/summary` (ADR-011) for the shown month and the month before it. The comparison is a pure function in the finance engine (`compareMonths`), tested on its own.
- **How a change is measured:** the amount difference in denars, and the percentage against the _size_ of last month's value, so net going from −100 to +50 reads +150% (better). With nothing last month there is no percentage. The savings rate change is the difference of the two rates, in percentage points, and "—" if either month had no income.
- **Last month without any income or spending is not compared:** the page says "No data in <month> to compare with" instead of showing meaningless changes.
- **Colours:** income, net and savings rate going up is good; expenses going up is bad; no change is neutral. An arrow and a screen-reader word go with the colour, so it is never the only signal.
- **Currency:** euro first (owner's choice), MKD on the toggle. The choice is remembered on the device (browser storage); if storage is blocked it lasts for the visit. Euro amounts use the rate on the month's last day (as on the Expenses page, ADR-009), also for the changes, so a card can differ by a cent or two from adding up the others.
- **Month arrows:** back without limit, forward up to the current month. Currency stays when moving between months.

**Consequences:** Charts (later stories) can reuse the same two summaries. The "example month" placeholder on Home is gone.
