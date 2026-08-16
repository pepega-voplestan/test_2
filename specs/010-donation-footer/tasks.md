# Tasks: Donation Footer in Announcements

**Input**: Design documents from `/specs/010-donation-footer/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required for user stories), [research.md](./research.md), [data-model.md](./data-model.md) (N/A — no entities), [quickstart.md](./quickstart.md)

**Tests**: Included. Not explicitly requested in the spec, but `research.md`'s "Test coverage approach" decision commits to following this project's established per-component Vitest + Testing Library convention (every comparable small component — `PendingMediaStrip.tsx`, `GalleryCarousel.tsx`, `Lightbox.tsx`, `MentionInput.tsx` — has its own test file).

**Organization**: Tasks are grouped by user story (from spec.md: US1/P1, US2/P2, US3/P3) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths are relative to repo root; this feature touches only `web/` (frontend-only, no `api/`/`workers/` changes — see plan.md Constitution Check)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new component file the rest of the feature builds on

- [X] T001 Create `web/components/DonationModal.tsx` with a typed skeleton: `interface DonationModalProps { isOpen: boolean; onClose: () => void }`, component returns `null` when `isOpen` is `false` (and an empty fragment/placeholder when `true`, filled in during Foundational). New file, no dependencies.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Get `DonationModal` itself fully working in isolation — every user story either renders it or extends it, so it must exist and pass its own tests before any story is wired up

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Write `web/tests/unit/DonationModal.test.tsx` (new file, following the pattern in `web/tests/unit/PendingMediaStrip.test.tsx`) asserting: renders nothing when `isOpen={false}`; when `isOpen={true}`, renders an `<iframe>` whose `src` is exactly `https://yoomoney.ru/quickpay/fundraise/widget?billNumber=1JMM32H01K8.260816&`. Run it and confirm it FAILS against the current skeleton. (depends on T001)
- [X] T003 Implement `DonationModal.tsx`'s body per `research.md`'s "Dialog implementation" and "Containing the fixed-size iframe" decisions: a `fixed inset-0` backdrop button that calls `onClose` on click, a centered panel (`w-[92vw] max-w-[520px]`, positioned via `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`) matching `AuthModal.tsx`'s existing overlay convention, containing the YooMoney iframe (`width={500} height={480} frameBorder={0} allowTransparency scrolling="no"`) wrapped in a `max-w-[500px] w-full` container so it scales down on narrow viewports. Run T002 and confirm it now PASSES. (depends on T001, T002)

**Checkpoint**: `DonationModal` works standalone (open/closed, correct iframe) and is ready to be wired into the announcements footer.

---

## Phase 3: User Story 1 - Discover and open the donation prompt (Priority: P1) 🎯 MVP

**Goal**: The Объявления tab shows a footer (divider + Russian message + button) below its content; activating the button opens the donation widget preview.

**Independent Test**: Render `NotificationDropdown` with the Объявления tab active — with announcement items, and again with an empty list — and confirm the footer is present in both cases; click its button and confirm `DonationModal` opens.

### Tests for User Story 1

- [X] T004 [US1] Write `web/tests/unit/NotificationDropdown.test.tsx` (new file) asserting: on the Объявления tab, the footer text "Хотите чтобы вопли жили? Поддержать проект можно здесь" and a button are present both when `announcementItems` has entries and when the list is empty ("Нет объявлений" state); on the Уведомления tab, the footer is absent (FR-009, FR-010). Run it and confirm it FAILS. (depends on T001)
- [X] T005 [US1] Extend `web/tests/unit/NotificationDropdown.test.tsx`: clicking the footer button causes the donation widget preview to open (assert `DonationModal`'s `isOpen` prop becomes `true`, or that the iframe becomes present in the DOM). Run it and confirm it FAILS. (depends on T004)

### Implementation for User Story 1

- [X] T006 [US1] Add the footer JSX to the announcements-tab branch of `web/components/NotificationDropdown.tsx` (around lines 302–364): place it as the last child inside the existing `max-h-[480px] overflow-y-auto` container, after the `announcementItems.map(...)` block and outside the loading/error/empty conditionals so it always renders. Divider: `border-t border-th-border` (matching `PendingMediaStrip.tsx`'s convention per research.md). Button: styled per the existing filled-button convention (matching `AuthModal.tsx`'s submit button classes — solid fill, rounded, semibold, hover-opacity). (depends on T004, T005 existing as failing tests)
- [X] T007 [US1] Add `isDonationModalOpen` state (`useState(false)`) to `NotificationDropdown.tsx`, wire the footer button's `onClick` to set it `true`, and render `<DonationModal isOpen={isDonationModalOpen} onClose={() => setIsDonationModalOpen(false)} />` at the bottom of the dropdown's JSX tree. (depends on T006, T003)
- [X] T008 [US1] Run `cd web && npm run test -- NotificationDropdown DonationModal` and confirm T002, T004, and T005 all pass.

**Checkpoint**: User Story 1 is fully functional and independently testable — footer visible, click opens the modal showing the widget. This is the MVP.

---

## Phase 4: User Story 2 - View the donation widget on any device (Priority: P2)

**Goal**: The donation widget preview is fully visible, centered, and causes no horizontal page scroll on both desktop and mobile viewports.

**Independent Test**: Render `DonationModal` open and assert its containment classes are present (not a fixed unconstrained width); manually verify at a mobile viewport width per `quickstart.md`'s "Mobile validation" section.

### Tests for User Story 2

- [X] T009 [US2] Extend `web/tests/unit/DonationModal.test.tsx`: assert the panel carries viewport-relative sizing (`w-[92vw]`) and the iframe's wrapping container carries the `max-w-[500px] w-full` containment classes from `research.md`, rather than an unconstrained fixed width. Run it and confirm it FAILS if containment classes are missing. (depends on T002, T003)

### Implementation for User Story 2

- [X] T010 [US2] Verify/adjust `DonationModal.tsx`'s panel and iframe-wrapper classes so T009 passes exactly as designed in `research.md`. This should largely already be satisfied by T003 (Foundational) — this task closes any gap T009 reveals. Run T009 and confirm it now PASSES. (depends on T003, T009)
- [ ] T011 [US2] Manually validate per `quickstart.md`'s "Mobile validation" section at a ~375px viewport width (browser resize or device emulation): confirm the footer/button are reachable, the modal and iframe are fully visible and centered, and there is no horizontal page scroll anywhere. (depends on T010) — **pending**: no browser/device-emulation tooling available in this environment; the responsive classes are covered automatically by T009, but real-browser confirmation is still outstanding.

**Checkpoint**: Donation widget preview confirmed responsive and non-overflowing on both desktop and mobile.

---

## Phase 5: User Story 3 - Dismiss the donation widget and resume reading (Priority: P3)

**Goal**: Users can close the donation widget preview (backdrop click or an explicit close control) and the announcements panel is completely unaffected.

**Independent Test**: Open the modal, close it via the backdrop and via an explicit close control, and confirm the announcements list/scroll state in `NotificationDropdown` is unchanged afterward.

### Tests for User Story 3

- [X] T012 [P] [US3] Extend `web/tests/unit/DonationModal.test.tsx`: clicking the backdrop calls `onClose`; clicking an explicit close-control element also calls `onClose`. Run it and confirm it FAILS if no explicit close control exists yet. (depends on T003)
- [X] T013 [P] [US3] Extend `web/tests/unit/NotificationDropdown.test.tsx`: after opening then closing the donation modal, the previously rendered announcement items and active tab are unchanged (no reset, no re-fetch). Run it and confirm it FAILS if closing has any side effect on dropdown state. (depends on T007)

### Implementation for User Story 3

- [X] T014 [P] [US3] Add an explicit close control (e.g. an "×" button in the panel's corner) to `DonationModal.tsx` calling `onClose`, in addition to the existing backdrop click-to-close from T003. Run T012 and confirm it now PASSES. (depends on T003, T012)
- [X] T015 [P] [US3] Confirm `isDonationModalOpen` in `NotificationDropdown.tsx` is fully independent of `tab`/`announcementItems`/scroll-related state (no shared state, no side effects triggered by opening/closing). Adjust only if T013 reveals coupling. Run T013 and confirm it now PASSES. (depends on T007, T013)

**Checkpoint**: All three user stories complete and independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T016 [P] Run the full web test suite (`cd web && npm run test`) to confirm no regressions in unrelated tests (e.g. `ShoutFeed.test.tsx`, `useMediaAttachments.test.ts`).
- [ ] T017 [P] Walk through `quickstart.md` end-to-end by hand (desktop, mobile, empty-state, tab-scoping sections) before considering the feature done. — **pending**: same environment limitation as T011; the equivalent scenarios are covered by the automated test suite (T004, T005, T009, T012, T013), but a live-browser walkthrough is still outstanding before shipping.
- [X] T018 Re-read the final diffs in `web/components/NotificationDropdown.tsx` and `web/components/DonationModal.tsx` against Constitution Principle VII (minimal, meaningful comments): remove any comment that merely restates the code, keeping only a comment explaining genuinely non-obvious *why* (e.g. why the iframe wrapper is capped at `max-w-[500px]` instead of scaling the iframe itself).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001) — BLOCKS all user stories, since US1 renders `DonationModal`, US2 refines its sizing, and US3 extends its close behavior.
- **User Stories (Phase 3–5)**: All depend on Foundational (Phase 2) completion.
  - US1 must land first in practice (US2 and US3 both extend files US1 creates/wires — `DonationModal.tsx` sizing and `NotificationDropdown.tsx` state), even though each has its own independent test criteria.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational. No dependency on other stories.
- **User Story 2 (P2)**: Can start after Foundational; in practice extends the `DonationModal.tsx` sizing that US1 already renders, but is independently testable via `DonationModal` alone (T009–T011 don't require the footer to exist).
- **User Story 3 (P3)**: Can start after Foundational; independently testable via `DonationModal`'s own close behavior (T012, T014) even before US1's footer wiring, though the full "resume reading" scenario (T013, T015) needs US1's state wiring (T007) to exist.

### Within Each User Story

- Tests written and confirmed failing before implementation.
- `DonationModal` (Foundational) before any story that renders or extends it.
- Story complete and its checkpoint verified before moving to the next priority.

### Parallel Opportunities

- T012 and T013 (US3 tests, different files) can run in parallel.
- T014 and T015 (US3 implementation, different files) can run in parallel.
- T016 and T017 (Polish — read-only validation activities) can run in parallel.
- Most other tasks are sequential because they repeatedly touch the same two files (`DonationModal.tsx`, `NotificationDropdown.tsx`) in a tight loop — this is a small, contained feature, not a multi-team effort, so most work happens in a single thread of execution.

---

## Parallel Example: User Story 3

```bash
# Launch both US3 test-writing tasks together (different files):
Task: "Extend web/tests/unit/DonationModal.test.tsx for backdrop/close-control onClose calls"
Task: "Extend web/tests/unit/NotificationDropdown.test.tsx for state-preservation after close"

# Once both fail as expected, launch both US3 implementation tasks together:
Task: "Add explicit close control to web/components/DonationModal.tsx"
Task: "Confirm isDonationModalOpen independence in web/components/NotificationDropdown.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002–T003) — CRITICAL, blocks all stories.
3. Complete Phase 3: User Story 1 (T004–T008).
4. **STOP and VALIDATE**: footer visible on Объявления tab (both list states), click opens the widget preview. This alone is a deployable MVP — donation discovery and access work end-to-end, even before mobile polish (US2) or an explicit close control (US3; backdrop-click-to-close from Foundational already provides basic dismissal).

### Incremental Delivery

1. Setup + Foundational → `DonationModal` ready and self-tested.
2. Add User Story 1 → test independently → deployable (MVP).
3. Add User Story 2 → test independently (mobile/desktop containment) → deploy.
4. Add User Story 3 → test independently (explicit close control + state preservation) → deploy.
5. Polish (Phase 6) → full regression pass + manual quickstart walkthrough.

---

## Notes

- [P] tasks touch different files and have no ordering dependency on each other within their phase.
- [Story] label maps each task to its user story for traceability back to spec.md.
- This is a small, contained frontend-only change (2 files modified/created for logic, 2 test files) — the phase/story structure above is kept lightweight on purpose, per plan.md's Constitution Check (no violations, no complexity to track).
- Commit after each checkpoint (end of Foundational, end of each user story phase).
