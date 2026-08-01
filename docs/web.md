# Web Frontend Reference

## Repository Structure (web/)

```
web/
├── components/
│   ├── Header.tsx              # Auth, navigation, theme toggle, search (auth-only), notification dropdown; logo hides on mobile while search open
│   ├── AuthModal.tsx           # Login/register/password-reset modal (multi-step, email verification)
│   ├── ShoutFeed.tsx           # Feed: new/popular/announcements tabs, SSE updates; popular has dual sort
│   ├── ShoutInput.tsx          # Composer: gallery (up to 5 images via PendingMediaStrip), emoji/GIF, polls, drag-drop, Ctrl+Enter; spoiler/nsfw require media
│   ├── ShoutCard.tsx           # Shout display: comments, likes, delete, inline edit (60s window with countdown); inline embeds; collapsible pinned shout (eye icon, localStorage); reply composer mirrors ShoutInput's media handling via useMediaAttachments
│   ├── ShoutPage.tsx           # Single shout detail view (#/shout/:id)
│   ├── MentionInput.tsx        # contenteditable composer with @mention autocomplete; ref handle: clear/focus/scrollIntoView/insertText/insertMention/wrapSpoiler/populate
│   ├── NotificationDropdown.tsx # Bell + unread badge + hover-to-read list + infinite scroll
│   ├── SearchDropdown.tsx      # Search pill in header: user/shout search via pg_trgm, backdrop close, scroll lock; hidden for guests
│   ├── ProfilePage.tsx         # Profile view/edit + social links
│   ├── ProfileSocials.tsx      # Social icons grid (copy-to-clipboard) + modal editor
│   ├── AvatarUpload.tsx        # Drag-drop avatar upload with preview
│   ├── EmojiPicker.tsx         # 500+ emojis, 13 categories, Russian+English search, sticky headers; GIF tab embeds GifPicker when onSelectGif is passed
│   ├── GifPicker.tsx           # Giphy search/trending + favorites + own uploaded GIFs ("Мои GIF"); tab inside EmojiPicker, both composers
│   ├── PollEditor.tsx          # Poll creation: 2-7 options, multi-select toggle, validation
│   ├── PollBlock.tsx           # Poll display/voting: progress bars, vote counts, optimistic updates
│   ├── GalleryCarousel.tsx     # Published gallery viewer (2+ images): one item at a time, pointer-swipe with finger-tracking drag, looping arrows (hidden on coarse-pointer/touch devices), position indicator; renders null for 0-1 items (single-image path handles that)
│   ├── PendingMediaStrip.tsx   # Composer preview strip for not-yet-uploaded gallery items: 80px tiles, per-item remove (pointer-based tap-vs-scroll gesture detection), click-to-Lightbox
│   └── Lightbox.tsx            # Fullscreen image: drag-dismiss, pinch/scroll zoom, pan, scroll lock
├── context/
│   ├── AuthContext.tsx         # useAuth()
│   ├── ThemeContext.tsx        # useTheme()
│   ├── SSEContext.tsx          # Single shared EventSource (authenticated only); subscribe(event, handler) pattern
│   ├── NotificationsContext.tsx # useNotifications()
│   ├── ContentPreferencesContext.tsx # useContentPreferences()
│   └── IgnoredUsersContext.tsx # useIgnoredUsers()
├── hooks/
│   ├── useRoute.ts             # Hash-based routing
│   ├── useSSE.ts               # Thin wrapper around SSEContext.subscribe
│   ├── useScrollLock.ts        # Scroll lock utility (used by Lightbox, Header logout dialog, SearchDropdown)
│   ├── useMentionUsers.ts      # Module-level singleton cache for mention list
│   ├── useGifPicker.ts         # Giphy search/trending/favorites/own-GIF state for GifPicker.tsx
│   └── useMediaAttachments.ts  # Shared pending-gallery state for both composers (feature 006): addFiles/addExisting/removeItem/submit/clear, 5-item cap, image/GIF/video exclusivity; upload deferred to submit(), atomic (all-or-nothing mediaIds)
├── tests/
│   ├── setup.ts                # DOM mocks (matchMedia, scrollTo)
│   ├── helpers.tsx             # renderWithProviders()
│   └── unit/                   # effectiveLength, plural, GalleryCarousel, Lightbox, PendingMediaStrip, useMediaAttachments, composerParity, ShoutFeed, ShoutPage
├── public/                     # favicon.svg, manifest.json, robots.txt, sitemap.xml, social icons (steam.svg, xbox.svg, playstation.svg, epicgames.png, boosty.png, retroachievements.png, battlenet.webp, exophase-com-icon.png, backloggd-icon-filled-256.webp, myshows.png)
├── App.tsx, index.tsx, types.ts, index.html
├── vite.config.ts              # Dev proxy: /api and /media → localhost:3000
└── vitest.config.ts            # jsdom env, @testing-library, 10s test / 15s hook timeout
```

## Frontend Code Conventions

- Functional components, TypeScript strict; source directly under `web/` (no `src/` subdirectory)
- Context hooks: `useAuth()`, `useTheme()`, `useSSEContext()` / `useSSE(listeners)`, `useNotifications()`, `useContentPreferences()`, `useIgnoredUsers()`
- `useIgnoredUsers()` provides: `ignoredUserIds`, `isIgnored()`, `addIgnoredUser()`, `removeIgnoredUser()`
- Auth flow: 2-step registration (send code → verify); password reset (send code → verify → new password)
- Hash routing via `useRoute.ts`: `#/` (feed), `#/profile/:id`, `#/shout/:id`
- Tailwind via CDN; theme tokens `th-*` classes backed by CSS vars `--th-*`; dark mode via `.dark` on `<html>`
- Fetch with `credentials: "include"`; optimistic UI (likes, delete) with rollback on error
- PascalCase components, camelCase functions/variables; all UI text in Russian with proper declensions
- Context provider order (outermost first): `ThemeProvider → AuthProvider → SSEProvider → ContentPreferencesProvider → IgnoredUsersProvider → NotificationsProvider`
- `SSEProvider` must wrap `NotificationsProvider` and any component using `useSSE`/`useSSEContext`; `AuthProvider` must stay an ancestor of `SSEProvider` (it consumes `useAuth`)
- `SSEProvider` consumes `useAuth()` and opens the `EventSource` **only for an authenticated user** — never while auth is `loading`, never for anonymous visitors. It connects on sign-in and tears the connection down on sign-out (effect keyed on the user id); this mirrors the server-side 401 gate on `/api/v1/events`
- Unused vars prefixed `_`

## Architecture Notes (Frontend)

- SPA with hash routing — no server-side route handling needed.
- **@mentions**: serialized as `@[username:userId]` tokens. `MentionInput.tsx` = contenteditable div, `@` opens dropdown of up to 5 matching users (client-side filtered from module-level cached list). `renderContent` in ShoutCard parses tokens → `#/profile/:id` links. User list lazy-fetched on first `@` via `GET /users/mentions`, cached for browser session.
- **Comment quoting**: clicking "Reply" on a comment sets `replyToId` in the POST body. Backend attaches `reply_to` FK (self-referential, SET NULL on delete). `QuoteBlock` in ShoutCard renders quoted snippet with author; click scrolls to original. The quoted comment's author always receives a `reply` notification, independent of @mention logic.
- **Embeds** (`extractEmbeds()` in ShoutCard): auto-detects URLs and renders inline. Platforms: **YouTube** (iframe, oEmbed, 5s timeout), **Twitter/X** (fxtwitter API, module-level `tweetCache`, shows author/text/photos/stats; image proxy via `pbs.fxtwitter.com`), **Steam** (server-side proxy `/steam/app/:appId`, module-level `steamCache`, shows name/description/price/recommendations in Russian), **Imgur** (direct images + pages + albums), **Coub** (iframe), **Tenor** (iframe), **Giphy** (iframe, multiple URL patterns). Rendered in URL order found in text.
- Popular tab: shouts from last 7 days; dual sort buttons (heart = likes, comment icon = comments) via `popularSort` state in ShoutFeed.
- Content hidden by preferences: placeholder div (crossed-camera icon) rendered instead of removing from DOM — prevents layout jumps.
- **Social links**: 14 platforms (steam, playstation, xbox, battlenet, epicgames, retroachievements, exophase, backloggd, youtube, myshows, telegram, x, discord, boosty), one per platform per user. Plain-text socials (Battle.net, Epic Games, Discord, Telegram) are stored as raw values; any social whose stored value isn't an `http(s)` URL renders as a copy-to-clipboard badge rather than a link.
- Lightbox: drag-to-dismiss (vertical swipe + velocity), Escape, click-outside, scroll lock. Pointer events (unified mouse/touch). Pinch-to-zoom, scroll-to-zoom, pan when zoomed, double-tap/click to toggle zoom.
- **`NotificationDropdown.tsx`**: bell icon + unread badge in Header; notifications as `<a>` elements (right-click open in new tab); actor avatar, text, snippet, relative timestamp; "mark all read" button; infinite scroll via `IntersectionObserver`.
- **Collapsible pinned shout**: eye icon in ShoutCard owner header toggles collapse. State persisted in `localStorage` at `pinnedCollapsed:${shoutId}`; stale keys pruned on feed reset (when current pinned id changes); `unpin_shout` SSE clears the key immediately.
- **Inline editing (shout/comment)**: edit button appears for the author within 60s of creation, with a live countdown. Uses `MentionInput` with `populate()` to pre-fill existing content. Saves via `PUT /shouts/:id` or `PUT /comments/:id`; result broadcast via `edit_shout`/`edit_comment` SSE to all clients.

## Mobile & iOS — Known Issues and Rules

These apply to every new UI/UX element. iOS Safari has repeatedly caused regressions.

### Mandatory checks before shipping UI changes
- Test on real iOS Safari (not just Chrome DevTools mobile emulation — they differ significantly)
- Check with virtual keyboard open: `position: fixed` elements shift or get obscured; prefer `position: sticky` or restructure layout
- Check bottom safe area: use `padding-bottom: env(safe-area-inset-bottom)` on any bottom-anchored UI (modals, sticky bars)

### Known iOS Safari gotchas
- **`100vh` is broken** — use `100dvh` (dynamic viewport height) or `window.innerHeight` JS fallback for fullscreen modals/overlays
- **Input zoom** — `font-size < 16px` on `<input>`/`<textarea>` triggers auto-zoom on focus; minimum `16px` on all form inputs
- **`position: fixed` + virtual keyboard** — fixed elements don't stay fixed when keyboard opens; modals and the composer are affected
- **Scroll lock** — `overflow: hidden` on `<body>` doesn't prevent scroll on iOS; use `touch-action: none` or the existing Lightbox scroll-lock pattern
- **`:hover` states** — persist after tap on iOS (no hover-out event); gate hover-only styles with `@media (hover: hover)`
- **Pointer events** — always use pointer events (not separate mouse/touch handlers) for drag/swipe; Lightbox is the reference implementation
- **`-webkit-tap-highlight-color: transparent`** — set on interactive elements to remove the blue flash on tap
- **Backdrop blur** — `-webkit-backdrop-filter` needed alongside `backdrop-filter`
- **Custom pointer-gesture tracking needs `onPointerCancel`, not just `onPointerUp`** — iOS fires `pointercancel` (never `pointerup`) when a touch is interrupted, e.g. backgrounding the tab mid-tap. Any handler that only resets its gesture-start ref on `pointerup` can get stuck reading a stale start point on the next real tap and misclassify it as a drag. `GalleryCarousel.tsx`'s drag handler is the reference implementation (has both `onPointerCancel` and `setPointerCapture`); `PendingMediaStrip.tsx`'s remove control was fixed to match after shipping without it.
- **Tap-vs-swipe velocity math needs a minimum-distance floor** — classifying a gesture as a swipe via `distance > threshold || velocity > threshold` (velocity = dx/elapsed) is unsafe without also requiring `dx` past a small floor (e.g. 10px) first. A few px of natural jitter on a fast real tap, combined with a tiny `elapsed`, can spike the velocity term past threshold from pure arithmetic and get misclassified as a swipe — this is exactly what caused "swipe then immediately tap doesn't open fullscreen" on `GalleryCarousel.tsx` (`SWIPE_MIN_JITTER_DISTANCE`).
- **An async `setState` immediately followed by a synchronous imperative DOM mutation can flash stale content** — if a callback calls e.g. `setCurrentIndex(...)` and then, on the next line, imperatively mutates a ref'd DOM node (`el.style.transform = ...`), the mutation can land before React re-renders with the new state, briefly showing old content at the new position. Fix: move the imperative step into a `useLayoutEffect` keyed on the state that must land first, so it only runs once the DOM already reflects the update (`GalleryCarousel.tsx`'s swipe-settle reset).

### Touch targets
- Minimum 44×44px tap target for all interactive elements (Apple HIG)
- Icon buttons without labels need explicit padding — don't rely on icon size alone
- **Detecting touch vs. mouse/trackpad**: `window.matchMedia('(pointer: coarse)').matches` is the established convention (`EmojiPicker.tsx`, `GifPicker.tsx`, `GalleryCarousel.tsx`) — used both to size tap targets differently per input type and to hide mouse-only fallback controls (e.g. `GalleryCarousel`'s arrow buttons) on touch devices that already have an equivalent gesture (swipe). The inverse, `(hover: hover) and (pointer: fine)`, is used in `SearchDropdown.tsx` where the check needs to be about mouse presence specifically.

### Composer / ShoutInput on mobile
- Emoji picker positioning must account for virtual keyboard height
- Drag-drop for media doesn't exist on iOS; ensure tap-to-upload path is always present and obvious
