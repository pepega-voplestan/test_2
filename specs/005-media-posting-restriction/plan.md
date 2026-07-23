# Implementation Plan: Per-User Media Posting Restriction

**Branch**: `004-shout-delete-visibility` (feature tracked via `specs/005-media-posting-restriction/`, not a dedicated git branch — see note below) | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-media-posting-restriction/spec.md`

**Note on branch**: This feature's spec/plan artifacts live under `specs/005-media-posting-restriction/` per sequential numbering, but at the user's explicit request no new git branch was created — work continues on the existing `004-shout-delete-visibility` branch. The spec directory name and git branch are independent by design (see `speckit-specify` process notes).

## Summary

Add a per-user `is_media_allowed` (`Boolean`, default `true`) flag, editable only from the AdminJS `User` resource, that the backend enforces at every entry point capable of creating media *physically stored on our server*: direct media upload (`POST /upload/media`, `image`/`video` types) and personal GIF upload (`POST /gifs/upload`, an `image`-type `Media` row). A restricted user's request to create such media is rejected outright (403, Russian error message) before any file is written or `Media` row created; text-only posting is unaffected. Nothing else is gated: YouTube attachment (explicit or auto-detected from plain content), Giphy search-and-attach (`POST /gifs/reference` — a reference to Giphy's external CDN, not a file on our server), and all link-preview embeds (imgur/twitter/coub/tenor/giphy/steam) are unaffected by the flag in either direction, for any user.

**Revision note (2026-07-23, twice)**: The original implementation (2026-07-19) gated *every* `mediaId`/`youtubeUrl` attach attempt uniformly and additionally suppressed link-preview embeds via a live per-view DTO read of the author's flag. Per explicit user direction, the scope was narrowed to physically-stored media only, and the live-embed-suppression mechanism (the `isMediaAllowed` DTO field and its `ShoutCard.tsx` consumer) was removed entirely rather than left dormant. A same-day follow-up narrowed it once more: enforcement now applies only to *creating* new physically-stored media (`POST /upload/media`, `POST /gifs/upload`) — attaching an already-existing `mediaId` to a shout/comment, most visibly reusing a previously-uploaded personal GIF from "Мои GIF", is never gated, regardless of `media_type`. `shouts.js`/`comments.js` no longer read `is_media_allowed` at all. The rest of this document describes the original design; where it conflicts with the above, the above governs. See `data-model.md`'s "Scope of enforcement" section and `contracts/embed-resolution-dto.md` / `contracts/shout-comment-creation.md` for the full before/after.

## Technical Context

**Language/Version**: Node.js (Express, ESM) backend; TypeScript + React 18 (Vite) frontend

**Primary Dependencies**: Prisma ORM (PostgreSQL); AdminJS (`@adminjs/prisma`) for the admin panel; no new third-party dependency is introduced

**Storage**: PostgreSQL via Prisma — exactly one new column, on `User` (`is_media_allowed Boolean @default(true)`); no schema change to `Shout`/`Comment`; additive migration, no data loss, default preserves current behavior for all existing rows

**Testing**: Vitest (`api/tests/integration`, `web/tests` — both run via `vitest run`, sequential per project convention)

**Target Platform**: Existing Docker/Nginx-deployed web app (Linux server) + browser clients

**Project Type**: Web application (backend `api/` + frontend `web/`)

**Performance Goals**: Zero additional DB round-trips at the gated routes — the `is_media_allowed` check is merged into the `select` of each route's existing per-request `is_banned` lookup, not a new query. *(Post-revision: the embed-resolution live read no longer exists — see Summary revision note. The `mediaId` branch of shout/comment creation now also selects `media_type` on the same existing `Media` lookup it already performed, still zero additional queries.)*

**Constraints**: Prisma-only data access (constitution IV) — the flag check is a plain Prisma read. Backend-authoritative enforcement (constitution IV, Domain Constraints preamble) — the frontend must additionally gate the physical-upload UI (composer image/video attach, GIF-picker upload tab and personal-GIF reuse) as a secondary guard (spec FR-012 requires the *server* not depend on this, but the constitution's frontend-gate-as-secondary-guard convention for domain invariants still applies here, matching how `visibility_tag` selection is already gated client-side); Giphy search-and-attach and YouTube are never gated client-side either, since they're never gated server-side. Attached-media non-retroactivity (spec FR-014) — new-media blocking is evaluated once at write time and never revisits existing `Media` rows. *(Post-revision: there is no longer a retroactive-by-design counterpart — see Summary revision note.)*

**Scale/Scope** *(post-revision — see Summary)*: One schema migration (one new `Boolean` column on `User`, nothing on `Shout`/`Comment`); exactly two backend route handlers retain a guard clause (`upload.js`, and `gifs.js`'s personal-upload route only) — `shouts.js`/`comments.js` no longer read `is_media_allowed` at all, and `gifs.js`'s reference route was never gated; `auth.js` retains its UI-only `mediaAllowed` session field; one AdminJS resource property (`admin.js`, unchanged); composer/GIF-picker frontend gating narrowed to the two upload actions only (`ShoutInput.tsx`, `EmojiPicker.tsx`, `GifPicker.tsx`'s upload button) — reuse of any existing `mediaId`, including "Мои GIF" selection, is ungated client-side too. The `isMediaAllowed` DTO field and its `ShoutCard.tsx` conditional were removed as dead code once embed suppression was dropped; `PHYSICAL_MEDIA_TYPES` in `helpers/media.js` was added and then removed the same day once the `mediaId`-reuse gate it supported was itself removed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Session-Based Authentication Only** — PASS. No change to auth/session mechanics. The *authoritative* copy of `is_media_allowed` is deliberately kept out of server-side enforcement decisions on `req.session.user` (matching the existing `is_banned` convention) and always re-read fresh from Prisma per request — see `research.md` §2. A separate, explicitly non-authoritative UI-only copy is added to the session purely for client-side gating.
- **II. Russian-Language UI Integrity** — PASS. The new rejection message (`"Вам запрещено прикреплять медиафайлы"`) is Russian, matches the terse imperative style of existing route errors (`"Вы забанены!"`). No English UI copy introduced.
- **III. Soft-Delete & Data Preservation (NON-NEGOTIABLE)** — N/A/PASS. This feature adds no new deletion path; it only prevents *creation* of new physically-stored media for a restricted user. Existing media and shout/comment rows are never touched or deleted (FR-014).
- **IV. Validated, Prisma-Mediated Data Access** — PASS. All checks and reads (`is_media_allowed` on the ban-check select; `media_type` on the existing `mediaId` lookup) are plain Prisma calls, no raw SQL, no new writes beyond the admin-edited column itself. The authorization check is implemented as an imperative post-`safeParse` guard (matching the existing ban-check pattern), keeping Zod's shape-validation role separate from authorization — see `research.md` §7. Backend enforcement of new-media blocking is authoritative (FR-012); frontend gating of the physical-upload paths is an explicit secondary guard, matching the `visibility_tag` precedent this same principle calls out.
- **V. Optimistic UI with Guaranteed Rollback** — PASS, N/A for new optimistic paths. This feature adds a hard-reject-before-optimistic-update behavior (the composer should gate media attachment client-side before attempting submission, per the frontend-gate convention), not a new optimistic mutation; no rollback design is needed since nothing is optimistically applied and then possibly reverted — the rejection is a plain synchronous request failure, same shape as the existing ban-check rejection.
- **Domain constraint — single media per post/comment** — Unaffected; this feature doesn't change how many media items may be attached, only whether any may be attached for a given author.
- **Domain constraint — `visibility_tag` strip** — PASS, explicitly verified not to interact badly: the existing strip logic (`shouts.js:244`) only fires on `!finalMediaId`, and a restricted user's request is rejected before `finalMediaId` is ever computed when media params are present — see `contracts/shout-comment-creation.md`.
- No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-media-posting-restriction/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   ├── shout-comment-creation.md
│   ├── media-upload-and-gif.md
│   ├── embed-resolution-dto.md
│   └── admin-user-flag.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
api/
├── prisma/
│   └── schema.prisma          # User.is_media_allowed (Boolean, default true) — the only schema change
├── src/
│   ├── routes/
│   │   ├── shouts.js           # POST /shouts: is_media_allowed no longer read at all; mediaId/youtubeUrl/auto-detect branches all unguarded
│   │   ├── comments.js         # POST /shouts/:id/replies: same — is_media_allowed no longer read
│   │   ├── upload.js           # POST /upload/media: is_media_allowed guard unchanged (avatar upload untouched) — the ONLY route gating new image/video upload
│   │   ├── gifs.js             # POST /gifs/upload (personal upload): guard unchanged — the ONLY other gated route. POST /gifs/reference (Giphy search-attach): never gated
│   │   └── auth.js             # req.session.user retains mediaAllowed (UI-only copy, mirrors showNsfw/showPolitics) — unchanged
│   ├── helpers/
│   │   └── feed.js             # enrichFeed(): isMediaAllowed DTO field REMOVED (dead — no consumer left)
│   └── admin.js                 # User resource: is_media_allowed property (renders as a checkbox; no before/after hooks needed) — unchanged
└── tests/
    └── integration/
        ├── shouts.test.js       # updated: reuse of any existing mediaId, giphy-mediaId, youtubeUrl now allowed for restricted users; isMediaAllowed-DTO tests removed
        ├── comments.test.js     # updated: same
        ├── upload.test.js       # unchanged: restricted-user *new* upload rejection still applies
        └── gifs.test.js         # updated: POST /gifs/reference now allowed for restricted users; POST /gifs/upload (new file) unchanged

web/
├── types.ts                     # isMediaAllowed field REMOVED from the Shout/Comment author sub-type; AuthContext user type keeps mediaAllowed
├── context/
│   └── AuthContext.tsx           # session-user interface keeps mediaAllowed?: boolean — unchanged
├── components/
│   ├── ShoutCard.tsx             # extractEmbeds() call sites unconditional again — isMediaAllowed conditional REMOVED
│   ├── ShoutInput.tsx             # gate narrowed to just the image/video attach button; GifPicker's 'mygif' (reuse) selection no longer checks mediaAllowed
│   └── EmojiPicker.tsx / GifPicker.tsx  # GifPicker's uploadAllowed prop gates only the "Загрузить GIF" upload button; "Мои GIF" reuse thumbnails and search/favorites tabs always active
└── tests/
    └── unit/                     # ShoutCard.test.tsx REMOVED (tested only the now-removed embed-suppression mechanism)
```

**Structure Decision**: Existing web-application layout (`api/` backend, `web/` frontend) is reused as-is — no new services, packages, or directories. There is no schema change to `Shout`/`Comment`. *(Post-revision: the DTO/embed-rendering path mentioned in the original design here was removed entirely rather than kept as a read-time join — see Summary revision note.)*

## Complexity Tracking

*No entries — Constitution Check reported no violations.*
