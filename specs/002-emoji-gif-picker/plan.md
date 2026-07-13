# Implementation Plan: Emoji & GIF Picker

**Branch**: `002-emoji-gif-picker` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-emoji-gif-picker/spec.md`

## Summary

Extend the existing `EmojiPicker.tsx` component into a tabbed picker that adds a GIF tab alongside the emoji tab. The GIF tab supports Giphy search and trending browse (proxied server-side), a Favorites library (per-user Giphy references stored in DB), and a personal uploaded GIF library (re-using the existing media upload pipeline). GIF attachments to posts/comments follow the same single-media path as images — they are stored as `Media` records with `media_type = "giphy"` (for Giphy GIFs) or `media_type = "image"` (for uploaded GIFs). New Prisma models `GifFavorite` and `UserGif` are added; three new route modules cover Giphy proxy, favorites CRUD, and user GIF library management.

## Technical Context

**Language/Version**: Node.js 20 / TypeScript 5 (React 18 frontend) + JavaScript (Express backend)

**Primary Dependencies**: React 18, Vite, Tailwind CSS (frontend); Express, Prisma, Multer, Sharp (backend); Giphy REST API (external)

**Storage**: PostgreSQL (via Prisma) for `GifFavorite` and `UserGif` records; existing on-disk `MEDIA_PATH` volume for uploaded GIF files (same as shout images)

**Testing**: Vitest (API unit + integration); Vitest + React Testing Library (web); existing `api/tests/` patterns

**Target Platform**: Web (desktop + mobile); iOS 16+ Safari; PWA

**Project Type**: Full-stack web application (Node.js/Express API + React SPA)

**Performance Goals**: GIF search results within 2 s on standard mobile connection; favorites/library load within 1 s; favoriting UI feedback within 100 ms

**Constraints**: 10 MB file-size cap (matches `MEDIA_MAX_BYTES`); only `image/gif` MIME accepted for personal uploads; all UI strings in Russian; Giphy API key server-side only; single-media-per-post rule enforced at both layers

**Scale/Scope**: Per-user GIF favorites and library; proxy endpoints are stateless (Giphy responses cached short-term in memory)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Session-Based Authentication Only | ✅ Pass | All GIF library and favorites endpoints gated by `requireAuth`; Giphy proxy accessible to anonymous users for browse/search only (no auth state stored) |
| II. Russian-Language UI Integrity | ✅ Pass | All new UI text (tabs, empty states, error messages, section headings) written in Russian with correct declensions |
| III. Soft-Delete & Data Preservation | ✅ Pass | `UserGif.is_deleted` used to hide personal GIFs from picker without deleting the underlying `Media` record; `GifFavorite` rows are hard-deleted on un-favorite (junction record only, no user-generated content to preserve — same pattern as `ShoutLike`) |
| IV. Validated, Prisma-Mediated Data Access | ✅ Pass | All new routes use Zod schemas in `api/src/helpers/validation.js`; all DB access through Prisma |
| V. Optimistic UI with Guaranteed Rollback | ✅ Pass | Favorite/un-favorite and personal GIF delete are optimistic with rollback on server error |

Domain constraints:
- Single media per post/comment: GIF selection replaces any existing image attachment; UI blocks GIF selection when a YouTube embed is active — matches existing `hasMedia` guard in `ShoutInput.tsx`
- SSE provider order: no SSE changes in this feature
- Admin safety: no changes to `admin.js`

**Constitution re-check post-design**: See research.md § Design Decisions.

## Project Structure

### Documentation (this feature)

```text
specs/002-emoji-gif-picker/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── gifs-api.md      # Phase 1 output — new /api/v1/gifs/* endpoints
│   └── gif-picker-props.md  # Phase 1 output — GifPicker component contract
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
api/
├── prisma/
│   └── schema.prisma           # + GifFavorite, UserGif models
├── src/
│   ├── helpers/
│   │   ├── media.js            # + GIF_ALLOWED_MIME, buildGiphyMedia()
│   │   └── validation.js       # + gifFavoriteSchema, userGifSchema, giphySearchSchema
│   └── routes/
│       ├── index.js            # + mount gifsRouter
│       └── gifs.js             # NEW — Giphy proxy + favorites + user library
└── tests/
    ├── unit/
    │   └── gifs.test.js        # NEW — unit tests for gifs route helpers
    └── integration/
        └── gifs.test.js        # NEW — integration tests for /api/v1/gifs/* endpoints

web/
├── components/
│   ├── EmojiPicker.tsx         # Refactored: tabbed (Emojis | GIFs), accepts onSelectGif prop
│   └── GifPicker.tsx           # NEW — GIF tab content: search, trending, favorites, my GIFs, upload
├── hooks/
│   └── useGifPicker.ts         # NEW — GIF state management (search, favorites, library, upload)
└── context/
    └── (no new contexts needed)
```

**Structure Decision**: Web application (Option 2 variant). Backend changes are additive (new route module + 2 DB models + helpers). Frontend refactors `EmojiPicker.tsx` to a tabbed host and extracts GIF content into a new `GifPicker.tsx` component backed by a `useGifPicker` hook.

## Complexity Tracking

> No constitution principle violations. One sanctioned exception to Principle III documented below.

| Exception | Justification | Simpler Alternative Rejected Because |
|-----------|--------------|-------------------------------------|
| `GifFavorite` rows hard-deleted on un-favorite (Principle III permits hard-delete only for notifications) | `GifFavorite` is a pure preference junction record with no user-authored content — it holds only a Giphy CDN URL snapshot. The GIF itself lives on Giphy's CDN and is unaffected. This is the same precedent as `ShoutLike` / `CommentLike`, which also cascade-delete. Soft-deleting would add an `is_deleted` column with zero benefit (no content to recover, no referential integrity to maintain). | Soft-delete would add schema complexity (migration, query filters) for a record whose removal is a user preference action, not content moderation. |
