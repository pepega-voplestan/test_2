# Web Frontend Reference

## Repository Structure (web/)

```
web/
├── components/
│   ├── Header.tsx              # Auth, navigation, theme toggle, notification dropdown
│   ├── AuthModal.tsx           # Login/register/password-reset modal (multi-step, email verification)
│   ├── ShoutFeed.tsx           # Feed: new/popular/announcements tabs, SSE updates; popular has dual sort
│   ├── ShoutInput.tsx          # Composer: media, emoji, polls, drag-drop, Ctrl+Enter; spoiler/nsfw require media
│   ├── ShoutCard.tsx           # Shout display: comments, likes, delete, inline edit (60s window with countdown); inline embeds; collapsible pinned shout (eye icon, localStorage)
│   ├── ShoutPage.tsx           # Single shout detail view (#/shout/:id)
│   ├── MentionInput.tsx        # contenteditable composer with @mention autocomplete; ref handle: clear/focus/scrollIntoView/insertText/insertMention/wrapSpoiler/populate
│   ├── NotificationDropdown.tsx # Bell + unread badge + hover-to-read list + infinite scroll
│   ├── ProfilePage.tsx         # Profile view/edit + social links
│   ├── ProfileSocials.tsx      # Social icons grid (copy-to-clipboard) + modal editor
│   ├── AvatarUpload.tsx        # Drag-drop avatar upload with preview
│   ├── EmojiPicker.tsx         # 500+ emojis, 13 categories, Russian+English search, sticky headers
│   ├── PollEditor.tsx          # Poll creation: 2-7 options, multi-select toggle, validation
│   ├── PollBlock.tsx           # Poll display/voting: progress bars, vote counts, optimistic updates
│   └── Lightbox.tsx            # Fullscreen image: drag-dismiss, pinch/scroll zoom, pan, scroll lock
├── context/
│   ├── AuthContext.tsx         # useAuth()
│   ├── ThemeContext.tsx        # useTheme()
│   ├── SSEContext.tsx          # Single shared EventSource; subscribe(event, handler) pattern
│   ├── NotificationsContext.tsx # useNotifications()
│   ├── ContentPreferencesContext.tsx # useContentPreferences()
│   └── IgnoredUsersContext.tsx # useIgnoredUsers()
├── hooks/
│   ├── useRoute.ts             # Hash-based routing
│   ├── useSSE.ts               # Thin wrapper around SSEContext.subscribe
│   ├── useScrollLock.ts        # Scroll lock utility (used by Lightbox)
│   └── useMentionUsers.ts      # Module-level singleton cache for mention list
├── tests/
│   ├── setup.ts                # DOM mocks (matchMedia, scrollTo)
│   ├── helpers.tsx             # renderWithProviders()
│   └── unit/effectiveLength.test.ts
├── public/                     # favicon.svg, steam.svg, xbox.svg, playstation.svg, epicgames.png, boosty.png, retroachievements.png, battlenet.webp
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
- `SSEProvider` must wrap `NotificationsProvider` and any component using `useSSE`/`useSSEContext`
- Unused vars prefixed `_`

## Architecture Notes (Frontend)

- SPA with hash routing — no server-side route handling needed.
- **@mentions**: serialized as `@[username:userId]` tokens. `MentionInput.tsx` = contenteditable div, `@` opens dropdown of up to 5 matching users (client-side filtered from module-level cached list). `renderContent` in ShoutCard parses tokens → `#/profile/:id` links. User list lazy-fetched on first `@` via `GET /users/mentions`, cached for browser session.
- **Embeds** (`extractEmbeds()` in ShoutCard): auto-detects URLs and renders inline. Platforms: **YouTube** (iframe, oEmbed, 5s timeout), **Twitter/X** (fxtwitter API, module-level `tweetCache`, shows author/text/photos/stats; image proxy via `pbs.fxtwitter.com`), **Steam** (server-side proxy `/steam/app/:appId`, module-level `steamCache`, shows name/description/price/recommendations in Russian), **Imgur** (direct images + pages + albums), **Coub** (iframe), **Tenor** (iframe), **Giphy** (iframe, multiple URL patterns). Rendered in URL order found in text.
- Popular tab: shouts from last 7 days; dual sort buttons (heart = likes, comment icon = comments) via `popularSort` state in ShoutFeed.
- Content hidden by preferences: placeholder div (crossed-camera icon) rendered instead of removing from DOM — prevents layout jumps.
- **Social links**: 12 platforms, one per platform per user. Non-URL socials (Discord, Battle.net, PSN, Xbox, Epic Games) support copy-to-clipboard.
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

### Touch targets
- Minimum 44×44px tap target for all interactive elements (Apple HIG)
- Icon buttons without labels need explicit padding — don't rely on icon size alone

### Composer / ShoutInput on mobile
- Emoji picker positioning must account for virtual keyboard height
- Drag-drop for media doesn't exist on iOS; ensure tap-to-upload path is always present and obvious
