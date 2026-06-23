<!--
SYNC IMPACT REPORT
==================
Version change: (template / unversioned) → 1.0.0
Rationale: Initial ratification. First concrete constitution replacing the
unfilled template. MAJOR bump to 1.0.0 establishes the baseline governance set.

Modified principles:
  - [PRINCIPLE_1_NAME] → I. Session-Based Authentication Only
  - [PRINCIPLE_2_NAME] → II. Russian-Language UI Integrity
  - [PRINCIPLE_3_NAME] → III. Soft-Delete & Data Preservation (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. Validated, Prisma-Mediated Data Access
  - [PRINCIPLE_5_NAME] → V. Optimistic UI with Guaranteed Rollback

Added sections:
  - Domain & Content Constraints (was [SECTION_2_NAME])
  - Development Workflow & Quality Gates (was [SECTION_3_NAME])

Removed sections: none

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (uses dynamic Constitution Check gate;
       no hardcoded principles — remains aligned)
  - ✅ .specify/templates/spec-template.md (no constitution coupling)
  - ✅ .specify/templates/tasks-template.md (no constitution coupling)

Follow-up TODOs: none. Ratification date set to initial adoption date.
-->

# Vopley.net Constitution

## Core Principles

### I. Session-Based Authentication Only

Authentication state MUST be managed exclusively through server-side sessions.
JWTs and `localStorage`/`sessionStorage`-based auth tokens are PROHIBITED for
authentication state. Any feature touching auth MUST integrate with the existing
session mechanism and MUST NOT introduce client-persisted credentials.

Rationale: A single, server-controlled auth model eliminates token-leakage and
desync classes of bugs and keeps revocation immediate and authoritative.

### II. Russian-Language UI Integrity

All user-visible strings MUST be in Russian with correct grammatical
declensions and pluralization. Introducing English-language UI copy is
PROHIBITED. Character-counting and text-processing logic MUST account for the
`@[username:userId]` mention token format wherever user text is measured or
rendered.

Rationale: The product is a Russian-language social app; mixed-language copy and
incorrect declensions break user trust and the product's identity.

### III. Soft-Delete & Data Preservation (NON-NEGOTIABLE)

User content MUST be soft-deleted, never hard-deleted, using the established
markers (`is_deleted=1` for user-removed, `is_deleted=2` for banned). The ONLY
permitted hard-delete is notifications under their 14-day TTL. Queries, feeds,
and admin actions MUST respect soft-delete state rather than physically removing
rows.

Rationale: Soft-delete preserves moderation history, supports recovery, and
keeps referential integrity for replies, mentions, and audit trails.

### IV. Validated, Prisma-Mediated Data Access

All database access MUST go through Prisma; raw SQL is permitted ONLY for
migrations or genuinely unavoidable edge cases, and such cases MUST be justified
in review. All external input MUST be validated with Zod schemas defined in
`api/src/helpers/validation.js` and shared across routes. Backend validation is
the authoritative guard; frontend gating (e.g. stripping `visibility_tag` when
no `media_id` is present) MUST stay in sync with it but never replace it.

Rationale: A single ORM boundary and a single validation layer make data access
auditable, type-safe, and resistant to drift between client and server rules.

### V. Optimistic UI with Guaranteed Rollback

Interactive mutations that the design treats as optimistic — likes, deletes,
poll votes, and equivalents — MUST update the UI immediately AND MUST revert to
the prior state on error. Shipping an optimistic update without a rollback path
is PROHIBITED.

Rationale: Optimistic updates keep the app responsive, but without rollback they
silently desync the client from server truth and erode data trust.

## Domain & Content Constraints

These invariants are enforced backend-first and MUST be gated on the frontend as
a secondary guard:

- **Single media per post/comment**: a shout or comment carries an image OR a
  YouTube embed, never both. The backend enforces this; the frontend MUST gate
  selection accordingly.
- **Single-level comments**: no nested replies. `parent_id` on shouts is legacy
  and MUST NOT be repurposed for threading.
- **One pinned shout maximum**: pinning is admin-managed and prepended only to
  the first page of the "new" tab. Setting a new pin does NOT auto-unpin the
  previous one; pin-related changes MUST verify this behavior explicitly.
- **Notification dedup**: a reply notification is suppressed when the commenter
  is already mentioned in the same comment. This dual-case logic in
  `routes/comments.js` MUST remain unified, not split.

## Development Workflow & Quality Gates

- **Test isolation**: tests run sequentially. Introducing `describe`-level
  parallelism or shared mutable state between test files is PROHIBITED.
- **Environment-driven config**: security-sensitive constants (e.g. `bcrypt`
  rounds: 10 in prod, 4 in tests) MUST be set via environment/`tests/setup.js`,
  never hardcoded into business logic.
- **Rate-limit auth states**: endpoints whose rate limits fall back to IP when
  unauthenticated (upload, shout-create) MUST be tested in both authenticated
  and unauthenticated states.
- **Admin safety**: any uncaught error in `admin.js` exits with code 1 in
  production. Admin changes MUST be tested before deployment.
- **SSE provider order**: `SSEProvider` MUST remain an ancestor of
  `NotificationsProvider` and every `useSSE` consumer.
- **Documentation discipline**: `CLAUDE.md` and `docs/*.md` MUST be updated only
  through the `/docs` skill, never edited directly.

## Governance

This constitution supersedes ad-hoc practices and conventions where they
conflict. All changes are governed as follows:

- **Authority**: When this document and other guidance disagree, this document
  prevails. The Core Principles are binding constraints, not suggestions.
- **Amendments**: Changes MUST be made by editing this file, accompanied by a
  Sync Impact Report (see top of file) and propagation to dependent templates
  (`.specify/templates/*`) and runtime guidance (`CLAUDE.md`, `docs/*`).
- **Versioning**: Semantic versioning applies. MAJOR for backward-incompatible
  principle removals or redefinitions; MINOR for new or materially expanded
  principles/sections; PATCH for clarifications and non-semantic refinements.
- **Compliance review**: Plans and reviews MUST verify compliance via the
  Constitution Check gate in `plan-template.md`. Deviations MUST be documented
  and justified in the plan's Complexity Tracking section, or the design MUST be
  revised to comply.

**Version**: 1.0.0 | **Ratified**: 2026-06-23 | **Last Amended**: 2026-06-23
