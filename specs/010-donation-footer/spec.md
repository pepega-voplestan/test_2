# Feature Specification: Donation Footer in Announcements

**Feature Branch**: `010-donation-footer`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "a small addition frontend only, in Объявления section box, add a small footer section with a hyperlink and an easy divider like we use for the gallery picker when you attach files. In that box, we say 'Хотите чтобы вопли жили? Поддержать проект можно здесь' which will be a button same design as other buttons. By clicking [it opens a] widget preview centered and sized appropriately for desktop and mobile. The iframe is: <iframe src=\"https://yoomoney.ru/quickpay/fundraise/widget?billNumber=1JMM32H01K8.260816&\" width=\"500\" height=\"480\" frameborder=\"0\" allowtransparency=\"true\" scrolling=\"no\"></iframe>"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover and open the donation prompt (Priority: P1)

A user opens the Объявления (announcements) panel to read the latest updates and, below the announcement content, sees a short message inviting them to support the project, with a button to act on it. Tapping/clicking the button opens a donation widget preview.

**Why this priority**: This is the entire point of the feature — without a visible, actionable prompt, there is no way for users to discover the funding option. It is the minimum slice that delivers value.

**Independent Test**: Open the announcements panel and verify the footer (divider + message + button) appears below the announcement list; click the button and verify the donation widget preview opens.

**Acceptance Scenarios**:

1. **Given** the user has the Объявления tab open, **When** they scroll to the bottom of the announcement content, **Then** they see a divider followed by the text "Хотите чтобы вопли жили? Поддержать проект можно здесь" and a button.
2. **Given** the footer is visible, **When** the user activates the button, **Then** a donation widget preview opens showing the embedded fundraising widget.
3. **Given** the announcement list is empty ("Нет объявлений"), **When** the user views the Объявления tab, **Then** the footer with the donation prompt is still visible.

---

### User Story 2 - View the donation widget on any device (Priority: P2)

A user opens the donation widget preview from a phone as well as from a desktop browser and can see and use the full widget without any part of it being cut off or requiring horizontal scrolling.

**Why this priority**: The donation widget has fixed internal dimensions; if it isn't sized/contained correctly on smaller screens, the P1 flow breaks in practice for a large share of users (mobile traffic).

**Independent Test**: Open the donation widget preview at a desktop viewport width and at a narrow mobile viewport width (e.g. 360–430px) and verify in both cases the preview is fully visible, centered, and the page does not scroll horizontally.

**Acceptance Scenarios**:

1. **Given** a desktop-width browser window, **When** the user opens the donation widget preview, **Then** it appears centered on screen at a comfortable size.
2. **Given** a narrow mobile-width viewport, **When** the user opens the donation widget preview, **Then** it appears centered, fully contained within the screen width, and does not cause the page to scroll sideways.

---

### User Story 3 - Dismiss the donation widget and resume reading (Priority: P3)

A user opens the donation widget preview, decides not to donate right now, and closes it, returning to the announcements panel exactly as they left it.

**Why this priority**: Completes the interaction loop; without a reliable way to close it, the feature would trap or annoy users, but the core value (prompt + widget display) already exists without this.

**Independent Test**: Open the donation widget preview, close it via the close control, and verify the announcements panel is still open with its previously loaded content and scroll position intact.

**Acceptance Scenarios**:

1. **Given** the donation widget preview is open, **When** the user closes it, **Then** the announcements panel remains open, showing the same content as before.
2. **Given** the donation widget preview is open, **When** the user closes it, **Then** no leftover overlay or blocked interaction remains on the page.

---

### Edge Cases

- What happens if the user rapidly activates the donation button multiple times? Only one donation widget preview should be open at a time.
- What happens if the external donation widget fails to load (e.g. network issue, ad-blocker, provider downtime)? The preview must still be closable and must not break the surrounding page layout.
- What happens if the viewport is unusually narrow (below common mobile widths)? The preview must still remain centered and contained without causing horizontal page scroll, even though the embedded widget's internal size is fixed.
- What happens on the Уведомления (notifications) tab, which shares the same dropdown? The donation footer must not appear there — it is specific to the Объявления tab.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Объявления tab MUST display a footer section below the announcement content, containing a divider, a Russian-language message, and a button.
- **FR-002**: The footer's divider MUST be visually consistent with the divider style already used elsewhere in the app to separate a composer's text area from its attached-media area.
- **FR-003**: The footer MUST display the exact Russian text "Хотите чтобы вопли жили? Поддержать проект можно здесь".
- **FR-004**: The footer's button MUST be visually consistent with the existing button styling used elsewhere in the app (not a new, one-off visual style).
- **FR-005**: Activating the footer's button MUST open a donation widget preview containing the embedded external fundraising widget.
- **FR-006**: The donation widget preview MUST be centered on screen and sized appropriately for both desktop and mobile viewports, consistent with how other centered preview/dialog surfaces already behave in the app.
- **FR-007**: The donation widget preview MUST NOT cause the page to scroll horizontally on any supported viewport width.
- **FR-008**: Users MUST be able to close the donation widget preview and return to the Объявления tab with its previously loaded content and scroll position unchanged.
- **FR-009**: The footer MUST appear only on the Объявления tab, not on the Уведомления (notifications) tab.
- **FR-010**: The footer MUST remain visible regardless of whether the announcement list has items or shows the empty state ("Нет объявлений").
- **FR-011**: All new user-visible text introduced by this feature MUST be in Russian with correct declensions.
- **FR-012**: Opening or closing the donation widget preview MUST NOT alter or reset the state of the underlying announcements list (loaded items, scroll position).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every user who opens the Объявления tab can see the support call-to-action without needing to navigate anywhere else.
- **SC-002**: Users can go from seeing the support message to viewing the donation widget preview in a single click/tap.
- **SC-003**: The donation widget preview displays fully on-screen with zero horizontal page scrolling, verified at both a common desktop width (≥1024px) and a common mobile width (≤430px).
- **SC-004**: Users can close the donation widget preview and resume viewing the announcements list with no loss of previously loaded content, 100% of the time.

## Assumptions

- "Объявления section box" refers to the existing Announcements tab panel inside the app's notification dropdown — the only existing UI element in the app carrying that exact Russian label. No new standalone box is being introduced.
- "Divider like we use for the gallery picker" refers to the app's existing thin top-border divider style already used to separate composer content from attached media, matched visually — not a shared component being newly extracted for this feature.
- "Same design as other buttons" means visually matching an existing button style already used elsewhere in the app; the codebase does not currently have one single centralized reusable button component, so "matching" means matching the established visual convention (color, padding, corner rounding, typography), not necessarily reusing one literal shared component.
- The donation widget preview follows the same general centered-overlay convention as other centered dialogs already in the app, adapted for this content.
- The donation widget is a third-party embed; its internal contents, behavior, and transaction handling are outside this feature's control. This feature is only responsible for correctly triggering, sizing, and dismissing the preview that contains it.
- The footer and donation prompt are shown to all users regardless of sign-in state, since supporting the project is not tied to a user account.
- No backend, database, or authentication changes are required — this is a static content and UI-interaction addition scoped entirely to the web frontend.
- Tracking donation amounts, confirmations, or receipts inside the app is out of scope; the external widget handles the transaction itself.
