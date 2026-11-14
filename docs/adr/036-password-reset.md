# ADR-036: Password reset

Status: accepted

## Decision

- `POST /auth/password-reset/request` always answers 204, so it never shows which emails have accounts. It is rate limited per IP and email (10 per 15 minutes).
- The emailed link holds a random 256-bit token; only its SHA-256 is stored (`password_reset_tokens`). It works once and for one hour.
- `POST /auth/password-reset/confirm` sets the new password (Argon2id), uses up every open link of the user, and ends all their sessions (a stolen session does not survive a reset).
- Email goes through the `EmailSender` interface. `LogEmailSender` is the stand-in: it logs outside production and, in production, only warns that nothing was sent.

## Consequences

**Owner action:** until a real email provider (for example Resend) is added as an `EmailSender`, the reset cannot reach users in production. Email verification at sign-up is not done: it needs the same provider.
