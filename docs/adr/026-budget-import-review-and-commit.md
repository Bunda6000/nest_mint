# ADR-026: Budget.xlsx import, steps 2 and 3: review and commit

**Status:** Accepted · **Date:** 2026-11-15

**Context:** NM-33 ("date typos, missing Feb 2025 mortgage and #REF! cells shown one by one to confirm or fix") and NM-34 ("data saved; totals match"). Extends ADR-025.

**Decision:**

- **Anomalies** are listed in the preview: a month left empty between two filled months of an expense line (the missing Feb mortgage), a cell showing an error such as `#REF!`, and a negative amount. None of them is imported silently. Date typos belong to the per-bill sheets, which are not read yet.
- The **review screen** shows each anomaly with an amount box and a "Leave empty" button; each expense line needs a category (suggested when the name matches exactly one) or Skip; income lines can be skipped. Saving is disabled until everything is decided.
- `POST /imports/budget/commit` takes the same file again plus `decisions` (JSON). The server re-reads the file, so what is saved is always what the file says plus the user's explicit fixes. It checks everything first; a refused import saves nothing.
- **What is saved:** an income line with the same amount in consecutive months becomes one monthly salary (pay day 1, because the sheet knows only the month; it keeps running if it reaches last month); other income becomes one one-off entry per month. Each expense line becomes one expense per month, dated the 1st, with the sheet's block and line as the note.
- **No double counting:** a month that already has expenses is never imported over (409 naming the months).
- Months that have not started are refused. The response reports the saved totals; the test checks them against the preview plus the fixes.
- Rows are saved one after another, not in one database transaction. Everything that can fail is checked before the first row is written.

**Not in this step:** obligations, bills and payments from the per-bill sheets, an undo for an import, and Excel files in another layout.
