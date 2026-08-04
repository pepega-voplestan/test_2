# Phase 0 Research: Email Domain Whitelist

All items below resolve the Technical Context; no `NEEDS CLARIFICATION` markers
remain (the two open questions were resolved in the spec's Clarifications
session on 2026-08-04).

## R1. Where to enforce the whitelist

**Decision**: Enforce at the **send-code (step 1)** handler of both flows —
`POST /auth/register/send-code` (`api/src/routes/auth.js`) and
`POST /users/:id/email/send-code` (`api/src/routes/users.js`) — immediately
after the existing Zod `safeParse`, before creating a `VerificationCode` row or
calling `sendVerificationEmail`.

**Rationale**: Both flows are two-step (submit → emailed 6-digit code → verify).
Checking at step 1 means a disallowed address never receives a verification
email (FR-001, FR-002, SC-003) and no `VerificationCode` row is created. The
step-2 verify handlers need no change because a rejected step-1 request never
produces a code to verify. Placing it right after `safeParse` guarantees the
email is already format-valid before we extract its domain.

**Alternatives considered**:
- *Enforce only in a Zod `.refine()` on the email field*: rejected as the sole
  mechanism because the existing handlers map `issues[0].path[0] === "email"`
  to the generic message "Введите корректный email", which cannot distinguish
  "malformed" from "domain not allowed". A distinct explicit check yields a
  clear, distinct Russian message. (A `.refine()` could be added additionally,
  but the explicit check is the authoritative one.)
- *Enforce at step 2 (verify)*: rejected — a verification email would already
  have been sent to the disallowed address, violating FR-002/SC-003.

## R2. How to store and resolve the domain list

**Decision**: A **static, in-code** `Set` `ALLOWED_EMAIL_DOMAINS` (the 18
domains, lowercased) in `api/src/helpers/validation.js`. It is the single source
of truth; there is **no environment variable**. Changing the list means editing
the constant and redeploying.

**Rationale**: Falls under the spec's clarified option ("static configuration —
env var *or a config/constants file*"). The list is 18 stable, well-known
providers that essentially never change, so a version-controlled, code-reviewed,
greppable in-code list is clearer and safer than an env var — and avoids the
"operator sets the var empty and locks out all signups" foot-gun. A `Set` gives
O(1) membership; keeping it in `validation.js` honors Core Principle IV
(validation centralized). *(An earlier draft used an `ALLOWED_EMAIL_DOMAINS` env
override with a default; it was dropped per maintainer preference for a static
list. The only cost was updating a handful of existing register/email-change
tests to use a real whitelisted domain — `gmail.com` — instead of `@test.local`,
which the static list correctly rejects.)*

**Alternatives considered**:
- *Env-var override with in-code default*: rejected per maintainer preference —
  its main practical benefit here was letting existing tests keep `@test.local`
  emails; not worth a standing config knob for a near-static list.
- *Database table + admin panel*: rejected per clarification (out of scope v1);
  adds a migration, model, admin resource, and admin-safety test surface for no
  v1 benefit.
- *JSON/YAML config file read at runtime*: rejected as heavier than an in-code
  constant for an 18-item list.

## R3. Domain extraction & matching semantics

**Decision**: Normalize by `email.trim().toLowerCase()`, take the substring
after the **last** `@` (`slice(lastIndexOf('@') + 1)`), and test exact
membership in the `Set`. Case-insensitive (FR-004), exact full-domain match —
no subdomain or suffix matching (FR-005).

**Rationale**: Zod `.email()` has already guaranteed a structurally valid single
address before this runs, so exactly one `@` and a non-empty domain are present;
using `lastIndexOf('@')` is defensive. Exact `Set` membership makes
`user@mail.gmail.com`, `user@notgmail.com`, and `user@gmail.com.evil.net` all
fail — each is a distinct string not in the set (covers the look-alike/subdomain
edge cases). Only the domain is lowercased for comparison; the **stored** email
is left exactly as the user submitted it, so no existing storage behavior
changes.

**Alternatives considered**:
- *Suffix / `endsWith` matching*: rejected — would wrongly accept
  `gmail.com.evil.net` and arbitrary subdomains, violating FR-005.
- *Lowercasing the stored email*: rejected — out of scope and a behavior change
  to existing accounts; only comparison is case-folded.

## R4. Empty/absent configuration behavior

**Decision**: `isAllowedEmailDomain(email)` returns `false` for every address
when the resolved `Set` is empty (fail closed) — FR-012.

**Rationale**: A misconfigured/emptied whitelist should block all new emails
rather than silently admit everyone, which is the safe failure direction for an
allow-list. The shipped default (18 domains) means this only triggers on
explicit operator misconfiguration.

## R5. Error responses & Russian copy (non-disclosure)

**Decision**:
- Registration reject → HTTP **400**, body `{ error: "Регистрация доступна только для адресов популярных почтовых сервисов" }`.
- Email-change reject → HTTP **400**, body `{ error: "Этот почтовый сервис не поддерживается" }`.

Neither message enumerates the whitelist (FR-007).

**Rationale**: 400 matches how these handlers already report other
client-supplied email problems ("Введите корректный email"), keeping the
frontend's existing error-rendering path working with no new status handling.
Copy is Russian per Principle II and intentionally generic to avoid disclosing
the list.

**Alternatives considered**: 403 Forbidden — reasonable, but 400 is consistent
with the surrounding "bad input" responses in the same handlers and avoids
implying an auth/permission problem. Chose 400 for consistency.

## R6. Frontend gating

**Decision**: The frontend does **not** replicate the domain list. It continues
to render the server's returned `error` string on the registration and
email-change forms (existing behavior). No new client-side list.

**Rationale**: Backend is authoritative (Principle IV). Shipping the list to the
client to build a client-side gate would expose the full whitelist, conflicting
with FR-007's non-disclosure intent. The cost/benefit of a client-side pre-check
(one saved round-trip) does not justify that disclosure for v1. Documented as a
deliberate choice in the Constitution Check.

## R7. Testing approach

**Decision**:
- **Unit** (`api/tests/unit/validation.test.js`): exercise `isAllowedEmailDomain`
  for approved domain, uppercase/mixed-case, surrounding whitespace, unlisted
  subdomain, look-alike/superstring, and fail-closed on empty set (inject via
  the exported predicate / env).
- **Integration — registration** (`api/tests/integration/auth.test.js`,
  unauthenticated): non-approved domain → 400 and **no** `VerificationCode` row
  and `sendVerificationEmail` not called; approved domain → 200 (existing happy
  path preserved).
- **Integration — email change** (`api/tests/integration/users.test.js`,
  authenticated): non-approved domain → 400 and existing email unchanged
  (FR-014); approved domain → proceeds.

**Rationale**: Covers both required auth states (Constitution rate-limit rule),
uses the established `request()`/`cleanDb()`/fixtures harness, and asserts the
"no side effects on reject" guarantee (SC-003) at the row + mail-mock level.
Tests remain sequential and file-isolated.
