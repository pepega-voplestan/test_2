# Phase 1 Data Model: Email Domain Whitelist

## Database changes

**None.** This feature introduces **no Prisma schema change and no migration**.
The approved-domain list is static configuration, not persisted data (per the
2026-08-04 clarification). Existing tables are used as-is:

- `User.email` — read for uniqueness (unchanged); written only on a successful,
  already-whitelisted email change (unchanged write path).
- `VerificationCode` — a row is created only *after* the domain check passes, so
  a rejected attempt leaves this table untouched.

## Config-level entity

### Approved Domain List (static in-code config, not a table)

| Attribute | Description |
|---|---|
| Source | Static `ALLOWED_EMAIL_DOMAINS` `Set` literal in `api/src/helpers/validation.js` (no env var) |
| Value | The 18 domains from FR-006 |
| Form | Lowercased `Set<string>` |
| Change process | Edit the list in code and redeploy |
| Empty-set behavior | Predicate fails closed by construction — rejects every address (FR-012) |

**The 18 domains (FR-006)**: `ya.ru`, `ukr.net`, `mail.ru`, `bk.ru`,
`yandex.ru`, `yandex.com`, `rambler.ru`, `gmail.com`, `list.ru`, `inbox.ru`,
`lenta.ru`, `icloud.com`, `outlook.com`, `hotmail.com`, `live.com`, `i.ua`,
`meta.ua`, `yahoo.com`.

## Derived value: submitted domain

Not stored. Computed per request from the submitted email:

```
domain = email.trim().toLowerCase().slice(lastIndexOf('@') + 1)
allowed = ALLOWED_EMAIL_DOMAINS.has(domain)   // exact membership in the static set
```

- **Uniqueness/identity**: N/A (config set; membership by exact string).
- **Validation rules applied**: exact match (FR-005), case-insensitive (FR-004),
  runs *after* Zod `.email()` format validation (FR-011).
- **State transitions**: none.

## Public predicate (shared)

`isAllowedEmailDomain(email: string): boolean` — exported from
`api/src/helpers/validation.js`; sole decision point, reused by both route
handlers so registration and email-change cannot drift.
