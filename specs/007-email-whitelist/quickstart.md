# Quickstart: Validate the Email Domain Whitelist

A run/validation guide proving the feature end-to-end. Implementation details
(handler bodies, exact test code) belong in `tasks.md` / the implementation
phase — this file is about *observing* the behavior.

## Prerequisites

- Local dev running: `cd web && npm run dev` (API on :3000, Vite on :5173), or
  `make local` (Docker, :3006).
- The allow-list is the static `ALLOWED_EMAIL_DOMAINS` set in
  `api/src/helpers/validation.js` (no env var). To try a different list, edit
  that constant and restart the API.

## Scenario A — Registration blocked for a non-approved domain (FR-002)

```sh
curl -sS -X POST http://localhost:3000/api/v1/auth/register/send-code \
  -H 'Content-Type: application/json' \
  -d '{"username":"tester","password":"secret1","email":"tester@example.com"}'
```

**Expected**: HTTP 400, body
`{"error":"Регистрация доступна только для адресов популярных почтовых сервисов"}`.
No verification email is sent; no `VerificationCode` row is created.

## Scenario B — Registration allowed for an approved domain (FR-003)

```sh
curl -sS -X POST http://localhost:3000/api/v1/auth/register/send-code \
  -H 'Content-Type: application/json' \
  -d '{"username":"tester","password":"secret1","email":"tester@gmail.com"}'
```

**Expected**: HTTP 200, body `{"ok":true}` (code sent — existing happy path).

## Scenario C — Case-insensitive match (FR-004)

Repeat Scenario B with `"email":"TESTER@GMAIL.COM"` → **HTTP 200** (accepted).

## Scenario D — Subdomain / look-alike rejected (FR-005)

Repeat Scenario A with each of `tester@mail.gmail.com`,
`tester@notgmail.com`, `tester@gmail.com.evil.net` → each **HTTP 400** (rejected).

## Scenario E — Existing user email change blocked (FR-010, FR-014)

As a signed-in user (session cookie in `-b cookies.txt`):

```sh
curl -sS -X POST http://localhost:3000/api/v1/users/<YOUR_USER_ID>/email/send-code \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"email":"me@example.com"}'
```

**Expected**: HTTP 400, body `{"error":"Этот почтовый сервис не поддерживается"}`.
The account's current email is unchanged. Repeating with `me@yandex.ru`
returns HTTP 200.

## Scenario F — Fail closed by construction (FR-012)

The predicate rejects any domain not in the set, so an emptied list would reject
every address. Since the list is a static in-code constant (no runtime empty
state), this invariant is verified by the unit tests rather than a live run: it
returns `false` for unknown domains and for malformed/`@`-less input.

## Automated checks

```sh
make test          # or: cd api && npx vitest run
```

Confirms:
- `validation.test.js` — `isAllowedEmailDomain` unit cases (A–D, F semantics).
- `auth.test.js` — registration blocked/allowed by domain (unauthenticated).
- `users.test.js` — email change blocked/allowed by domain (authenticated),
  existing email preserved on rejection.

## Success = all of

- Scenarios A, D, E, F return HTTP 400 with the correct Russian message and no
  side effects.
- Scenarios B, C, and approved-domain email change return HTTP 200.
- No existing test regresses; existing sign-in behavior is unaffected (SC-005).
