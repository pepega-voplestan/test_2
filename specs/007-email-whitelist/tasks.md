---
description: "Task list for Email Domain Whitelist for Registration"
---

# Tasks: Email Domain Whitelist for Registration

**Input**: Design documents from `/specs/007-email-whitelist/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/email-whitelist.md, quickstart.md

**Tests**: INCLUDED — the plan's research (R7) and the project's constitution mandate test coverage; both auth states (unauthenticated registration, authenticated email-change) must be exercised.

**Organization**: Tasks grouped by user story (US1 P1, US2 P2, US3 P3) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish have no story label)

## Path Conventions

Web application: backend under `api/src`, tests under `api/tests`, frontend under `web/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make the new configuration knob discoverable; no new tooling required.

- [x] T001 [P] No env var / no `.env.example` change — per maintainer preference the whitelist is a **static in-code list** (see T002), not an environment variable. (Setup phase intentionally empty.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared whitelist predicate that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until T002 is complete.

- [x] T002 Add the whitelist core to `api/src/helpers/validation.js`: a **static** exported `ALLOWED_EMAIL_DOMAINS` `Set` literal (the 18 lowercased domains from FR-006) and an exported `isAllowedEmailDomain(email)` predicate that lowercases+trims, takes the substring after the last `@`, and returns exact `Set` membership — returning `false` when `@` is absent or input is not a string (fail-closed by construction)
- [x] T003 [P] Unit-test `isAllowedEmailDomain` in `api/tests/unit/validation.test.js`: the static set contains exactly the 18 domains; approved domain → true; `USER@GMAIL.COM` (case-insensitive) → true; surrounding whitespace → true; unlisted subdomain `a@mail.gmail.com` → false; look-alike `a@notgmail.com` and superstring `a@gmail.com.evil.net` → false; `@example.com`/`@test.local` → false; missing `@`/non-string → false

**Checkpoint**: Shared predicate implemented and unit-verified — route wiring can begin.

---

## Phase 3: User Story 1 - Block disallowed email domains at registration and email change (Priority: P1) 🎯 MVP

**Goal**: Reject non-approved email domains at the first step of both the registration and email-change flows, before any verification code is created or emailed; approved domains proceed unchanged.

**Independent Test**: Register with `x@example.com` → blocked (no account, no email); register with `x@gmail.com` → proceeds. As a signed-in user, change email to `x@example.com` → blocked (email unchanged); change to `x@yandex.ru` → proceeds.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL before T006/T007)

- [x] T004 [P] [US1] Integration test in `api/tests/integration/auth.test.js` (unauthenticated): `POST /api/v1/auth/register/send-code` with a non-approved domain → 400 with the Russian rejection message, **no** `VerificationCode` row created, and the mocked `sendVerificationEmail` NOT called; with an approved domain → 200 and existing happy path preserved
- [x] T005 [P] [US1] Integration test in `api/tests/integration/users.test.js` (authenticated via `authenticatedAgent`): `POST /api/v1/users/:id/email/send-code` with a non-approved domain → 400 with the Russian rejection message, the user's current email unchanged (FR-014), no code created; with an approved domain → 200

### Implementation for User Story 1

- [x] T006 [P] [US1] Enforce the whitelist in `POST /auth/register/send-code` in `api/src/routes/auth.js`: import `isAllowedEmailDomain`; immediately after `sendCodeSchema` parse succeeds and before the username/email uniqueness checks and code creation, if `!isAllowedEmailDomain(email)` return `400 { error: "Регистрация доступна только для адресов популярных почтовых сервисов" }`
- [x] T007 [P] [US1] Enforce the whitelist in `POST /users/:id/email/send-code` in `api/src/routes/users.js`: import `isAllowedEmailDomain`; after `emailChangeSchema` parse succeeds and before the "already taken" check and code creation, if `!isAllowedEmailDomain(email)` return `400 { error: "Этот почтовый сервис не поддерживается" }`

**Checkpoint**: MVP complete — the whitelist blocks both entry points; T004/T005 pass; existing registration/email-change happy paths and sign-in are unaffected.

---

## Phase 4: User Story 2 - Clear, localized rejection feedback (Priority: P2)

**Goal**: The rejection is understandable, in Russian, and never discloses the whitelist; the frontend surfaces it.

**Independent Test**: Trigger a rejection on each flow → a Russian message appears that contains none of the whitelisted domain strings.

### Tests for User Story 2

- [x] T008 [US2] Add non-disclosure assertions to the rejection cases in `api/tests/integration/auth.test.js` and `api/tests/integration/users.test.js`: assert the `error` string is the expected Russian copy and contains none of the whitelisted domains (e.g. no substring `gmail.com`, `yandex.ru`, …) — FR-007

### Implementation for User Story 2

- [x] T009 [US2] Confirm the registration modal `web/components/AuthModal.tsx` and the email-change UI in `web/components/ProfilePage.tsx` render the backend `error` field for the new 400 responses (reuse the existing error-display path from `web/context/AuthContext.tsx`); do NOT replicate or fetch the domain list client-side (non-disclosure)

**Checkpoint**: Rejections are clearly shown in Russian on both forms without leaking the list.

---

## Phase 5: User Story 3 - Maintain the approved domain list (Priority: P3)

**Goal**: An operator can change the approved domains via configuration without code changes.

**Independent Test**: Edit the `ALLOWED_EMAIL_DOMAINS` list in `helpers/validation.js` (add/remove a domain) and redeploy; confirm a newly-added domain is accepted and a removed one is blocked. *(Maintainability is by code edit + redeploy, not runtime config — the env override was dropped per maintainer preference.)*

### Tests for User Story 3

- [x] T010 [P] [US3] Assert the static list is the single source of truth in `api/tests/unit/validation.test.js`: `ALLOWED_EMAIL_DOMAINS` has exactly the 18 documented domains, membership drives `isAllowedEmailDomain`, and a domain not in the list (e.g. `@test.local`) is rejected (FR-006, FR-009)

### Implementation for User Story 3

- [x] T011 [US3] Document the static email-domain whitelist (the 18 domains, in-code source of truth in `helpers/validation.js`, change-by-redeploy, case-insensitive exact match, login-unaffected gotcha) in `docs/api.md` by invoking the `/docs` skill (per constitution, `docs/*.md` and `CLAUDE.md` MUST be edited only through `/docs`, never directly)

**Checkpoint**: List is operator-configurable and documented.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T012 [P] Run the `quickstart.md` scenarios A–F against local dev and confirm each expected status/message/side-effect
- [x] T013 Run the full API suite and linter — `make test` (or `cd api && npx vitest run`) and `cd api && npm run lint` — and confirm zero regressions (existing sign-in, registration, and email-change happy paths still pass)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — can start immediately.
- **Foundational (Phase 2)**: T002 BLOCKS all user stories; T003 validates it.
- **User Stories (Phase 3+)**: all depend on T002.
  - US1 (P1) is the MVP.
  - US2 (P2) depends on US1 route changes existing (asserts their message quality + frontend).
  - US3 (P3) depends only on T002 (the env-resolved predicate); independent of US1/US2.
- **Polish (Phase 6)**: after the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: after T002. No dependency on other stories.
- **US2 (P2)**: builds on US1's rejection responses (message-quality + UI); testable once US1 routes return the 400s.
- **US3 (P3)**: after T002 only — fully independent of US1/US2.

### Within Each User Story

- Tests written before implementation and expected to fail first (T004/T005 before T006/T007).
- T006 and T007 touch different files (`auth.js` vs `users.js`) and both depend only on T002 → parallelizable.

### Parallel Opportunities

- T001 (Setup) is standalone.
- T003 runs in parallel with the start of US1 work once T002 lands.
- T004 and T005 (different test files) run in parallel; T006 and T007 (different route files) run in parallel.
- US3's T010 can proceed as soon as T002 exists, independent of US1/US2.

---

## Parallel Example: User Story 1

```bash
# Tests first (different files):
Task: "Integration test registration whitelist in api/tests/integration/auth.test.js"   # T004
Task: "Integration test email-change whitelist in api/tests/integration/users.test.js"  # T005

# Then implementation (different files):
Task: "Enforce whitelist in api/src/routes/auth.js"    # T006
Task: "Enforce whitelist in api/src/routes/users.js"   # T007
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup (T001).
2. Phase 2 Foundational (T002, T003) — CRITICAL, blocks everything.
3. Phase 3 US1 (T004–T007).
4. **STOP and VALIDATE**: registration and email-change reject non-approved domains before any code is sent; happy paths intact.
5. Ship — the core restriction is live.

### Incremental Delivery

1. Setup + Foundational → shared predicate ready.
2. US1 → MVP (blocking works on both entry points).
3. US2 → polished Russian feedback + frontend surfacing.
4. US3 → operator-configurable list + docs.

---

## Notes

- **Do NOT modify `registerSchema` (`api/src/helpers/validation.js:29`)** — it is defined but unused; the live registration path uses `sendCodeSchema`. Enforcement is done via the explicit `isAllowedEmailDomain` call in the handlers, not by changing the Zod schemas.
- The domain check runs **after** Zod `.email()` format validation and **before** uniqueness/code creation, so malformed emails still return "Введите корректный email" and disallowed domains never trigger a verification email.
- Comparison lowercases only for matching; the **stored** email is unchanged — no impact on existing accounts (SC-005).
- Both auth states are covered (T004 unauthenticated, T005 authenticated) per the constitution's rate-limit-auth-states rule.
- [P] = different files, no incomplete-task dependency. Commit after each task or logical group.
