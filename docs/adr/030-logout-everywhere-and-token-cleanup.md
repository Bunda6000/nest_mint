# ADR-030: Log out everywhere and login-token cleanup

Status: accepted (NM-41, NM-43)

## Decision

- `POST /me/logout-all` (needs login) revokes every active refresh token of the user (reason `logout_all`) and clears this device's cookie. Other users are untouched. Settings has a "Log out everywhere" button.
- Short-lived access tokens (15 minutes) cannot be revoked; they run out on their own. This is the accepted trade-off of stateless JWTs.
- The daily job (`/jobs/monthly`, ADR-028) also deletes refresh tokens that expired or were revoked more than 30 days ago, and reports `tokensDeleted`. Recently revoked tokens stay for 30 days so reuse detection (ADR on sessions) keeps working.
