# Research: Donation Footer in Announcements

No `NEEDS CLARIFICATION` markers remained in the Technical Context — the stack, testing tools, and constraints were confirmed directly from the repository (`web/package.json`, existing components) rather than assumed. This document instead records the small set of design decisions needed to satisfy the spec's "match existing style" requirements precisely, since the spec deliberately avoided prescribing implementation.

## Decision: Footer placement within the announcements panel

**Decision**: Render the footer as the last child inside the existing `max-h-[480px] overflow-y-auto` scroll container in `NotificationDropdown.tsx` (after the `announcementItems.map(...)` block), not as a separate sticky element outside the scroll area.

**Rationale**: The spec (FR-001, FR-010) only requires the footer to appear "below the announcement content" and remain visible even when the list is empty — it does not require it to stay pinned while scrolling. Keeping it inside the existing scroll container is the smallest change: no new layout region, no risk of a sticky footer overlapping short content or fighting the panel's existing `max-h`/`overflow-y-auto` sizing.

**Alternatives considered**:
- *Sticky footer outside the scroll area, always pinned to the dropdown bottom*: rejected — bigger structural change to a component with existing, tested scroll/pagination behavior on its notifications-tab sibling; not requested by the spec and adds risk of covering the last announcement on short lists.

## Decision: Divider styling

**Decision**: Reuse the exact divider treatment from `PendingMediaStrip.tsx` (`border-t border-th-border`, top-border only, no side/bottom borders) rather than the `GifPicker.tsx` footer divider (`border-t border-th-border/50`, includes padding/typography for an attribution line).

**Rationale**: The user's request explicitly named "the gallery picker when you attach files," which is the composer's attached-media strip (`PendingMediaStrip.tsx`), not the GIF picker's attribution footer. Both are top-border dividers, but `PendingMediaStrip`'s is the more literal match and is already used purely as a plain content separator (closer to this use case) rather than being coupled to attribution text styling.

**Alternatives considered**:
- *`GifPicker.tsx`'s divider*: rejected as a less exact match to what the user pointed at, though visually similar enough that either would look consistent with the app.

## Decision: Button styling

**Decision**: Style the donation button after the existing primary/filled button convention (`AuthModal.tsx`'s submit button: solid fill, rounded, semibold text, hover-opacity transition), not the text-link style used for the composer's "Отправить" button.

**Rationale**: The spec's phrase "same design as other buttons" and the fact this is a standalone call-to-action (not an inline text-adjacent submit action) both point to the app's standard filled-button treatment rather than a minimal text link. There is no single centralized `Button` component to import (confirmed: no `export function/const/default Button` exists anywhere in `web/components/`), so "matching" means copying the established Tailwind-like utility class pattern, consistent with how every other button in the codebase is already hand-styled per usage.

**Alternatives considered**:
- *Text-link style (`ShoutInput.tsx`'s "Отправить")*: rejected — reads as a secondary/inline action, understating a call-to-action meant to stand out after a divider.
- *Extracting a new shared `Button` component*: rejected as out of scope — the spec asks for visual consistency, not a refactor of the app's button architecture; introducing a shared component here would be scope creep beyond a "small addition."

## Decision: Dialog implementation

**Decision**: New `DonationModal.tsx` component following `AuthModal.tsx`'s overlay/centering convention: a `fixed inset-0` click-to-dismiss backdrop plus a centered panel using `w-[92vw] max-w-*` sizing translated to center via `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`.

**Rationale**: This is the only existing "centered dialog" convention in the codebase (`Lightbox.tsx` is a different, fullscreen image-viewer pattern, not a boxed dialog) — reusing it satisfies FR-006 ("consistent with how other centered preview/dialog surfaces already behave") without inventing new interaction patterns (backdrop click-to-close, escape affordance expectations, stacking/z-index conventions).

**Alternatives considered**:
- *Reuse `Lightbox.tsx`'s fullscreen pattern*: rejected — that pattern is for edge-to-edge media viewing, not a compact widget; using it here would look and behave inconsistently with what users already expect from a "dialog" versus a "fullscreen viewer."
- *Building a generic reusable `Modal` component now*: rejected for the same reason as the button — the spec asks this feature to look consistent with existing dialogs, not to refactor dialog architecture project-wide.

## Decision: Containing the fixed-size (500×480) vendor iframe responsively

**Decision**: Wrap the iframe in a container capped at `max-w-[500px] w-full` with the iframe itself constrained to `w-full` (overriding/not relying on its literal `width="500"` attribute for layout, while leaving `height="480"` as the iframe's own scroll-free intrinsic height) and give the outer dialog panel `w-[92vw] max-w-[520px]` so at any viewport ≥ ~360px width the iframe scales down to fit without horizontal overflow, while at desktop widths it displays at its natural 500px width, centered.

**Rationale**: YooMoney's quickpay widget markup is a fixed-size legacy iframe embed (no responsive parameter in the URL); the safest way to guarantee FR-007 (no horizontal page scroll on any supported viewport) without altering vendor markup semantics is CSS containment on the wrapper/iframe width, letting the iframe's own internal content reflow (YooMoney's widget is itself responsive inside the frame) rather than trying to rescale the frame with a transform, which would also shrink click targets and text inside it.

**Alternatives considered**:
- *CSS `transform: scale()` on the iframe to shrink it uniformly on mobile*: rejected — shrinks tap targets and text inside the vendor widget along with the frame, hurting usability exactly on the viewports where FR-007 matters most.
- *Horizontal scroll container around the iframe on mobile*: rejected — directly violates FR-007 ("MUST NOT cause the page to scroll horizontally"); spec explicitly rules this out.
- *`scrolling="no"` removal / iframe `srcdoc` rewrite to inject a responsive meta viewport*: rejected — modifying the vendor-provided embed's internal document is out of scope and fragile (would need to intercept/rewrite third-party markup); width-capping the container achieves the same visible outcome without touching vendor content.

## Decision: Test coverage approach

**Decision**: Add/extend `web/tests/unit/NotificationDropdown.test.tsx` (or create it if it doesn't yet exist) to cover: footer renders on the announcements tab (with items and with the empty state), footer does not render on the notifications tab, clicking the button opens the dialog, and closing the dialog returns to the prior announcements state. Add a small `DonationModal.test.tsx` for the dialog's own open/close/backdrop behavior in isolation.

**Rationale**: Matches the project's existing per-component Vitest + Testing Library convention (e.g. `PendingMediaStrip.test.tsx`) and Constitution Principle VI (design first — the dialog is extracted as its own component because it is the natural shape, which incidentally makes it easily testable, not the other way around).

**Alternatives considered**: none meaningfully different — this follows established project convention directly.
