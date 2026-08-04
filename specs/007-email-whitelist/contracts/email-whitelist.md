# API Contract Delta: Email Domain Whitelist

Two existing endpoints gain one new rejection branch each. Request shapes are
**unchanged**; a new response is added for non-approved domains. Steps 2 (verify)
of both flows are unchanged.

---

## 1. `POST /api/v1/auth/register/send-code`

**File**: `api/src/routes/auth.js`

**Request** (unchanged): `{ username, password, email }`

**New behavior**: after Zod `sendCodeSchema` passes and before username/email
uniqueness checks and code creation, if `isAllowedEmailDomain(email)` is false →
reject.

| Condition | Status | Body | Side effects |
|---|---|---|---|
| Domain **not** approved (or list empty) | `400` | `{ "error": "Регистрация доступна только для адресов популярных почтовых сервисов" }` | **None** — no `VerificationCode` row, no email sent |
| Domain approved (existing happy path) | `200` | `{ "ok": true }` | Code row created + verification email sent |

Ordering note: the domain check runs **after** format validation (so malformed
emails still return "Введите корректный email") and **before** the "email already
used" / "username taken" checks — a disallowed domain is rejected regardless of
uniqueness.

---

## 2. `POST /api/v1/users/:id/email/send-code`

**File**: `api/src/routes/users.js`

**Auth**: `requireAuth`; caller must be the profile owner (existing `403` for
other users is unchanged).

**Request** (unchanged): `{ email }`

**New behavior**: after Zod `emailChangeSchema` passes and before the
"already taken" check and code creation, if `isAllowedEmailDomain(email)` is
false → reject.

| Condition | Status | Body | Side effects |
|---|---|---|---|
| Domain **not** approved (or list empty) | `400` | `{ "error": "Этот почтовый сервис не поддерживается" }` | **None** — no code row, no email sent, current email unchanged (FR-014) |
| Domain approved (existing happy path) | `200` | `{ "ok": true }` | Code row created + verification email sent |

---

## Shared predicate contract

`isAllowedEmailDomain(email: string): boolean` — exported from
`api/src/helpers/validation.js`.

- Returns `true` iff the lowercased, trimmed domain portion after the last `@`
  is an exact member of the resolved allowed-domains `Set`.
- Case-insensitive (`USER@GMAIL.COM` → true).
- Exact match only (`a@mail.gmail.com`, `a@notgmail.com`,
  `a@gmail.com.evil.net` → false).
- Fails closed: returns `false` for all input when the resolved set is empty.
- Assumes `email` already passed Zod `.email()`; still defensive against a
  missing `@` (returns false).

**Config**: `ALLOWED_EMAIL_DOMAINS` is a static, lowercased `Set` literal in
`helpers/validation.js` (18 domains; no env var). Changed by editing the list
and redeploying.
