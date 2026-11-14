# ADR-029: Moving and merging categories

Status: accepted (NM-38, NM-39)

## Decision

- **Move:** `PATCH /categories/:id` accepts `groupId`. The category keeps its id, so its expenses and bills stay with it. The target group must be the user's, active, and must not already have a category with that name. The category goes to the end of the new group.
- **Merge:** `GET /categories/:id/usage` counts expenses and bills (obligations) that use a category; `POST /categories/:id/merge {targetCategoryId}` moves all of them to the target and archives the source, in one database transaction. Target must be active, different and the user's own. Bills follow their obligation, so they need no change of their own.
- The screen asks for the target, shows the counts from `usage`, and merges only after confirming.

## Why

History must not change: totals per category before the merge become totals of the target after it, and nothing is deleted (the source is archived, ADR-006 rules apply to every query).

## Not done

No undo. A merge cannot be reversed automatically because the source's expenses are mixed with the target's.
