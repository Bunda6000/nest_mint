# ADR-004: Sessions and tokens

**Status:** Accepted · **Date:** 2026-11-08

**Context:** NestMint holds financial data, so a stolen token must do limited damage, and the web app and API sit on different Vercel projects.

**Decision:**

- **Access token:** JWT (HS256, 15 minutes), held only in the page's memory and sent as a Bearer header. Never in localStorage.
- **Refresh token:** random 32 bytes, 30 days, in an `HttpOnly`, `SameSite=Strict`, `Secure` cookie limited to `/api/v1/auth`. Only its SHA-256 hash is stored (`refresh_tokens`).
- **Rotation:** every refresh revokes the used token and issues a new one. A rotated token presented again after a 10-second grace window (which covers two tabs or a retry) is treated as theft and revokes all of the user's sessions.
- **Cross-site protection:** refresh and logout reject requests whose `Origin` is not one of `WEB_ORIGIN`.
- **Login:** the same error and the same timing for an unknown email and a wrong password; 10 failed attempts per client and email are blocked for 15 minutes.
- **Same-origin API:** the web app calls `/api/v1` on its own domain, and Vercel forwards it to the API, so the cookie is first-party.
- **Default deny:** every endpoint requires a valid access token unless marked `@Public()`.

**Consequences:** Logging out and token theft are handled server-side. The login rate limit is per server instance, so a firewall rule is the stronger protection (backlog). Expired token rows are not cleaned up yet. `JWT_SECRET` must be set; the API refuses to start without it.
