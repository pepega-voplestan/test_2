# Feature Specification: Email Domain Whitelist for Registration

**Feature Branch**: `email-whitelist`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "I want new users to be able to register only if their email is in white list. Here is a list of allowed domains. ya.ru ukr.net mail.ru bk.ru yandex.ru yandex.com rambler.ru gmail.com list.ru inbox.ru lenta.ru icloud.com outlook.com hotmail.com live.com i.ua meta.ua yahoo.com"

## Clarifications

### Session 2026-08-04

- Q: Should the domain whitelist gate email changes by existing users, or only new registrations? → A: Both — enforce at new registration AND when an existing user changes their email address (the app has an email-change flow).
- Q: How should the approved-domain list be stored and managed? → A: Static configuration (env var or config/constants file), operator-editable via deploy; no database table and no admin UI in v1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Block disallowed email domains at registration and email change (Priority: P1)

A person tries to bring a non-approved email domain into the system — either a prospective user creating an account, or an existing user changing their email address. In both cases the system refuses the non-approved domain before any verification code is sent.

**Why this priority**: This is the entire purpose of the feature — restricting which email domains exist in the system, whether at sign-up or via later email change. Without it, nothing else in this spec has value. It is the MVP: enforce the whitelist at every point an email enters the system.

**Independent Test**: Attempt to register with an email on a domain not in the approved list (e.g. `someone@example.com`) and confirm no account and no verification code result; then register with an approved domain (e.g. `someone@gmail.com`) and confirm it proceeds. Separately, as an existing user, attempt to change the email to a non-approved domain (blocked) and to an approved domain (allowed).

**Acceptance Scenarios**:

1. **Given** a prospective user on the registration form, **When** they submit an email whose domain is not in the approved list, **Then** the account is not created and no verification code, welcome, or session is triggered.
2. **Given** a prospective user on the registration form, **When** they submit an email whose domain is in the approved list and all other fields are valid, **Then** registration proceeds normally.
3. **Given** an email whose domain matches an approved domain but in different letter case (e.g. `USER@GMAIL.COM`), **When** they submit registration, **Then** the domain is accepted (matching is case-insensitive).
4. **Given** a signed-in existing user on the email-change flow, **When** they request to change their email to an address whose domain is not in the approved list, **Then** the change is rejected before any verification code is sent to the new address.
5. **Given** a signed-in existing user on the email-change flow, **When** they request to change their email to an approved domain, **Then** the email-change flow proceeds as normal.

---

### User Story 2 - Clear, localized rejection feedback (Priority: P2)

A prospective user whose email domain is not approved receives an understandable, Russian-language explanation of why they cannot register, so they can retry with an eligible address.

**Why this priority**: The block itself (P1) delivers the security value; a clear message reduces confusion and support load but is not strictly required for the restriction to function.

**Independent Test**: Submit registration with a disallowed domain and confirm a clear Russian-language message is shown that explains the address is not eligible, without exposing the full list of allowed domains.

**Acceptance Scenarios**:

1. **Given** a registration attempt with a disallowed domain, **When** the system rejects it, **Then** the user sees a Russian-language message indicating the email address is not permitted for registration.
2. **Given** a rejection message is displayed, **When** the user reads it, **Then** the complete whitelist is not disclosed in the message.

---

### User Story 3 - Maintain the approved domain list (Priority: P3)

An operator can update which domains are approved (add or remove domains) so the eligibility rules can change over time without altering application logic.

**Why this priority**: The feature ships with a fixed list that satisfies the immediate need; the ability to change it later is valuable for maintenance but not required for the initial restriction to work.

**Independent Test**: Change the configured approved-domain list, then attempt registration with a newly added domain (succeeds) and a newly removed domain (fails), confirming the change takes effect without code changes to business logic.

**Acceptance Scenarios**:

1. **Given** an updated approved-domain list, **When** a prospective user registers with a domain that was just added, **Then** registration is allowed.
2. **Given** an updated approved-domain list, **When** a prospective user registers with a domain that was just removed, **Then** registration is blocked.

---

### Edge Cases

- **Malformed email** (missing `@`, no domain, multiple `@`): rejected by existing email-format validation before or alongside the whitelist check; the whitelist check never accepts a malformed address.
- **Case variations** (`User@Gmail.COM`): accepted when the normalized domain matches an approved domain.
- **Surrounding whitespace** in the submitted email is trimmed before the domain is extracted and matched.
- **Subdomain not on the list** (`user@mail.gmail.com`): rejected — only an exact match of the full domain portion after `@` is accepted.
- **Look-alike / superstring domains** (`user@gmail.com.attacker.net`, `user@notgmail.com`): rejected — they are not exact matches of any approved domain.
- **Empty or missing approved-domain configuration**: treated as "no domain is approved," so all registrations are blocked (fail-closed) rather than allowing everyone.
- **Existing users** whose email is on a non-approved domain: their ability to sign in is unaffected — the whitelist is applied only when an email *enters* the system (registration or an email change), never retroactively to already-stored addresses.
- **Email change to a disallowed domain**: an existing user attempting to switch to a non-approved domain is blocked at the same gate as registration, before a verification code is sent to the new address.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST validate the domain portion of the submitted email against a configured list of approved domains for every new registration before any account is created and before any verification code is sent.
- **FR-002**: System MUST reject a registration when the email's domain is not on the approved list, and MUST NOT create an account or initiate any downstream registration side effects (verification code, welcome, session) for a rejected attempt.
- **FR-003**: System MUST allow registration to proceed when the email's domain exactly matches an approved domain and all other registration validation passes.
- **FR-004**: Domain matching MUST be case-insensitive.
- **FR-005**: Domain matching MUST require an exact match of the full domain portion following the `@`; unlisted subdomains and look-alike/superstring domains MUST be rejected.
- **FR-006**: The initial approved-domain list MUST contain exactly these 18 domains: `ya.ru`, `ukr.net`, `mail.ru`, `bk.ru`, `yandex.ru`, `yandex.com`, `rambler.ru`, `gmail.com`, `list.ru`, `inbox.ru`, `lenta.ru`, `icloud.com`, `outlook.com`, `hotmail.com`, `live.com`, `i.ua`, `meta.ua`, `yahoo.com`.
- **FR-007**: System MUST present a clear, Russian-language message when a registration is rejected for a non-approved domain, and MUST NOT disclose the complete approved-domain list in that message.
- **FR-008**: Whitelist enforcement MUST be authoritative on the backend; any frontend indication of eligibility is a secondary guard and MUST stay consistent with backend behavior.
- **FR-009**: The approved-domain list MUST be maintainable through static configuration (an environment variable or a configuration/constants file) without changes to business logic, and MUST NOT require a database table or runtime admin UI in this release.
- **FR-010**: Enforcement MUST apply to new-user registration AND to any existing user changing their email address; in both flows the approved-domain check MUST run before a verification code is sent to the submitted address.
- **FR-011**: The whitelist check MUST run in addition to (not as a replacement for) existing email-format validation.
- **FR-012**: When the approved-domain configuration is empty or absent, the system MUST fail closed (reject all registrations and email changes) rather than allowing any domain.
- **FR-013**: The feature MUST NOT retroactively affect existing accounts — a user whose stored email is on a non-approved domain MUST retain full sign-in ability; only registering or changing an email is gated.
- **FR-014**: When an email change is rejected for a non-approved domain, the user's existing (current) email MUST remain unchanged.

### Key Entities *(include if feature involves data)*

- **Approved Domain List**: The set of email domains eligible for new-user registration. Attributes: a collection of normalized (lower-case, trimmed) domain strings; maintained via configuration.
- **Registration Attempt**: A prospective user's submitted registration, carrying the email address from which the domain is extracted and evaluated against the Approved Domain List.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of registration attempts AND email-change attempts using an email domain outside the approved list are prevented from creating an account or changing an email.
- **SC-002**: 100% of registration and email-change attempts using a well-formed email on an approved domain pass the domain-eligibility check.
- **SC-003**: Every rejected registration or email change returns a localized (Russian) explanation, sends no verification code to the disallowed address, and results in zero account/email changes, with no measurable increase in response time.
- **SC-004**: An operator can change the approved-domain list via configuration and have the change take effect for subsequent registrations and email changes without any code change to business logic.
- **SC-005**: Zero existing users are prevented from signing in as a result of this feature.

## Assumptions

- The restriction applies to both **new registration** and **existing users changing their email**; existing accounts are never affected retroactively and retain full sign-in access regardless of their stored email domain.
- Both the registration and email-change flows are **two-step** (submit → verify via emailed code); the domain check runs at the first step so no verification code is sent to a disallowed address.
- Domain matching is **exact and case-insensitive**; only the domains explicitly listed are approved, and unlisted subdomains are not approved.
- The approved-domain list is a **static, configuration-managed list** (environment variable or config/constants file) for this release; there is no database table and no runtime admin UI (User Story 3 is satisfied by an operator editing configuration, not by an in-app UI).
- Rejection messaging is in **Russian** (per the product's Russian-UI requirement) and deliberately does not enumerate the full whitelist to avoid oversharing eligibility rules.
- Existing **email-format validation** and the existing session-based registration/auth flow remain in place; this feature adds a domain-eligibility gate and does not alter the authentication model.
- The trailing whitespace present after `ya.ru` in the provided input is incidental; the canonical domain is `ya.ru`.
- No changes to how already-registered users' emails are stored or displayed are required.
