# ADR-033: Forecast and what-if simulator (Phase 3)

Status: accepted (NM-60, NM-61)

## Decision

`GET /forecast?months=` (1–60; the app offers 3, 6, 12, 24) and `POST /forecast/scenario` (saves nothing). The maths is in `finance-engine/forecast.ts`.

**Baseline ("if things stay as they are")**

- Income: exactly what is entered for each future month: salaries run on until their end month, one-off income appears in its month. No growth is assumed.
- Spending: the **usual month**, the average of the last three complete months that had spending, the same in every month. Bills are already part of spending (a paid bill is an expense), so they are not added twice.
- Balance: the last balance check-in's closing balance (NM-31) plus income − spending of the complete months after it, then each forecast month's net. Without a check-in no balance is shown, only the amount put aside. The running month is forecast in full (usual spending), not partly.
- The response lists the months the average came from, so the user can judge it.

**What-if** (each part optional): income ± % ; spending ± MKD a month; cuts in named categories (each at most that category's usual monthly cost, checked on the server). The result is baseline vs scenario totals, the extra saved (extra per month × months) and:

- **goals**: if the extra per month went into a goal, its finish month before and after (pace + extra);
- **health score**: today's score vs the score if the last months had looked like the scenario.

## Not done

No seasonality, no inflation, no loan balance forecast beyond what is already in spending. Recommendations that pick the cuts automatically are Phase 4.
