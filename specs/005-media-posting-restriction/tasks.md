---

description: "Task list for Per-User Media Posting Restriction"
---

# Tasks: Per-User Media Posting Restriction

**Input**: Design documents from `/specs/005-media-posting-restriction/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Not explicitly requested as a TDD gate in the spec. Test-file updates are included as normal implementation tasks within each story rather than a separate "write failing tests first" phase, matching the convention used in `specs/004-shout-delete-visibility/tasks.md`.

**Organization**: Tasks are grouped by user story (US1 = P1, US2 = P1, US3 = P2) to enable independent implementation and testing.

**Revision note (2026-07-23)**: All tasks below (T001-T026) reflect the original design and were completed as described. That design's scope was subsequently narrowed by explicit user direction — US3 (embed/link-preview suppression) was removed entirely, and US2's media-attachment gating was narrowed to physically-stored media only (YouTube and Giphy-search-attach are no longer gated). See `checklists/requirements.md`'s "Scope revision (2026-07-23)" entry and `data-model.md`'s "Scope of enforcement" section for what changed and why. This file is left as a historical record of the original implementation pass rather than rewritten.

**Note**: This version supersedes an earlier draft. Per a `/speckit-clarify` correction (2026-07-18), the flag is `is_media_allowed` (`Boolean`, default `true`) — not `media_allowed` (`Int`, default `1`) — and User Story 3 (embed suppression) no longer uses a frozen per-row snapshot column; it's a single live read of the author's current flag, which also removed all `Shout`/`Comment` schema changes and decoupled US3 from US2's route-handler edits.

## Path Conventions

Web application: `api/src/...` (Express + Prisma backend), `web/...` (React + TypeScript frontend) — per `plan.md` Project Structure.

---

## Phase 1: Setup

No setup tasks required. This feature introduces no new dependencies or infrastructure — only one additive Prisma column and guard clauses within already-established files. Work begins at Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the single column every user story reads.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 In `api/prisma/schema.prisma`, add `is_media_allowed Boolean @default(true)` to the `User` model (see `data-model.md`); run `npx prisma migrate dev --name add_is_media_allowed` to generate and apply the migration. No other model changes.

**Checkpoint**: The column exists with the correct default — every user story can now proceed.

---

## Phase 3: User Story 1 - Administrator revokes a user's media privileges (Priority: P1)

**Goal**: An administrator can view and toggle any user's `is_media_allowed` flag from `/admin`, with the change persisted immediately.

**Independent Test**: In `/admin`, open a user record, switch `is_media_allowed` off, save, and confirm the value is persisted; switch it back on and confirm the same.

### Implementation for User Story 1

- [ ] T002 [US1] Manually verify in `/admin` that `is_media_allowed` renders as an editable checkbox on the `User` resource (`api/src/admin.js:78-199`) without any code change — AdminJS auto-discovers new Prisma columns, and because this one is a genuine `Boolean` (unlike `is_banned`'s `Int`), it renders as a checkbox automatically. No entry needs to exist in the `properties` block at lines 82-86, which only overrides `password_hash`/`id`/`created_at`. Confirm: the field is visible and editable, saving persists the value, and a freshly registered user shows `is_media_allowed = true` by default (per T001's column default).
- [X] T003 [US1] Extend `api/tests/unit/admin.test.js`'s existing `describe("User edit.after — ban")` block (around the "does not touch content when is_banned is unchanged" case, ~line 199) with a regression test confirming the ban side-effect handler (`edit.after`, lines 159-196) is unaffected by an `is_media_allowed` change on the same request — i.e., toggling `is_media_allowed` alone must never trigger the shout/comment `is_deleted=2` bulk-hide logic that's gated on `is_banned`. (Depends on T001.)

**Checkpoint**: User Story 1 is fully functional and independently testable — the admin control exists and works, though it has no visible effect on posting yet (that's User Story 2).

---

## Phase 4: User Story 2 - Restricted user attempts to post media (Priority: P1)

**Goal**: A user with `is_media_allowed = false` is rejected at the server on every attempt to attach media (image, video, GIF, GIF-picker pick/upload) to a shout or comment, while text-only posting is unaffected; the composer/GIF-picker UI also hides these options client-side as a secondary guard.

**Independent Test**: With a test user's `is_media_allowed` set to `false`, attempt to submit a shout/comment with an attached image directly against the API and confirm it's rejected with no media stored; confirm a text-only submission from the same user still succeeds.

### Implementation for User Story 2

- [X] T004 [US2] In `api/src/routes/shouts.js`, inside the `POST /shouts` handler (currently lines 169-244): extend the existing ban-check `prisma.user.findUnique` select (currently `{ is_banned: true }`) to also select `is_media_allowed`; immediately after the existing `if (authCheck?.is_banned) return res.status(403)...` line, add `if (!authCheck?.is_media_allowed && (mediaId || youtubeUrl)) return res.status(403).json({ error: "Вам запрещено прикреплять медиафайлы" })`, before the existing `prisma.media.findUnique` / YouTube-URL-to-media conversion logic (currently lines 200-241) runs. See `contracts/shout-comment-creation.md`.
- [X] T005 [P] [US2] In `api/src/routes/comments.js`, inside the `POST /shouts/:id/replies` handler (currently lines 15-103): same pattern — extend the ban-check select (currently at lines 16-17) and add the identical guard clause before the media-validation logic at lines 60-103. (Depends on T001; different file from T004, parallel.)
- [X] T006 [P] [US2] In `api/src/routes/upload.js`, inside the `POST /upload/media` handler (currently lines 31-116): extend the ban-check select at line 46 to add `is_media_allowed`; add the same guard clause immediately after the existing `if (banCheck?.is_banned)` check at line 47, before any Sharp/file processing continues (discard the already-parsed multer file the same way other rejected-upload branches already do). Do **not** touch the avatar-upload handler (line 227+) — it is explicitly out of scope. (Depends on T001; different file, parallel.)
- [X] T007 [US2] In `api/src/routes/gifs.js`, inside the `POST /gifs/reference` handler (currently lines 118-139): extend the ban-check select at lines 123-124 to add `is_media_allowed`; add the same guard clause before the `Media` row (`media_type: "giphy"`) is created. (Depends on T001.)
- [X] T008 [US2] In `api/src/routes/gifs.js`, inside the `POST /gifs/upload` handler (currently lines 238-316): same guard pattern, extending the ban-check select at lines 251-252, before the `Media`/`UserGif` rows are created. (Same file as T007 — sequential, no `[P]`.)
- [X] T009 [US2] In `api/src/routes/auth.js`, add `mediaAllowed` to the three `req.session.user` object literals: registration (line 170 — `mediaAllowed: true`, matching the `showNsfw`/`showPolitics` defaults already there), login (extend the `select` at line 184 to add `is_media_allowed: true`, and the object at lines 202-208 to add `mediaAllowed: !!user.is_media_allowed`), and password-reset auto-login (extend the `select` at line 337 and the object at line 353 the same way). This value is UI convenience only — the server-side guards in T004-T008 never trust it and always re-check Prisma fresh per request (see `research.md` §2). (Depends on T001.)
- [X] T010 [P] [US2] In `web/context/AuthContext.tsx`, add `mediaAllowed?: boolean` to the session-user interface, alongside the existing `showNsfw?: boolean` / `showPolitics?: boolean` fields (~lines 7-8). (Depends on T009.)
- [X] T011 [P] [US2] In `web/components/ShoutInput.tsx` and the inline comment-compose section of `web/components/ShoutCard.tsx` (around the existing `handleCommentGifSelect`/media-attach UI, ~line 1206), hide or disable the image/video attach control and the GIF-picker entry point when the current user's `mediaAllowed` is `false`. This is a secondary UX guard only — server enforcement (T004-T008) remains authoritative regardless of this UI state. (Depends on T010.)
- [X] T012 [P] [US2] In `web/components/EmojiPicker.tsx` (which wraps `GifPickerSelection` per `web/components/GifPicker.tsx`), disable the GIF search-pick and personal-upload actions when the current user's `mediaAllowed` is `false`; favoriting/browsing may remain enabled since it never attaches media on its own (see `contracts/media-upload-and-gif.md`). (Depends on T010.)
- [X] T013 [US2] Extend `api/tests/integration/shouts.test.js`: a restricted user (`is_media_allowed = false`) submitting `mediaId` or `youtubeUrl` gets `403` with `"Вам запрещено прикреплять медиафайлы"`, no shout and no `Media` row is created; the same user's text-only submission still succeeds. (Depends on T004.)
- [X] T014 [P] [US2] Extend `api/tests/integration/comments.test.js` with equivalent coverage for comment creation. (Depends on T005; different file from T013, parallel.)
- [X] T015 [P] [US2] Extend `api/tests/integration/upload.test.js`: a restricted user's `POST /upload/media` returns `403` and no file is written to `MEDIA_PATH`; the same restricted user's avatar upload still succeeds unaffected. (Depends on T006; parallel.)
- [X] T016 [P] [US2] Extend `api/tests/integration/gifs.test.js`: a restricted user's `POST /gifs/reference` and `POST /gifs/upload` both return `403`; `GET /gifs/search`, `GET /gifs/trending`, `GET`/`POST`/`DELETE /gifs/favorites`, and `GET /gifs/my` all remain unaffected for the same restricted user. (Depends on T007, T008; parallel.)

**Checkpoint**: User Stories 1 and 2 together are fully functional — an admin can restrict a user and that restriction is enforced server-side across every media-attaching entry point, with client-side gating as a secondary guard.

---

## Phase 5: User Story 3 - Restricted user shares a link that would normally preview (Priority: P2)

**Goal**: Links posted by a restricted user never resolve into a rich embed preview — they render as plain text/links — evaluated live against the author's *current* `is_media_allowed` on every view (not frozen at posting time; a later permission change moves old content's embed rendering too, in either direction).

**Independent Test**: With a test user's `is_media_allowed` set to `false`, post content containing a link that would normally generate a rich preview, and confirm it renders unresolved; restore the permission and confirm that same content's link now resolves on the next view.

**Independence note**: Unlike the original design, this story reads only from `User.is_media_allowed` (via the existing feed author-join) — it does not depend on User Story 2's route-handler changes at all, only on the Foundational schema task (T001).

### Implementation for User Story 3

- [X] T017 [US3] In `api/src/helpers/feed.js`'s `enrichFeed()`, extend the existing author-info join that already produces `isBanned` on the DTO (`feed.js:136,169`) to also select `is_media_allowed` and expose it as `isMediaAllowed` on the `user` sub-object of both the `Shout` and `Comment` DTOs. This is a live value reflecting the author's *current* row, not anything stored on the shout/comment itself. (Depends on T001 only.)
- [X] T018 [P] [US3] Add `isMediaAllowed: boolean` to the author/user sub-type used by the `Shout` and `Comment` interfaces in `web/types.ts`. (Depends on T017.)
- [X] T019 [US3] In `web/components/ShoutCard.tsx`, make both `extractEmbeds()` call sites — shout content (currently ~line 1317) and comment content (currently ~line 762) — conditional on the relevant author's `isMediaAllowed` (skip/discard when `false`), so the regex-driven embed family (imgur/twitter/coub/tenor/giphy/steam) is suppressed; the raw link text itself still renders normally. (Depends on T018.)
- [X] T020 [US3] Extend `api/tests/integration/shouts.test.js`: a shout's `GET` response reports `user.isMediaAllowed: false` when its author is currently restricted and `true` otherwise; critically, toggling the author's `is_media_allowed` *after* a shout was created changes what that same, already-existing shout reports on its very next `GET` — confirming the value is live, not frozen at creation time. (Depends on T017.)
- [X] T021 [P] [US3] Extend `api/tests/integration/comments.test.js` with equivalent coverage for comments. (Depends on T017; parallel with T020.)
- [X] T022 [P] [US3] Create `web/tests/unit/ShoutCard.test.tsx` (no prior test file exists for this component — follow the `renderWithProviders`/mocked-context pattern used in `web/tests/unit/ShoutFeed.test.tsx`) asserting: when the author's `isMediaAllowed` is `false`, no embed preview renders for a matching link and the link text still displays; when `true`/absent, embed extraction behaves as it does today; re-rendering with a changed `isMediaAllowed` prop (simulating a fresh fetch after an admin toggle) updates the rendered output accordingly. (Depends on T019.)

**Checkpoint**: All three user stories are independently functional — the full feature (admin control, server-enforced media block, live embed suppression) is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T023 [P] Run all 5 `quickstart.md` scenarios end-to-end manually (admin panel + a restricted test user) per `specs/005-media-posting-restriction/quickstart.md`.
- [X] T024 [P] Manually confirm the Edge Case in spec.md ("restricted user attempts to edit an existing post/comment"): verify `editContentSchema`/`editCommentSchema` (content-only, no `mediaId`) already prevent anyone — restricted or not — from adding/replacing media on edit, so this edge case requires no new code; note the finding in `checklists/requirements.md` if not already captured.
- [X] T025 Review `specs/005-media-posting-restriction/checklists/requirements.md` against the finished implementation and update notes if anything surfaced during implementation that the spec didn't anticipate.
- [ ] T026 [P] Manually confirm Scenario 5 of `quickstart.md` (restriction independent of ban state): a banned-but-media-allowed user is fully blocked from posting (existing ban behavior); a media-restricted-but-unbanned user can post text but not media — the two flags combine correctly in every combination.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — no tasks.
- **Foundational (Phase 2)**: No dependencies — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational (T001) only.
- **User Story 2 (Phase 4)**: Depends on Foundational (T001) only — independently testable of US1's admin-UI work (a restricted state can be set directly in the DB/fixtures for testing), though in practice an admin needs US1's control to set it in production.
- **User Story 3 (Phase 5)**: Depends on Foundational (T001) **only** — it reads the same column directly via `feed.js`, with no dependency on User Story 2's route-handler changes (T004-T008). Fully independent of US2's implementation.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within User Story 1

- T002 and T003 both depend only on T001 and can proceed in parallel (verification vs. test file).

### Within User Story 2

- T004, T005, T006 depend only on T001 and touch different files — parallelizable.
- T007 depends only on T001; T008 depends on T007 (same file, sequential).
- T009 depends on T001 (independent of T004-T008, different file) — parallelizable with them.
- T010 depends on T009; T011 and T012 depend on T010 and touch different files — parallelizable with each other.
- T013 depends on T004; T014 depends on T005; T015 depends on T006; T016 depends on T007 and T008 — all four test tasks touch different files and are parallelizable with each other.

### Within User Story 3

- T017 depends on T001 only.
- T018 depends on T017; T019 depends on T018.
- T020 depends on T017; T021 depends on T017 — different files, parallelizable with each other and with T018.
- T022 depends on T019.

### Parallel Opportunities

- T004, T005, T006 (three different route files) once T001 is done.
- T009 in parallel with T004-T008 (different file).
- T011, T012 in parallel once T010 is done.
- T013, T014, T015, T016 (four different test files) once their respective implementation tasks land.
- T017 (User Story 3) can start immediately once T001 is done, in parallel with all of User Story 2 — they touch entirely different files.
- T020, T021 in parallel once T017 is done.
- T023, T024, T026 (all manual verification) can be done in parallel.

---

## Parallel Example: User Stories 2 and 3 together

```bash
# Once T001 (Foundational) is done, User Story 2's route guards and User Story 3's
# feed-enrichment change can all proceed together — they share no files:
Task: "Add is_media_allowed guard to POST /shouts in api/src/routes/shouts.js"
Task: "Add is_media_allowed guard to POST /shouts/:id/replies in api/src/routes/comments.js"
Task: "Add is_media_allowed guard to POST /upload/media in api/src/routes/upload.js"
Task: "Expose isMediaAllowed on Shout/Comment DTOs in api/src/helpers/feed.js"
```

---

## Implementation Strategy

### MVP Scope: User Stories 1 + 2 together

Unlike a typical single-P1-story MVP, this feature's own priorities mark **both** User Story 1 and User Story 2 as P1 — deliberately, per the spec: the admin control alone (US1) has no safety value without server enforcement (US2), and the enforcement alone (US2) has no operational value without a way to turn it on (US1). Treat Phases 2-4 together as the MVP; User Story 3 (embed suppression, P2) is a meaningful but separable hardening pass that closes an indirect route to displaying media, and — being fully decoupled from US2 now — could even ship in parallel with it.

1. Complete Phase 2: Foundational (T001).
2. Complete Phase 3: User Story 1 (T002-T003).
3. Complete Phase 4: User Story 2 (T004-T016).
4. **STOP and VALIDATE**: Run `quickstart.md` Scenarios 1, 2, 4, 5 — confirm the admin toggle works and is enforced everywhere media can be attached.
5. This is deployable as the MVP — a restricted user can no longer attach media, though their links may still resolve into previews until User Story 3 ships.

### Incremental Delivery

1. Foundational → User Story 1 + User Story 2 (MVP) → validate → deploy/demo.
2. User Story 3 → validate with `quickstart.md` Scenario 3 (including the live-retroactivity check in both directions) → deploy/demo. Can be built in parallel with Story 2 if staffed, since they share no files.
3. Polish (full quickstart pass + edge-case verification + checklist review).

---

## Notes

- `[P]` tasks touch different files with no ordering dependency on each other.
- `[US1]`/`[US2]`/`[US3]` labels map tasks to the spec's three user stories.
- T007 and T008 both touch `api/src/routes/gifs.js` and are intentionally sequential (no `[P]`) to avoid conflicting concurrent edits to the same file.
- The error message `"Вам запрещено прикреплять медиафайлы"` (403) is deliberately identical across all four gated backend entry points (T004, T005, T006, T007/T008) so the frontend can handle the rejection with one shared error-message check.
- User Story 3 (T017-T022) touches none of the same files as User Story 2 (T004-T016) — `feed.js`/`types.ts`/`ShoutCard.tsx`'s embed logic vs. `shouts.js`/`comments.js`/`upload.js`/`gifs.js`/`auth.js`'s write-path guards — so the two stories can be assigned to different people and merged independently.
- Commit after each task or logical group; stop at either checkpoint to validate that story independently before continuing.
