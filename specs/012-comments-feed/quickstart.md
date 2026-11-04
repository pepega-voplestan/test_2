# Quickstart: Live Comments Feed Sidebar

**Feature**: `012-comments-feed`

## Local run

```sh
make install
cd web && npm run dev
# or: make local → http://localhost:3006
```

Sign in with a real session (SSE and hydrate require auth cookies).

## Smoke checklist

1. **Toggle** — Header shows comments icon before the bell; click opens sidebar; click again closes.
2. **Hydrate** — With recent comments on the «new» feed, opening the panel shows rows (or empty copy if none).
3. **Live** — Post a comment from another browser/session; row appears at top without reload.
4. **Badge** — Close panel, wait for a new comment, see badge; open panel → badge clears.
5. **Media** — A comment/shout with image/GIF/video/YouTube shows «[медиа]» only (no thumbnail).
6. **Ignore** — Ignore an author; their sidebar rows show soft-hide overlay; click to reveal.
7. **Jump** — Click comment text → `/shout/…?comment=…` and scroll to `#comment-…`.
8. **Pinned** — Collapse the pinned shout, jump to a comment on it → pin expands and comment is visible.
9. **Mobile** — DevTools ≤767px width: panel is full-bleed overlay; navigating from a row closes it.
10. **Guest** — Log out; comments icon is gone.

## Automated

```sh
cd web && npm run test -- CommentFeed
```
