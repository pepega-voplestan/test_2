<!--
SYNC IMPACT REPORT
==================
Version change: 3.0.0 → 3.1.0
Rationale: MINOR bump. Two new Core Principles are ADDED — VI (Design-First,
Tests Second) and VII (Minimal, Meaningful Comments). No existing principle is
removed or redefined and no prior guidance is narrowed, so this is additive
under the Versioning rule ("MINOR for new or materially expanded
principles/sections").

Driven by: specs/007-email-whitelist (Email Domain Whitelist). Two lessons were
codified: (1) the whitelist was deliberately implemented as a static in-code
list rather than an environment variable whose main benefit was test
convenience — design chosen over test ergonomics; (2) comment density on the
new code was flagged as too high.

Modified sections:
  - Core Principles → ADDED "VI. Design-First, Tests Second" and
    "VII. Minimal, Meaningful Comments".

Unchanged: Core Principles I–V, all Domain & Content Constraints, the entire
Development Workflow & Quality Gates section, and Governance.

Removed sections: none

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check gate is dynamic —
       "[Gates determined based on constitution file]"; no hardcoded principle
       list, remains aligned)
  - ✅ .specify/templates/spec-template.md (no constitution coupling)
  - ✅ .specify/templates/tasks-template.md (no constitution coupling)

Runtime guidance requiring propagation:
  - ✅ CLAUDE.md "Core Principles (Non-Negotiables)" list → the two new
    principles were added via the /docs skill (CLAUDE.md is never edited
    directly).

Follow-up TODOs: none.
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

### VI. Design-First, Tests Second

Components MUST be designed for correctness, clarity, and sound architecture on
their own merits. Shaping or altering production code PRIMARILY to make tests
easier to write is PROHIBITED — tests adapt to a well-designed component, not the
other way around. A test-only seam or hook is permitted ONLY when it does not
compromise the production design; when design quality and testability conflict,
fix the design first, then adapt the tests.

Rationale: Test-convenience that leaks into production shape yields abstractions
that serve the suite rather than the product, accreting complexity and
misleading future readers about why the code is structured as it is. Sound design
is testable design; the reverse is not guaranteed.

### VII. Minimal, Meaningful Comments

Comments MUST be sparse and MUST carry non-obvious information — the WHY,
invariants, gotchas, and constraints the code cannot express on its own. Comments
that merely restate what the code already says are PROHIBITED. Prefer
self-explanatory names and structure over narration; when a comment is warranted,
make it earn its place.

Rationale: High comment density dilutes signal, drifts out of sync with the code
it describes, and buries the few comments that genuinely matter. Meaningful-only
comments keep the codebase readable and trustworthy.

## Domain & Content Constraints

These invariants are enforced backend-first and MUST be gated on the frontend as
a secondary guard:

- **Bounded media galleries per post/comment**: a shout or comment carries
  EITHER an ordered gallery of up to five images OR a single YouTube embed —
  never both. The five-item ceiling and the gallery/YouTube exclusivity are
  enforced backend-first; the frontend MUST gate selection accordingly. Video
  remains a single, non-gallery attachment. Galleries are immutable once
  published: there is no edit-time pathway to add, remove, or reorder items.
  GIFs MUST NOT appear in a gallery of 2+ items, from either an uploaded
  animated file or a Giphy-picker reference — a single GIF attachment (not
  part of a gallery) is unaffected and continues to work as it always has.
  *(Redefined in v2.0.0; prior to that a post carried at most one image.
  Narrowed in v3.0.0 — v2.0.0 explicitly permitted GIFs as gallery members;
  that permission is withdrawn.)*
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

**Version**: 3.1.0 | **Ratified**: 2026-06-23 | **Last Amended**: 2026-08-04
