<!--
SYNC IMPACT REPORT
==================
Version change: 5.0.0 → 5.1.0

Rationale for MINOR (not MAJOR): the amendment relaxes a MECHANISM requirement
inside Principle III and tightens the guarantee that requirement existed to
serve. Nothing compliant under v5.0.0 becomes non-compliant — a per-environment
configurable window remains permitted — and no guarantee owed to a user or an
operator is withdrawn: fresh media still cannot be destroyed by a bad window,
and the protection is now stated for BOTH ways of holding one. v5.0.0 was MAJOR
because it withdrew an absolute guarantee ("media behind live content is never
reclaimed"); this amendment withdraws nothing, so the Versioning rule's
"backward-incompatible removals or redefinitions" clause does not apply.

Driven by: /speckit-analyze of specs/011-media-retention-windows (finding D1).
v5.0.0's fourth reclamation ground required every declared file class to have
"its own per-environment configurable window". Feature 011 subsequently landed
on hardcoded constants (spec FR-015, research R7): the two windows are a product
decision with one right answer in every environment, and the configuration
surface bought a resolver, its tests, three Compose entries and two operator
tasks while ADDING the one failure mode the fail-closed limit exists to prevent
(`Number("-1") || 7 === -1`). The constitution mandated the riskier of the two
designs. The MUST is therefore rewritten to demand what actually matters — one
declared, discoverable window per class, changed only through review — while the
fail-closed limit now covers both forms explicitly.

Modified sections:
  - Core Principles → III. Soft-Delete & Data Preservation (NON-NEGOTIABLE)
    · "Stored media files", fourth ground: "MUST have its own per-environment
      configurable window" → "MUST have its own window declared in exactly one
      place"; a window MAY be a source constant OR per-environment config,
      provided it is declared, discoverable, and review-gated.
    · "Age-based retention", fourth limit ("A misconfigured window MUST fail
      closed"): unchanged in force, now spelled out per form. A source constant
      satisfies it STRUCTURALLY and is the preferred form; an environment-read
      window MUST have a strict throwing resolver, and `Number(env) || DEFAULT`
      is explicitly PROHIBITED for retention windows.

Unchanged: Core Principles I, II, IV, V, VI, VII; the Records paragraph of III
(row preservation remains absolute); the first three reclamation grounds and
their existing configurable safety/grace windows; Advertised state; Restore
fidelity; the other three age-based limits (attachment survives, loss visible
and never a failure, crash-safe + preview); all Exemptions; Domain & Content
Constraints; Development Workflow & Quality Gates; Governance.

Added sections: none
Removed sections: none

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check gate is dynamic —
       "[Gates determined based on constitution file]"; no hardcoded principle
       list, remains aligned)
  - ✅ .specify/templates/spec-template.md (no constitution coupling)
  - ✅ .specify/templates/tasks-template.md (no constitution coupling)

Runtime guidance requiring propagation:
  - ⚠ PENDING (carried over from v5.0.0) — CLAUDE.md "Core Principles": the
    "Soft-delete everywhere" bullet still states media reachable from live
    content is never reclaimed, and "Only reachable image variants exist" still
    describes a still image's variant set as fixed rather than age-dependent.
    Both MUST be rewritten and tagged (Constitution v5.1.0 §III). CLAUDE.md is
    never edited directly — this MUST go through the /docs skill.
  - ⚠ PENDING (carried over from v5.0.0) — docs/infra.md (workers/jobs) once
    feature 011's two sweeps exist; same /docs routing.

Follow-up TODOs (feature 011, outside this file):
  - ⚠ specs/011-media-retention-windows/plan.md — the Constitution Check row
    "III. Stored media files — permitted grounds" justifies PASS with "their own
    configurable windows", which is false under FR-015. Re-state it against
    v5.1.0 ("one declared window per class, in retention.ts, review-gated").
    The plan's Summary and Project Structure also still describe retention.ts as
    "strict window parsing/validation"; it parses nothing.
  - ⚠ specs/011-media-retention-windows/spec.md — US1/US2 narratives, US3 goal
    and Acceptance Scenario 2, and the "Retention window" key entity still call
    the windows configurable/environment-configurable, contradicting FR-015.
    SC-009 and US3 Acceptance Scenario 6 (an invalid window surfacing as a
    failed run) are unreachable under constants and carry zero task coverage —
    restate them as the structural guarantee this amendment now recognises, or
    remove them.
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

**Records.** User content MUST be soft-deleted, never hard-deleted, using the
established markers (`is_deleted=1` for user-removed, `is_deleted=2` for
banned). Rows — content, media, and the link rows joining them — MUST be
preserved. The ONLY permitted hard-delete of a row is notifications under their
14-day TTL. Queries, feeds, and admin actions MUST respect soft-delete state
rather than physically removing rows.

**Stored media files.** Stored media files are governed separately from rows and
MAY be reclaimed, because storage is finite while rows are cheap. Reclaiming a
media file MUST NOT delete any row. Files MAY be reclaimed when:

- the media is unreachable by every display surface in the product; or
- the media was uploaded but never published, after a configurable safety
  window; or
- the media's only references are to soft-deleted content (`is_deleted=1`),
  after a configurable grace period measured from deletion. The grace period
  defaults to a few days and MUST be long enough to cover routine reversal of a
  recent decision; or
- the file belongs to a declared FILE CLASS that has passed a retention window
  for that class, measured from media creation. Each such class MUST be named
  explicitly, MUST have its own window declared in exactly one place, and MUST
  satisfy every limit in "Age-based retention" below. A window MAY be a
  compile-time constant in source OR a per-environment configuration value;
  what is required is that it is declared, discoverable in one named location,
  and changed only through review. This ground reaches media behind live
  content; the three grounds above do not.

**Advertised state.** What the product offers MUST track what it stores. A
surface MUST NEVER be handed an address for a file that has been removed or was
never written, and a reduced file MUST NEVER be presented as though it were the
full one. When a file class is reclaimed, the state recorded for that media MUST
distinguish it from wholesale reclamation, so that content whose files are
partially reclaimed continues to render rather than losing its attachment.

**Restore fidelity.** Within the grace period, administrator restore MUST be
fully faithful, including all media. Beyond it, restore remains
CONTENT-complete but is NOT MEDIA-complete: restored content returns with its
text intact and its media permanently gone. This loss is deliberate. It MUST be
visible rather than silent — restored content whose media was reclaimed MUST be
presented as media-free and MUST NEVER render as a broken image.

**Age-based retention.** Reclaiming a file class from media behind LIVE content
is permitted ONLY under all four of these limits:

- **The attachment MUST survive.** Content keeps its attachment. A surface that
  showed media before MUST still present something in its place after — the
  surviving copy where the class leaves one, an explicit notice where it does
  not. Silently dropping the attachment, as wholesale reclamation does, is
  PROHIBITED under this ground.
- **Loss MUST be visible and MUST NEVER be a failure.** Where a reduced copy
  survives, the surface degrades to it. Where a class has no survivor — video
  being the case in point — the surface MUST show an explicit notice, in
  Russian, that the content was deleted. A broken image, a dead player, an
  error, or an unresolved load is PROHIBITED.
- **Removal MUST be crash-safe and reversible in decision terms.** Recorded
  state MUST be advanced before the file is removed, so an interruption leaves
  an unreferenced file rather than an address resolving to nothing. Every such
  sweep MUST offer a preview mode that reports exactly what it would remove and
  changes nothing.
- **A misconfigured window MUST fail closed.** A retention window that is
  absent, zero, negative, or unparseable MUST cause the sweep to remove nothing
  and fail loudly. Silently substituting a default or clamping to a bound is
  PROHIBITED, because these removals are irreversible. A window held as a source
  constant satisfies this STRUCTURALLY — there is no value to be absent or
  unparseable, a non-number is a type error, and a zero or negative one is
  visible in the diff — and is the preferred form for a window with one right
  answer across environments. A window read from the environment MUST resolve
  through a strict fail-closed resolver that throws on every one of those four
  cases; the `Number(env) || DEFAULT` coercion used elsewhere in this codebase
  is PROHIBITED for retention windows, because `Number("-1") || 7` is `-1`, and
  a negative window places the age cutoff in the FUTURE, making every file —
  including media created that day — eligible for irreversible removal.

There is no restoration path for a file reclaimed on this ground. Retention
windows are a product decision about what is worth storing, not a promise of
recoverability.

**Exemptions.** Media whose references include ban-removed content
(`is_deleted=2`) MUST NEVER be reclaimed on any ground, because unbanning
restores that content wholesale and moderation review depends on it being
complete. Media reachable from a user's saved personal library MUST NEVER be
reclaimed on any ground, and MUST NEVER lose a file to age. Animated media MUST
NEVER lose a file to age, at any age, whether attached to content or held in a
library. Avatars are outside this principle entirely.

Media reachable from live content remains exempt from the first three grounds —
it is never reclaimed WHOLESALE while a surface can reach it. It is NOT exempt
from age-based retention of a declared file class, subject to the four limits
above.

Rationale: Soft-delete exists to preserve moderation history, support recovery,
and keep referential integrity for replies, mentions, and audit trails — all of
which live in rows, not in bytes on disk. Retaining every file forever bought
none of those guarantees and grew without bound. v4.0.0 separated rows from
files so the preservation guarantee could stay absolute where it does the work;
this amendment finishes the thought. Holding every byte of live content forever
protected storage volume, not user trust: the classes that dominate the volume
are precisely those nobody requests once content stops being fresh. What users
are actually owed is that their posts keep rendering, that loss is never
disguised as breakage, and that an operator cannot destroy fresh media with a
typo. Those are what the four limits encode, and they are stricter than the
blanket exemption they replace — which offered no such guarantees because it
never contemplated the case.

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

**Version**: 5.1.0 | **Ratified**: 2026-06-23 | **Last Amended**: 2026-08-20
