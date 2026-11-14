# ADR-031: Savings goals (Phase 2)

Status: accepted (NM-50)

## Decision

- Three kinds: **target** (an amount, no deadline), **target_date** (an amount by a month) and **monthly** (a fixed amount every month, no end). The database checks that each kind has exactly the fields it needs.
- The amount saved is never stored on a goal; it is the sum of its **contributions** (positive = put in, negative = taken out). Taking out more than is saved, or removing a deposit a later withdrawal depends on, is refused. A "starting amount" at creation becomes the first contribution.
- All calculations are pure functions in `finance-engine/goals.ts`:
  - remaining = target − saved; progress = saved ÷ target (capped at 100%);
  - months left counts the target month (Nov 2026 to Oct 2027 = 12);
  - required monthly = remaining ÷ months left, rounded up;
  - **pace** = the planned monthly amount if set, else the average of the last three complete months of contributions (a young goal is divided by the months it has existed);
  - completion month = current month + ⌈remaining ÷ pace⌉ − 1;
  - achievability % = pace ÷ required monthly, capped at 100. This is an explainable ratio, not a statistical probability, and is labelled that way in the UI.
- Statuses: done, on_track, behind, overdue, no_pace, ongoing.
- Archive hides a goal; deleting removes it with its history.

## Assumption

Goals are tracked by what the user puts in, not by reading the bank balance. Linking goals to the balance check-in (NM-31) is a later option.
