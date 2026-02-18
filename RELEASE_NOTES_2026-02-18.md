# Release Notes — 2026-02-18

## Prisma ORM Migration
- Migrated from raw SQL to **Prisma ORM** with managed migrations
- Removed exposed secrets from the codebase

## Development Environment
- Added isolated dev environment via `docker-compose.dev.yml` (port 3006, separate volumes)
- Added `Makefile` with shortcuts for prod/dev Docker operations
- Configured Docker networking for service isolation

## Announcements Tab
- New **Announcements** feed tab in the UI
- Backend `POST /api/v1/announcements` endpoint protected by a secret key

## Dark/Light Theme Toggle
- Added theme switcher with CSS custom properties
- Theme preference persisted across sessions via `ThemeContext`

## Bug Fixes & UI Polish
- Fixed character limit enforcement on shouts and comments
- Fixed long comment text wrapping/overflow
- Fixed image display issues in the feed
- Added clipboard paste support for image uploads in the composer
