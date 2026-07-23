# Phase 0 Research: Per-User Media Posting Restriction

All items below were resolved by reading the existing codebase; no `NEEDS CLARIFICATION` markers remain in the Technical Context.

**Revision note (2026-07-23)**: Items 4 and 5 below describe the *original* (2026-07-18/19) design, which gated every `mediaId`/`youtubeUrl` attach and suppressed link-preview embeds live. Per explicit user direction, scope was narrowed to physically-stored media only (`PHYSICAL_MEDIA_TYPES` in `helpers/media.js` — `image`/`video`); `POST /gifs/reference`, `youtubeUrl`, YouTube auto-detect, and all link-preview embeds are no longer gated at all. See `data-model.md`'s "Scope of enforcement" section and `spec.md`'s Clarifications (Session 2026-07-23) for the current, authoritative behavior. Items 1-3, 6-7 below are unaffected by this revision.

## 1. Where does the restriction live in the data model?

**Decision**: Add `is_media_allowed Boolean @default(true)` to the `User` model in `api/prisma/schema.prisma`.

**Rationale**: Per explicit user direction (`/speckit-clarify` session, 2026-07-18), this flag is a native Prisma `Boolean` (`true`/`false`), not the `Int` 0/1 convention the codebase's other account-state flags (`is_banned`, `is_deleted`, `show_nsfw`, `show_politics`) use. This is a deliberate, acknowledged deviation from that convention, scoped to this one new column — it is not a mandate to migrate the existing flags. It defaults to `true` (allowed) per spec FR-002, the only account-state flag on `User` that defaults to the "unrestricted" value.

**Alternatives considered**: Matching the existing `Int @default(0/1)` convention (the original design in this document, before the `/speckit-clarify` correction — rejected per explicit user instruction in favor of a real boolean type and the `is_`-prefixed name). A separate `UserRestriction` join table (rejected — no other per-user capability flag in this schema uses a side table).

## 2. Where is the flag checked at request time?

**Decision**: Merge the check into the existing `is_banned` lookup pattern already present at every media-creating entry point, by adding `is_media_allowed: true` to the same `select` and adding one more guard clause immediately after the existing ban check. Do **not** cache `is_media_allowed` on `req.session.user` for enforcement purposes.

**Rationale**: This codebase deliberately never trusts `req.session.user` for account-state flags — `is_banned` itself is excluded from the session object and re-fetched fresh from Prisma on every protected route (`shouts.js:170`, `comments.js:16`, `upload.js:46`, `gifs.js:123/167/251`), specifically so a state change (e.g. an admin action) takes effect on the user's very next request without requiring re-login. Reusing that exact pattern gives spec FR-004 ("takes effect immediately... without logout") for free, with zero new infrastructure, and costs no extra DB round-trip since the ban-check query already runs at each of these call sites. (A UI-only, explicitly-non-authoritative copy of the flag is separately added to the session for client-side gating — see item 6.)

**Alternatives considered**: Caching the flag on `req.session.user` as the enforcement source of truth (rejected — breaks FR-004; a currently-logged-in restricted user's session wouldn't reflect an admin's change until they re-authenticate, which is exactly the staleness bug the codebase's existing ban-check pattern already avoids). A dedicated auth middleware that loads the flag once per request (rejected — would need to run before every route that might attach media, which is a broader/less consistent surface than reusing the four existing per-route ban-check call sites).

## 3. Request-level rejection shape

**Decision**: When a restricted user's request includes a media attachment attempt (`mediaId` and/or `youtubeUrl` present, or a GIF-attach/upload endpoint hit directly), reject the **entire request** with `403` and a Russian error message, before any DB media validation runs — mirroring the existing `if (banCheck?.is_banned) return res.status(403).json({ error: "..." })` pattern byte-for-byte. Do not silently drop the media and continue with text-only creation.

**Rationale**: Matches the codebase's existing all-or-nothing validation style (see the adjacent `"Нужен текст или медиа"` / `"Можно прикрепить или изображение, или видео"` checks in the same routes) and satisfies spec acceptance scenario US2.1 ("submission is rejected... no media is stored or attached"). Because the check only fires when media parameters are actually present in the request, it never touches a text-only submission — satisfying FR-010 and FR-013 without any additional branching logic.

**Alternatives considered**: Silently stripping `mediaId`/`youtubeUrl` server-side and creating a text-only post (rejected — contradicts the acceptance scenario's "submission is rejected," and would surprise a user who reasonably expects a signal if their attached image never actually posted).

**Error copy**: `"Вам запрещено прикреплять медиафайлы"` (403), fitting the existing terse imperative style of `"Вы забанены!"` and the other route-level Russian error strings.

## 4. Enforcement surface area (every entry point that creates a `media_id` or converts a link into one)

**Decision**: Gate all four server-side entry points that can result in a shout/comment carrying media:

| Entry point | File:line (pre-change) | What's gated |
|---|---|---|
| Shout creation | `api/src/routes/shouts.js:169-244` | `mediaId` param + YouTube-URL auto-conversion, before the `visibility_tag` strip at line 244 |
| Comment creation | `api/src/routes/comments.js:15-103` | `mediaId` param + YouTube-URL auto-conversion |
| Direct media upload | `api/src/routes/upload.js:31-116` (`POST /upload/media`) | The whole upload — merged into the existing `banCheck` select at line 46 |
| GIF pick / personal GIF upload | `api/src/routes/gifs.js` — `POST /gifs/reference` (118-139), `POST /gifs/upload` (238-316) | Both `Media`-row-creating GIF actions |

**Rationale**: These are the only four places in the codebase that create a `Media` row or set `finalMediaId` on a shout/comment (confirmed by tracing every write to the `media` table and every `mediaId`/`youtubeUrl` consumer). Avatar upload (`upload.js:227+`) and GIF favoriting/search/browse (`gifs.js:68-115, 142-211`) never create post/comment-attachable media and are explicitly out of scope per spec Assumptions — left ungated.

**Alternatives considered**: A single shared Express middleware applied broadly (rejected — the four routes have different auth/session-lookup shapes already, e.g. multer's file-parse-then-check ordering in `upload.js`; retrofitting a generic middleware would fight the existing per-route ban-check idiom rather than extend it).

## 5. Blocking embed/link-preview resolution

**Decision**: The imgur/twitter/coub/tenor/giphy/steam embed family in `web/components/ShoutCard.tsx`'s `extractEmbeds()` has **no server-side resolution step** — it is a pure client-side regex pass over the raw `content` string already returned by the API, with no oEmbed proxy or equivalent route on the backend. There is a single source of truth for this — the author's *current* `User.is_media_allowed` — with **no separate per-content column or snapshot**. The author's current flag is joined onto the `Shout`/`Comment` DTO (reusing the existing author-info join `enrichFeed()` already performs, alongside the existing `isBanned`-on-author field at `feed.js:136,169`), exposed as e.g. `shout.user.isMediaAllowed` in `web/types.ts`, and `ShoutCard.tsx` skips calling `extractEmbeds()` (or discards its result) at both call sites (comment content ~line 762, shout content ~line 1317) whenever the author's `isMediaAllowed` is `false`.

**Rationale**: Per explicit user direction (`/speckit-clarify` session, 2026-07-18): a single flag drives both new-media blocking and embed resolution, evaluated live at view time — there is no need for a second column. This *deliberately* makes embed resolution retroactive in both directions (spec User Story 3, Scenarios 3-4): restoring a restricted author's permission makes their older links start resolving again on next view, and restricting a previously-unrestricted author makes their older links stop resolving on next view. This is a conscious simplification over the original (rejected) design, which used a frozen per-row `embeds_blocked` snapshot specifically to avoid this retroactivity — the user judged that guarantee not worth a second column, since the embed family is cosmetic (view-time-only, no real file) unlike actual attached media (real files, governed separately by FR-014 and never affected by this live check).

The YouTube case is different and needs no embed-blocking mechanism at all: a YouTube link becomes a real `Media` row via the server-side URL-to-media auto-conversion already covered by item 4 above, so simply not creating that `Media` row for a restricted user (leaving the raw URL untouched in `content`) is sufficient — `extractEmbeds()` has no YouTube handling to begin with (YouTube goes through the `Media`/`ShoutMedia` DTO path, not the regex-embed path), and once a YouTube `Media` row exists it behaves exactly like any other attached media (FR-014 — never retroactively removed).

**Alternatives considered**: A frozen per-row `embeds_blocked Int`/`Boolean` snapshot column on `Shout`/`Comment`, set at creation time from the author's permission at that moment (this was the original Phase 1 design — superseded by explicit user direction to use a single live-checked flag instead, accepting retroactivity as the tradeoff for not needing a second column and not needing to touch the creation-time write path at all for this purpose). Stripping/mangling the matched URLs out of `content` at save time (rejected — the spec explicitly requires the link to "remain a plain, clickable link," not be destroyed or altered).

## 6. Admin panel UI

**Decision**: Add `is_media_allowed` as a plain property on the existing `User` AdminJS resource (`api/src/admin.js:78-199`), with no `edit.before`/`edit.after` side-effect hooks. Separately, expose a UI-only copy of the flag on the frontend session/user object (`req.session.user.mediaAllowed` in `api/src/routes/auth.js`, mirroring the existing `showNsfw`/`showPolitics` fields) so the composer and GIF picker can hide/disable their media controls — this copy is never treated as authoritative by any server route.

**Rationale**: Unlike `is_banned`, which triggers bulk-hide/bulk-restore side effects on the user's existing shouts/comments (`admin.js:144-196`), spec FR-014 explicitly requires already-existing *attached media* to be left untouched when this flag changes in either direction — so no analogous before/after transition logic is needed. Because the new column is a genuine Prisma `Boolean` (see item 1), AdminJS renders it as an actual checkbox, unlike `is_banned`'s plain-number-input rendering — a natural, no-extra-config consequence of the type choice, not a separate feature.

**Alternatives considered**: Also adding `edit.before`/`edit.after` hooks (rejected — no side effects are needed per FR-014, unlike `is_banned`).

## 7. Validation layer placement

**Decision**: Implement the `is_media_allowed` check as an imperative guard clause in each route handler (same shape as the existing `banCheck` conditionals), not as a Zod refinement in `api/src/helpers/validation.js`.

**Rationale**: Every Zod schema touched by this feature (`shoutSchema`, `commentSchema`, `gifReferenceSchema`, etc.) is a pure structural/shape validator with no DB or session access, and the codebase never gives Zod schemas that kind of access — the ban check, which is the closest existing analog, is likewise done imperatively after `safeParse` succeeds, not inside the schema. Following the same layering keeps validated shape ("is this a well-formed request") and authorization ("is this user currently allowed to do this") as clearly separate concerns, matching Constitution IV's requirement that backend validation be the authoritative guard without conflating it with data-shape validation.

**Alternatives considered**: A custom Zod `.refine()` with async DB access (rejected — no precedent in this codebase, and would require threading `prisma`/session into schema construction per-request, adding complexity the existing routes don't already pay for).
