# ADR-034: Savings ideas with calculations

Status: accepted

## Context

Phase 4 asks for cost reduction suggestions. Every recommendation must show its calculation and why it was raised.

## Decision

- The pure engine (`savingsIdeas`) looks at the last complete months of spending per category and raises up to six ideas:
  - **trim**: 15% less on discretionary categories (Restaurants, Entertainment, Shopping, Subscriptions, Travel) with a base of at least 3,000 MKD a month;
  - **rising**: a category at least 1.2× its earlier level and at least 1,000 MKD more;
  - **unusual**: the latest month at least 1.5× usual and 2,000 MKD above it (information only, no saving counted);
  - **top**: the biggest category, for context.
- Each idea carries `why`, `method`, monthly and yearly impact; ideas are sorted by yearly impact.
- `GET /insights/ideas?month=` serves them; the Forecast page lists them and "Try it in the what-if" prefills the scenario with the category and amount.
- Fixed thresholds, no learning: simple, explainable, testable. A later AI coach can reuse the same output as its facts.

## Consequences

Thresholds are assumptions to tune with real data. Ideas never change data; they only suggest.
