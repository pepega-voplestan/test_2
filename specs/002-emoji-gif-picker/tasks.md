# Tasks: Emoji & GIF Picker

**Input**: Design documents from `specs/002-emoji-gif-picker/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅ | quickstart.md ✅

**Tests**: Integration tests added for the new API routes (finding C1 from /speckit-analyze). Quickstart validation included in Polish phase.

**Organization**: Tasks grouped by user story. Each phase is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (independent files, no blocking dependencies)
- **[Story]**: Maps to user story from spec.md (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database models and shared helpers that every phase depends on.

- [ ] T001 Add `GifFavorite` and `UserGif` models to `api/prisma/schema.prisma`, add back-relations on `User` and `Media`, run `npx prisma migrate dev --name add_gif_favorites_and_user_gifs` from `api/`
- [ ] T002 [P] Add Zod validation schemas to `api/src/helpers/validation.js`: `giphySearchSchema` (q, limit, offset), `gifReferenceSchema` (giphyId, giphyUrl, giphyStill, width, height), `gifFavoriteSchema` (giphyId, giphyUrl), `giphyIdParamSchema`
- [ ] T003 [P] Extend `buildMedia()` in `api/src/helpers/media.js` to handle `media_type === "giphy"` — return `{ type: "giphy", giphyId, url, still, width, height }` from `media_meta` JSON

**Checkpoint**: DB migration applied, schemas defined, media DTO extended. Ready for route + UI work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Giphy proxy routes must exist before any GIF picker UI can function.

**⚠️ CRITICAL**: No user story UI work can begin until this phase is complete.

- [ ] T004 Create `api/src/routes/gifs.js` with `GET /gifs/search` and `GET /gifs/trending` — proxy to Giphy REST API using `GIPHY_API_KEY` env var (return `503 { error: "GIF-сервис недоступен" }` if key absent or Giphy unreachable); apply 5-minute in-memory cache to trending results and a 1-minute TTL in-memory cache for search results keyed on `q+limit+offset` (same pattern as Steam proxy in `api/src/routes/index.js`); validate query params with schemas from T002; mount router in `api/src/routes/index.js` at `/api/v1`

**Checkpoint**: `curl "http://localhost:3000/api/v1/gifs/trending"` returns GIF array. `curl "http://localhost:3000/api/v1/gifs/search?q=cat"` returns results. Foundation ready for all user story phases.

---

## Phase 3: User Story 1 — Search and Insert a GIF (Priority: P1) 🎯 MVP

**Goal**: User can open the GIF tab, search for a GIF, and insert it as the media attachment of a shout or comment.

**Independent Test**: Open emoji picker → GIF tab → type a query → click a GIF → verify it appears as the post media preview; submit the shout and confirm the GIF renders in the feed.

- [ ] T005 [P] [US1] Add `POST /gifs/reference` to `api/src/routes/gifs.js` — validate body with `gifReferenceSchema` from T002; require auth via `requireAuth`; reject banned users; create a `Media` record (`media_type = "giphy"`, `media_url = giphyId`, `media_meta = JSON.stringify({ url, still, width, height })`); return `{ ok: true, mediaId }` — uses Prisma from `api/src/db.js`
- [ ] T006 [P] [US1] Create `web/hooks/useGifPicker.ts` — expose `query`, `setQuery`, `searchResults`, `isSearching`, `searchError`, `trending`, `isTrendingLoading`, `trendingError`; debounce `query` changes by 400 ms before calling `GET /api/v1/gifs/search`; fetch `GET /api/v1/gifs/trending` lazily on first call to `fetchTrending()`; map Giphy API response fields to `GifItem` interface (`id`, `title`, `url`, `still`, `width`, `height`) per `contracts/gif-picker-props.md`
- [ ] T007 [US1] Create `web/components/GifPicker.tsx` — props: `onSelect`, `reducedMotion`, `isAuthenticated`, `mobileReadOnly` (see `contracts/gif-picker-props.md`); render search input (applies `mobileReadOnly`/`onTouchEnd` pattern from `EmojiPicker.tsx`); render GIF grid (`<img src={reducedMotion ? gif.still : gif.url}>` with explicit `width`/`height` attributes); show trending results when query is empty; show skeleton placeholders during load; show Russian error message on failure; include "Powered by GIPHY" attribution text/logo fixed at bottom of GIF tab (required by Giphy ToS); all labels, placeholders, and messages in Russian
- [ ] T008 [US1] Refactor `web/components/EmojiPicker.tsx` to tabbed picker — add tab state ("emoji" | "gif"); render "Эмодзи" and "GIF" tab buttons at top of popup (hide GIF tab when `onSelectGif` prop is absent); add `onSelectGif?: (gif: GifSelection) => void` prop; detect `prefers-reduced-motion` via `window.matchMedia` and pass as `reducedMotion` to `GifPicker`; render `<GifPicker>` (from T007) when GIF tab is active, passing `onSelect={onSelectGif}`, `reducedMotion`, `isAuthenticated`, `mobileReadOnly`; preserve all existing emoji tab behavior unchanged
- [ ] T009 [US1] Update `web/components/ShoutInput.tsx` — add `handleGifSelect(gif: GifSelection)` function: call `POST /api/v1/gifs/reference`, set `mediaId = data.mediaId` and `mediaPreview = gif.url` on success, show Russian error toast on failure; pass `onSelectGif={handleGifSelect}` to `<EmojiPicker>`; extend the existing YouTube-embed blocking logic so that if a YouTube embed is already detected, the GIF tab button is disabled (and vice versa — block YouTube detection when `mediaId` is set)
- [ ] T010 [US1] Update `web/components/ShoutCard.tsx` in two places: (1) comment composer (~line 1673) — add `handleCommentGifSelect` that calls `POST /api/v1/gifs/reference` and sets `replyMediaId`/`replyMediaPreview`, pass `onSelectGif={handleCommentGifSelect}` to `<EmojiPicker size="sm">`; (2) feed media rendering — add `type === "giphy"` case after the existing image/video/youtube branches, render `<img src={reducedMotion ? media.still : media.url}>` with lightbox support (use `media.url` for full-res), respect `prefers-reduced-motion` via the same `window.matchMedia` call pattern used in T008

**Checkpoint**: Full GIF search-and-insert flow works for shouts and comments. Giphy GIFs render correctly in the feed. Single-media constraint enforced. Emoji tab unchanged.

---

## Phase 4: User Story 2 — Browse GIFs by Category / Trending (Priority: P2)

**Goal**: Default view of the GIF tab shows trending GIFs organized into scrollable Russian-labeled category sections.

**Independent Test**: Open the GIF tab with an empty search field — trending GIFs appear in labeled sections with Russian headings; tapping a section label scrolls to it; tapping a GIF inserts it.

- [ ] T011 [US2] Update `web/components/GifPicker.tsx` (created in T007) — when `query` is empty and trending results are loaded, group GIFs into category sections with Russian heading labels (e.g. "Популярное", "Реакции", "Смешное"); render a horizontal category quick-nav strip above the grid (mirroring the emoji group nav in `EmojiPicker.tsx`) that smooth-scrolls to each section; maintain the existing search results view when `query` is non-empty

**Checkpoint**: GIF tab default view shows categorized trending GIFs with Russian headings. Search still works. Emoji tab unchanged.

---

## Phase 5: User Story 3 — Save and Access GIF Favorites (Priority: P3)

**Goal**: Authenticated users can mark any GIF as a favorite, view saved favorites in the picker, and remove them — with immediate optimistic UI and rollback on failure.

**Independent Test**: Favorite a GIF from search/trending, close and reopen the picker → GIF appears in Избранное; un-favorite it → GIF disappears immediately; force a network error → the icon reverts.

- [ ] T012 [US3] Add `GET /gifs/favorites`, `POST /gifs/favorites`, `DELETE /gifs/favorites/:giphyId` to `api/src/routes/gifs.js` — all require `requireAuth`; `POST` uses `upsert` on `(user_id, giphy_id)` unique constraint (idempotent); `POST` checks count ≤ 500 before insert (return `400 { error: "Достигнут лимит избранного (500)" }` if exceeded); `DELETE` hard-deletes the `GifFavorite` row; return `404` if not found; validate params with Zod schemas from T002
- [ ] T013 [P] [US3] Update `web/hooks/useGifPicker.ts` — add `favorites: FavoriteItem[]`, `isFavoritesLoading`, `isFavorite(giphyId)`, `toggleFavorite(gif)` (optimistic: update local state first, call API, rollback on error), `fetchFavorites()` (lazy — called on first Favorites tab open); all error strings in Russian
- [ ] T014 [US3] Update `web/components/GifPicker.tsx` — add "Избранное" section/sub-tab (visible to authenticated users only; show login prompt in Russian for anonymous users); render star/bookmark icon overlay on each GIF thumbnail in all views (auth-only); filled icon = already favorited (from `isFavorite()`); icon tap calls `toggleFavorite()` without closing picker; Избранное section shows `favorites` from hook; show Russian empty-state message ("Нажмите ★ на любом GIF, чтобы добавить в избранное") when list is empty

**Checkpoint**: Favorites add/remove works with optimistic UI and rollback. Favorites section loads correct list. Anonymous users see auth prompt, not the icon.

---

## Phase 6: User Story 4 — Upload and Reuse Personal GIFs (Priority: P4)

**Goal**: Authenticated users can upload their own GIF files to a personal library, insert them in future posts, and remove them — all within the GIF picker.

**Independent Test**: Upload a valid .gif file → it appears in Мои GIF → insert it into a shout → delete it from the library → it disappears but the posted shout still shows the GIF.

- [ ] T015 [US4] Add `GET /gifs/my`, `POST /gifs/upload`, `DELETE /gifs/my/:id` to `api/src/routes/gifs.js` — all require `requireAuth`; `POST /gifs/upload` applies `multer` with GIF-only `fileFilter` (`image/gif` MIME only, return `400 { error: "Допустимый формат: GIF" }` for others) and `10 MB` size limit; reuse the animated-GIF branch of the existing Sharp pipeline in `api/src/routes/upload.js` (store `original.gif` + generate WebP thumbnails); count active `UserGif` entries (is_deleted=0) before insert and return `400 { error: "Достигнут лимит личных GIF (100)" }` at cap; create `Media` record then `UserGif` record in a single Prisma transaction; `DELETE /gifs/my/:id` sets `UserGif.is_deleted = 1` (soft-delete); `GET /gifs/my` returns active entries ordered by `created_at DESC`
- [ ] T016 [P] [US4] Update `web/hooks/useGifPicker.ts` — add `myGifs: MyGifItem[]`, `isMyGifsLoading`, `uploadError`, `isUploading`, `uploadGif(file: File)` (POST multipart, prepends result to `myGifs` on success), `deleteMyGif(id)` (optimistic remove from list, restore on error), `fetchMyGifs()` (lazy); client-side pre-flight: reject files where `file.type !== "image/gif"` or file size exceeds the limit — import `MEDIA_MAX_BYTES` from `api/src/helpers/media.js` (or a shared constant) rather than hardcoding `10 * 1024 * 1024`, so both layers stay in sync if the cap ever changes
- [ ] T017 [US4] Update `web/components/GifPicker.tsx` — add "Мои GIF" section/sub-tab (auth-only; show Russian login prompt for anonymous users); render upload button that opens `<input type="file" accept="image/gif">` (no `capture` attribute — required for iOS Files app compatibility); show upload progress indicator while `isUploading`; show `uploadError` in Russian; render `myGifs` grid with a delete icon (❌) on each thumbnail; delete icon calls `deleteMyGif()` with optimistic removal; show Russian empty-state message when library is empty

**Checkpoint**: Personal GIF upload, display, insert, and soft-delete all work. Cap enforced server-side. Deleted GIFs disappear from picker; previously posted GIFs remain visible in feed.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Mobile/iOS hardening, touch accessibility, and end-to-end validation.

- [ ] T018 [P] Polish touch targets and mobile layout in `web/components/GifPicker.tsx` and `web/components/EmojiPicker.tsx` — verify all interactive elements (GIF thumbnails, tab buttons, star icons, upload button, delete icons) have `min-w-[44px] min-h-[44px]` (or equivalent tap area); confirm no horizontal overflow at 320px viewport width; verify GIF search input does not get fully hidden when the mobile soft keyboard is open (use `max-height` + `overflow-y-auto` on the grid to leave the input and tab bar visible)
- [ ] T019 [P] Write integration tests for all `/api/v1/gifs/*` endpoints in `api/tests/integration/gifs.test.js` — follow the patterns in `api/tests/integration/events.test.js`; cover: search proxy (200, 503 when key absent), trending (200, cache hit), reference creation (auth required, returns mediaId), favorites CRUD (add idempotent, remove 404 on missing, cap at 500), upload (GIF accepted, non-GIF rejected, size limit enforced, cap at 100, auth required), my-GIFs list + soft-delete; test both authenticated and unauthenticated states for `POST /gifs/upload` to verify rate-limit fallback (constitution quality gate D1)
- [ ] T020 Run all `quickstart.md` validation scenarios end-to-end (both API smoke tests and manual UI flows); fix any discovered issues in `api/src/routes/gifs.js`, `web/components/GifPicker.tsx`, or `web/components/EmojiPicker.tsx`; verify regression checklist (emoji tab, image upload, YouTube detection, comment media, single-media constraint)

**Checkpoint**: All quickstart scenarios pass. Picker is usable on narrow mobile viewports. Emoji tab and existing media flows unaffected.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T002 and T003 are independent of T001 after the schema intent is known.
- **Foundational (Phase 2)**: T004 depends on T001 (Prisma client regenerated) and T002 (Zod schemas). **Blocks all user story phases.**
- **US1 (Phase 3)**: Depends on Phase 1 + Phase 2. T005 depends on T003 (buildMedia). T006 and T007/T008 can start once T004 is done. T009 depends on T008. T010 depends on T008.
- **US2 (Phase 4)**: Depends on T007 (GifPicker.tsx exists). Can start immediately after T007 is complete.
- **US3 (Phase 5)**: T012 (API) can start any time after Phase 1. T013 depends on T006 (hook exists). T014 depends on T007.
- **US4 (Phase 6)**: T015 can start any time after Phase 1. T016 depends on T006. T017 depends on T007.
- **Polish (Phase 7)**: Depends on all US phases complete. T019 (integration tests) can be written incrementally alongside US phases; T020 (quickstart validation) runs last.

### User Story Dependencies

- **US1 (P1)**: Requires Phase 2 complete. Foundational for all other stories (establishes EmojiPicker tab structure and GifPicker skeleton).
- **US2 (P2)**: Requires T007 (GifPicker.tsx) from US1. Adds category nav to existing component.
- **US3 (P3)**: API endpoints (T012) independent of US1/US2. UI (T013, T014) requires T006/T007 from US1.
- **US4 (P4)**: API endpoints (T015) independent of US1/US2/US3. UI (T016, T017) requires T006/T007 from US1.

### Within Each User Story

- Models/schemas → API routes → hook state → component UI → caller integration
- T005/T006 [P] within US1 can start in parallel
- T013/T016 [P] within US3/US4 can be worked in parallel once the hook file exists

### Parallel Opportunities per Story

**Phase 1 (Setup)**
```
Parallel: T002 (validation.js) + T003 (media.js) while T001 (prisma migrate) runs
```

**Phase 3 (US1)**
```
Parallel after T004: T005 (gifs.js reference endpoint) + T006 (useGifPicker hook)
Then: T007 (GifPicker.tsx) after T006
Then: T008 (EmojiPicker.tsx) after T007
Then parallel: T009 (ShoutInput.tsx) + T010 (ShoutCard.tsx) after T008
```

**Phase 5 + 6 (US3 + US4 API)**
```
Parallel: T012 (favorites API) + T015 (upload/my API) — both extend gifs.js but are distinct route blocks
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004) — **critical blocker**
3. Complete Phase 3: US1 (T005–T010)
4. **STOP and VALIDATE**: Run quickstart.md Story 1 scenarios — GIF search and insert working in shouts and comments (T020)
5. Demo / deploy MVP if ready

### Incremental Delivery

1. Setup + Foundational → Giphy proxy live
2. US1 → GIF search + insert → **MVP demo**
3. US2 → Trending categories → enhanced browse experience
4. US3 → Favorites → power-user feature
5. US4 → Personal uploads → differentiation feature
6. Polish → production-ready

### Parallel Team Strategy

With two developers after Phase 2 is complete:
- **Dev A**: US1 frontend (T006–T010)
- **Dev B**: US1 backend (T005) → US3 backend (T012) → US4 backend (T015)

---

## Notes

- [P] = independent files, safe to run in parallel
- All user-facing strings must be in Russian (enforced per constitution Principle II)
- `UserGif` delete = soft-delete (is_deleted=1); `GifFavorite` delete = hard-delete — see data-model.md
- The `mobileReadOnly` search-input pattern from `EmojiPicker.tsx` must be replicated in `GifPicker.tsx`
- No `capture` attribute on the GIF file input — required for iOS Files app compatibility
- Giphy attribution ("Powered by GIPHY") is a ToS requirement, not optional polish — included in T007
- Commit after each task or logical group; stop at any checkpoint to validate the story independently
