# ADR-027: English and Macedonian interface

**Status:** Accepted (first slice) · **Date:** 2026-11-15

**Context:** NM-35: "English default; Macedonian selectable; Cyrillic category names; locale number formatting." The app has about 7,500 lines of screen code with English texts, so it is translated screen by screen.

**Decision:**

- Two languages, `en` (default) and `mk`, chosen with an EN / МК toggle on the Home screen and remembered on the device (`localStorage`, like the currency). No library: a small typed dictionary in `src/i18n/messages.ts`.
- **English is the complete set and the fallback.** A key without a Macedonian text shows in English, so no screen breaks while translation is in progress. A test checks that every Macedonian key exists in English.
- **Numbers and dates** follow the language (`en-US` / `mk-MK`): `127,088 MKD` becomes `127.088 MKD`, month names come out in Macedonian. All formatters read the active locale; nothing is hard-coded to English any more.
- **Category names:** the default categories and groups are stored in English. Only those exact names are shown in Macedonian (Electricity → Струја, Kindergarten → Градинка, …, taken from Budget.xlsx where it names them); a name the user typed or renamed is shown as typed. Stored data does not change.
- The `<html lang>` attribute follows the language.

**Translated in this slice:** Home screen and its menu, category names in the pickers, lists and filters.

**Still English (to translate, one screen per step):** bills and obligations, income, budget grid, categories editor, add expense, import, balance check, login and register, charts, and API error messages.
