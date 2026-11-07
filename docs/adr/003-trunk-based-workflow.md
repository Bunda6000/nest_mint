# ADR-003: Trunk-based workflow

**Status:** Accepted · **Date:** 2026-11-07

**Context:** Single product owner, AI-assisted development, no review team.

**Decision:** Commit directly to `main`, no feature branches or pull requests. CI (lint, format, typecheck, test, build) runs on every push.

**Consequences:** Fast iteration. CI is the safety net, so every change is verified locally before pushing. A broken `main` is fixed forward immediately.

**Open item:** `pnpm-lock.yaml` is not committed yet (CI installs without a frozen lockfile). Commit it from a local machine to make installs fully reproducible.
