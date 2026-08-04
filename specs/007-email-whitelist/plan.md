# Implementation Plan: Email Domain Whitelist for Registration

**Branch**: `email-whitelist` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-email-whitelist/spec.md`

## Summary

Restrict which email domains may enter the system. A new configuration-driven
whitelist of 18 approved domains is checked at the **first step** of both the
registration flow (`POST /auth/register/send-code`) and the existing-user
email-change flow (`POST /users/:id/email/send-code`), *before* any verification
code is generated or emailed. Non-approved domains are rejected with a
Russian-language error that does not disclose the full list. The whitelist lives
in a single shared, Zod-adjacent helper in `api/src/helpers/validation.js` (the
project's canonical validation module) as a **static, in-code `Set`** — the
single source of truth, changed by editing the list and redeploying (no env
var). The predicate is fail-closed by construction (unknown domains, and an
emptied list, reject). No database schema change, no admin UI. Existing users'
sign-in is never affected.

## Technical Context

**Language/Version**: Node.js (ESM `.js`) backend; React 18 + TypeScript (Vite) frontend

**Primary Dependencies**: Express, Prisma, Zod (backend); React (frontend). No new dependencies.

**Storage**: PostgreSQL via Prisma — **no schema change** for this feature (whitelist is static config, not a table). Existing `User.email` and `VerificationCode` tables are read/written by the flows unchanged.

**Testing**: Vitest. Integration tests under `api/tests/integration/` (`auth.test.js`, `users.test.js`); unit tests under `api/tests/unit/` (`validation.test.js`). Tests run **sequentially**; `bcrypt` rounds = 4 via env in `tests/setup.js`.

**Target Platform**: Linux server (Docker + Nginx), browser frontend.

**Project Type**: Web application (`api/` backend + `web/` frontend + `workers/`).

**Performance Goals**: The domain check is an in-memory `Set.has()` on a normalized string — O(1), negligible; no measurable added latency (SC-003).

**Constraints**: Backend is the authoritative guard (Core Principle IV). All user-visible copy in Russian (Core Principle II). Fail-closed on empty config (FR-012). The rejection message MUST NOT enumerate the whitelist (FR-007).

**Scale/Scope**: Two backend route handlers touched, one shared helper + constant added, ~2 test files extended, optional minimal frontend error surfacing. 18 domains.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Constraint | Impact | Compliance |
|---|---|---|
| I. Session-based auth only | Feature adds a pre-check to registration/email-change; does not touch session mechanism, introduces no JWT/localStorage. | ✅ Pass |
| II. Russian-language UI integrity | New rejection copy for both flows must be Russian with correct grammar. | ✅ Pass — messages specified in Russian; no English UI copy introduced. |
| III. Soft-delete & data preservation | No deletes; no content lifecycle changes. | ✅ N/A |
| IV. Validated, Prisma-mediated data access | Whitelist predicate lives in `helpers/validation.js` (canonical validation module); no new raw SQL; DB access unchanged and Prisma-mediated. | ✅ Pass |
| V. Optimistic UI with rollback | No optimistic mutation added (registration/email-change are already request/response, not optimistic). | ✅ N/A |
| Config location | Whitelist is a static, in-code `Set` in `helpers/validation.js` (the canonical validation module), not buried in a route handler. The list rarely changes and is version-controlled/code-reviewed; a redeploy is acceptable to change it. (Env override was deliberately dropped per maintainer preference.) | ✅ Pass |
| Rate-limit auth states | Registration send-code is unauthenticated (IP-based); email-change send-code is authenticated. Both auth states must be tested. | ✅ Addressed in test plan |
| Test isolation (sequential, no shared mutable state) | New tests extend existing files using the established `cleanDb()`/fixtures pattern. | ✅ Pass |
| Admin safety (`admin.js`) | Not touched (no admin UI for the list in v1). | ✅ N/A |
| Documentation discipline (`/docs` only) | Any CLAUDE.md/docs update goes through the `/docs` skill, never direct edits. | ✅ Noted for post-implementation |

**Frontend secondary-guard note**: The constitution's explicit "backend-first + frontend secondary guard" mandate targets the enumerated domain invariants (galleries, comments, pins, dedup). For this new whitelist, the frontend deliberately does **not** replicate the domain list — doing so would ship the full whitelist to the client and conflict with FR-007's non-disclosure intent. The frontend's role is limited to surfacing the backend's Russian error. This is a deliberate design choice, not a violation of Principle IV (which requires *any* frontend gating to stay in sync, and never to *replace* the backend guard — the backend remains authoritative). Recorded in [research.md](./research.md).

**Result**: No unjustified violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/007-email-whitelist/
├── plan.md              # This file
├── spec.md              # Feature spec (with Clarifications)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── email-whitelist.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
api/
├── src/
│   ├── helpers/
│   │   └── validation.js          # ADD: ALLOWED_EMAIL_DOMAINS set + isAllowedEmailDomain(email) predicate
│   └── routes/
│       ├── auth.js                # EDIT: /auth/register/send-code — reject non-approved domain before code
│       └── users.js               # EDIT: /users/:id/email/send-code — reject non-approved domain before code
└── tests/
    ├── unit/
    │   └── validation.test.js     # EDIT: unit-test isAllowedEmailDomain (case, subdomain, fail-closed)
    └── integration/
        ├── auth.test.js           # EDIT: registration blocked/allowed by domain (unauthenticated)
        └── users.test.js          # EDIT: email-change blocked/allowed by domain (authenticated)

web/
└── (optional, minimal) surface the backend error string on the registration
    and email-change forms — no list replication.
```

**Structure Decision**: Web application layout (`api/` + `web/`). The change is
backend-concentrated: one shared helper and two route handlers in `api/src`,
with tests extending the existing `api/tests` suite. Frontend work is limited to
displaying the server-provided Russian error and is optional for the MVP.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
