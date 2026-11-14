# ADR-032: Financial health score (Phase 2)

Status: accepted (NM-51)

## Decision

`GET /health-score` returns a 0–100 score with every part, in `finance-engine/health-score.ts`. It looks at up to the last six complete months that had income (a new user with none is scored on the running month).

| Factor             | Weight | Full marks                         | Zero                 |
| ------------------ | ------ | ---------------------------------- | -------------------- |
| Savings rate       | 30     | keeps 20 % of income               | keeps 0 % or less    |
| Emergency fund     | 20     | savings cover 3 months of spending | no savings           |
| Spending vs income | 20     | spends 80 % or less                | spends 100 % or more |
| Goal progress      | 15     | goals reached/on track/ongoing     | overdue goals        |
| Consistency        | 15     | every month ends with money left   | none do              |

Factors without data (no goals, fewer than three months, no spending) are left out and the others re-weighted, so the weights shown always add to 100. The two factors that cost the most points are listed as "where to improve", each with a tip. Every factor shows its own calculation in words, so the number is never a mystery.

"Savings" for the emergency fund is the total saved in active goals (assumption: no separate account balance is tracked). Debt ratio is not scored yet (planned).
