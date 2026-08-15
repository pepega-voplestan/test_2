# Quickstart: Validating Anchor-Based Feed Scroll Restoration

Frontend-only change. No new environment variables, no migrations, no backend
changes to deploy.

## Prerequisites

- Local dev stack running (`cd web && npm run dev`, or `make local` for the
  Dockerized dev environment — see root `CLAUDE.md` Quick Start).
- At least ~30 shouts in the feed (more than one page — `PAGE_SIZE = 25`) so
  scrolling and paging are actually exercised. Seed via normal posting, or an
  existing dev database.
- Two logged-in sessions (or one logged-in + one incognito) to post as a
  second user while the first is "away" — needed for User Story 1.

## Scenario 1 (P1) — Returns to the same shout despite new content appearing

1. As user A, load the feed ("Все" tab), scroll down several screens to a
   specific shout, note it visually.
2. Click that shout's timestamp to open its permalink.
3. As user B (second session), post a new shout.
4. As user A, click "Назад".
5. **Expected**: the shout from step 1 is at the top of the viewport — not
   the new shout from step 3, and not whatever now occupies the old pixel
   offset.

## Scenario 2 (P2) — No visible flash or default position while restoring

1. Repeat Scenario 1's steps 1–2 with browser DevTools' Performance/screen
   recording on, or just watch closely.
2. Click "Назад".
3. **Expected**: no visible jump to the top of the feed at any point. At most,
   a small settling adjustment once the target shout's real content
   (avatar/media) finishes rendering — visibly smaller than the full scroll
   distance, not a full top-then-back jump.

## Scenario 3 (P3) — Graceful fallback when the anchor can't be found

1. As user A, scroll to and open a specific shout (as in Scenario 1).
2. Delete that shout (as its author, or via admin).
3. Click "Назад".
4. **Expected**: lands at the top of the freshest feed content — same as a
   normal fresh visit — no error, no indefinite loading spinner, no blank
   page.

   Alternate version of this scenario (search-limit path instead of
   deletion): scroll extremely deep (well beyond ~200 items / 8 pages) before
   opening a shout, then "Назад" — same expected outcome.

## Scenario 4 — Old saved state doesn't break anything across a deploy

1. In a browser tab already running the OLD (pixel-based) build, scroll the
   feed and navigate into a shout (so the old-shape `feedScrollState` entry
   gets written to `sessionStorage`).
2. Without closing that tab, deploy/reload with the NEW (anchor-based) build.
3. Click "Назад" in that same tab.
4. **Expected**: normal fresh feed load — no crash, no console error, no
   scroll to a nonsensical position (e.g. a huge stale pixel value against a
   short fresh page).

## Also re-verify (regression — carried forward from the shipped pixel-based feature)

- Tab (Все/Популярные) and sort (лайки/комментарии) restore correctly
  alongside the anchor position.
- The "Назад" button still uses real browser back navigation (check
  `history.state` in DevTools shows `{inApp: true}` while on a shout page
  reached via an in-app link).
- A shout permalink opened directly (fresh tab / shared link, no prior feed
  visit) — "Назад" still lands on the feed without error (no anchor to
  restore, since none was ever saved in that tab).

## Automated coverage

Run the frontend suite: `cd web && npx vitest run` — the existing
`web/tests/unit/ShoutFeed.test.tsx` scroll-restore describe block will be
extended for this feature (see tasks.md), not replaced; keep the existing
sessionStorage-isolation `beforeEach` (`sessionStorage.clear()`) that was
already needed once to fix cross-test pollution during the pixel-based work.
