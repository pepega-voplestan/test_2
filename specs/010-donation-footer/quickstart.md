# Quickstart: Donation Footer in Announcements

Manual end-to-end validation for the feature described in [spec.md](./spec.md), once implemented per [plan.md](./plan.md).

## Prerequisites

- Local dev environment running (`cd web && npm run dev`, per repo root `CLAUDE.md`)
- Logged in or logged out — the footer must appear in both states (spec Assumptions)
- At least one announcement item present via the admin panel, plus a session with the announcement list empty, to cover both states in FR-010

## Desktop validation

1. Open the app in a desktop-width browser window (≥1024px).
2. Open the notification dropdown and switch to the **Объявления** tab.
3. Scroll to the bottom of the announcement list.
4. **Expect**: a divider, the text "Хотите чтобы вопли жили? Поддержать проект можно здесь", and a button, all below the last announcement item. The divider and button should visually match the app's existing composer-attachment divider and existing filled-button styling (see `research.md` decisions).
5. Click the button.
6. **Expect**: a dialog opens, centered on screen, showing the YooMoney donation widget. Nothing on the page scrolls horizontally.
7. Close the dialog (backdrop click or close control).
8. **Expect**: the announcements panel is still open, showing the same items and scroll position as before opening the dialog.

## Mobile validation

1. Resize the browser to a narrow mobile width (e.g. 375px, or use device emulation) — repeat steps 2–8 above.
2. **Expect**: footer and button are visible without extra horizontal scrolling of the dropdown itself; the dialog and embedded widget are fully visible and centered, with no horizontal page scroll, even though the vendor iframe's native size is 500×480.

## Empty-state validation

1. Ensure there are currently no announcement items (or use a test/staging account with an empty list).
2. Open the Объявления tab.
3. **Expect**: the "Нет объявлений" empty-state message is shown, and the donation footer is still visible below it (FR-010).

## Tab-scoping validation

1. Switch to the **Уведомления** (notifications) tab.
2. **Expect**: the donation footer does NOT appear here (FR-009) — it is specific to Объявления.

## Automated tests

```sh
cd web
npm run test -- NotificationDropdown
npm run test -- DonationModal
```

**Expect**: all pass, covering footer visibility (both tabs, both list states), dialog open/close, and that opening/closing the dialog does not reset the announcements list state.
