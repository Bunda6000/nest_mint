# ADR-025: Budget.xlsx import, step 1: upload and preview

**Status:** Accepted · **Date:** 2026-11-15

**Context:** NM-32: "Shows detected obligations, bills, payments, income; nothing saved before commit." Budget.xlsx is the current system, so the import must read it as it is.

**Decision:**

- `POST /imports/budget/preview` takes a multipart form (`file`: .xlsx up to 5 MB, `year`: defaults to this year, because the sheet does not name its year) and returns what it found. **Nothing is saved.**
- Only the **Буџет** sheet is read in this step: a block starts at a row with the months Јануари…Декември in columns C–N, ends with "Вкупно"; "Приходи" and "Расходи" switch between income and expenses. Column O (yearly total) is ignored and recomputed. Empty cells are empty, not zeros; labels with nothing entered (a car's name) are skipped.
- **Check against the sheet:** a "Вкупно" row that differs from the sum of its lines is reported as a warning, never silently corrected. On the real file (2025) income is 1,290,100, there are 2 income and 20 expense lines, and no warnings.
- An expense line gets a **suggested category** only when exactly one active category has the same name; the rest are chosen by the user in the next step.
- Formula cells give their last calculated result, so the file must have been saved by Excel (or similar) once.
- The Home screen links to `/import`, which shows the lines, suggestions and warnings.

**Not in this step (NM-33, NM-34):** choosing categories and fixing anomalies, saving the lines as income and expenses, and detecting obligations, bills and payments from the per-bill sheets (Струја, Кирби, Кредити…).
