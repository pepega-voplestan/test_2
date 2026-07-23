# Contract: AdminJS `User` resource — `is_media_allowed` property

Extends the existing `User` resource config in `api/src/admin.js:78-199`. No new admin route — AdminJS auto-generates the edit form field from the Prisma schema change in `data-model.md`.

## Property addition

`is_media_allowed` becomes a visible, editable property on the `User` resource list/show/edit views. Because it's a genuine Prisma `Boolean` (not the `Int` 0/1 convention `is_banned` uses), AdminJS renders it as an actual checkbox — no custom component or explicit `type` override needed, this follows automatically from the column's Prisma type.

## Behavior on edit

- No `edit.before` / `edit.after` hooks are added for this property (unlike `is_banned`, which triggers bulk hide/restore of the user's shouts/comments on transition).
- Saving a new value takes effect for that user's very next request to any of the gated routes in `shout-comment-creation.md` / `media-upload-and-gif.md` — no cache invalidation needed, because those routes always re-fetch `is_media_allowed` fresh from Prisma per request (see `research.md` §2).
- Setting `is_media_allowed` does not touch any existing `Shout`, `Comment`, or `Media` row — no bulk update runs, matching spec FR-014. *(Revised 2026-07-23: an earlier design also gave this flag a retroactive effect on link-preview rendering of old content via a live read; that mechanism was removed — see `embed-resolution-dto.md`. This flag no longer has any retroactive effect of any kind — it only ever governs new uploads going forward.)*

## Non-goals

- No new admin action/button (e.g. no dedicated "restrict media" bulk action) — a direct field edit on the user record is sufficient, matching the spec's "administrator can revoke... from the admin panel" requirement without inventing new admin UX beyond what `is_banned` already establishes as the pattern for a per-user account-state flag.
