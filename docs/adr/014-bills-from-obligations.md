# ADR-014: Recurring bills and the bills made from them

**Status:** Accepted · **Date:** 2026-11-09

**Context:** NM-12 (create a bill obligation) and NM-20 (generate expected bills) are the base for everything about paying: the inbox, marking paid, the budget grid, "needs attention". The spreadsheet repeats each bill by hand every month.

**Decision:**

- **Two tables.** An _obligation_ is the recurring bill, stored once with its schedule. A _bill_ is one obligation in one month. Money is whole denars, months are the first day of the month (as in ADR-010 and ADR-011).
- **Three schedules:** every month; every _n_ months counted from the start month (every 3 from January = Jan, Apr, Jul, Oct); only in chosen calendar months (the heating season). Each can have an end month. The rule "is it due in this month, and on which day" lives in the finance engine (`isDueInMonth`, `dueDateInMonth`); a due day that does not exist (31 in November) uses the month's last day.
- **No duplicates, enforced by the database.** `bills` has a unique key on (obligation, month) and the code creates bills with "skip if it exists", so two requests at once, or a repeat, can never make a second bill (tested with six simultaneous requests).
- **Bills are created when the Bills screen opens,** not by a scheduled monthly job (the backlog said "monthly job"). `POST /bills/generate?month=` makes whatever is missing for a month; the screen calls it before listing. Why: no secret or cron setup to look after, nothing to miss if a job fails, and a bill added today shows up today. Only this month, next month or earlier are allowed, so nothing is invented far ahead. A real scheduler can call the same endpoint later (needed for reminders) without changing anything else.
- **A bill keeps what it was created with.** Changing an obligation's amount or due day affects the months not yet created, not the existing bills, so history stays true. (A bill whose month no longer matches an edited schedule stays until the delete/archive story, NM-18, decides what happens to it.)
- **The recurrence of an obligation cannot be changed** after it is created (add a new one), like income (ADR-010).
- **Category rules as for expenses:** the category must be the user's own (else 404) and not archived (else 409). The database also refuses another user's category through a composite foreign key, and a bill cannot point at another user's obligation the same way (ADR-006).
- **No delete yet.** Obligations and bills cannot be deleted while the other exists (`NO ACTION`); deleting a user still removes everything. Delete/archive is NM-18.

**Consequences:** NM-21 (inbox) lists bills; NM-22 and NM-23 add paid date, actual amount and invoice reference to `bills`; NM-27 and NM-30 read bills by month. Loans and installment plans (NM-13 to NM-16) will create their bills the same way.
