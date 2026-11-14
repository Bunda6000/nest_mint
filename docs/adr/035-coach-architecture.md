# ADR-035: Financial coach on engine tools

Status: accepted

## Context

Phase 5 wants an AI coach. No LLM key exists yet, and the coach must never invent numbers.

## Decision

- Two layers. **Tools** (`CoachService`) collect facts from the same services the screens use: health score, savings ideas, goals. **Provider** (`CoachProvider`) only words an answer from those facts.
- Today's provider is rule-based (`rules`): keyword topics, fixed sentences, honest "no data yet" answers. An LLM provider can be swapped in through the `COACH_PROVIDER` token; it receives only the facts, never raw data or other users' data.
- Every answer returns `answer`, `why` and `facts` with their source, so the user can check the numbers.
- `POST /coach/ask` saves nothing. Privacy: facts are per-user, built with the caller's id (ADR-006).

## Consequences

Answers are limited to the topics the rules know. Adding an LLM later means one new provider class plus a key, and the same tests on facts still apply.
