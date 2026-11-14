# ADR-037: Request rate limiting

Status: accepted

## Decision

- A global guard caps requests per client address per minute: 600 in general, 60 for `/auth/*` (separate budgets). Over the limit: 429 with `Retry-After`.
- Failed logins and password-reset requests keep their own, stricter counters (ADR-036, login limiter).
- Counters are in memory per server instance. On Vercel several instances can run, so the true ceiling is somewhat higher than stated; it still stops floods and scripted guessing.

## Consequences

**Owner action (optional, stronger):** add a Vercel Firewall rate-limit rule on the `nestmint-api` project (for example 60 requests/minute on `/api/v1/auth/*`). That layer is shared across instances and blocks before the function runs.
