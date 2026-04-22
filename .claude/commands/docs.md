# Documentation Organizer — /docs

Skill for organizing project documentation. Splits CLAUDE.md into a compact core + detailed files in `docs/`.

## Input

$ARGUMENTS

If no argument — run full cycle (analysis + reorganization + verification).
If argument given (e.g. "update api") — update only that section.

## How it works

### Step 1: Determine current state

Read `CLAUDE.md` in the project root.

**Option A — Structure already organized** (tags `<!-- ESSENTIAL:START -->` and `<!-- ESSENTIAL:END -->` exist):
→ Go to Step 4 (verification and update).

**Option B — Structure NOT organized** (no tags):
→ Continue from Step 2 (initial organization).

### Step 2: Analysis and classification (first run only)

Analyze all CLAUDE.md content and split it into two categories:

**ESSENTIAL (stays in CLAUDE.md)** — information Claude needs at the start of EVERY new session:
- Project name and description (1-2 lines)
- Links (production, staging, etc.)
- Server (IP, SSH, component table)
- Tech stack (brief, one line per component)
- Deploy (1-2 lines + link to docs/deploy.md)
- Local development (commands)
- Logs (commands to view)
- Troubleshooting (common issues)

**DETAILED (moved to docs/)** — detailed information needed only when working on a specific component:
- Detailed file structure
- API endpoints
- Database schema
- Feature details
- Component architecture

### Step 3: Reorganization (first run only)

#### 3a. Create `docs/` if it doesn't exist

```bash
mkdir -p docs
```

#### 3b. Create/update files in docs/

For each major block of detailed information, create a separate file in `docs/`.
Typical structure:
- `docs/web.md` — web application (components, features, localStorage)
- `docs/api.md` — API (endpoints, DB, scripts)
- `docs/bot.md` — telegram bot (configuration, autopublishing)
- `docs/deploy.md` — deployment (CI/CD, manual deploy, logs)
- `docs/audio.md` — audio architecture (if applicable)
- other files as needed

If a file already exists in `docs/` — check its content and update if needed, don't overwrite without reason.

#### 3c. Rewrite CLAUDE.md

New CLAUDE.md format:

```markdown
# [Project Name]

<!-- Use /docs command when updating documentation — do not edit CLAUDE.md manually -->

<!-- ESSENTIAL:START — Project core. Update via /docs command, do not touch manually -->

[Brief project description — 1-2 sentences]

[Links, server, stack, deploy, local development, logs, troubleshooting — CONCISE]

<!-- ESSENTIAL:END -->

## Detailed Documentation

- [Web App](docs/web.md) — description
- [API](docs/api.md) — description
- [etc.]
```

**CRITICAL for the ESSENTIAL block:**
- Between `<!-- ESSENTIAL:START -->` and `<!-- ESSENTIAL:END -->` — ONLY what is needed every session
- No unnecessary details — only the most important things, compactly
- Details go in docs/ files with links

### Step 4: Verification

For EVERY statement in the documentation, verify:

1. **File structure** — use Glob to check that listed paths and files actually exist
2. **Dependencies** — check package.json, requirements.txt, etc. against the stated stack
3. **Commands** — verify that listed npm scripts / commands exist
4. **CI/CD** — check workflow files match the documented deploy description
5. **Configuration** — verify ports, paths, services

For each discrepancy:
- If the correct value can be determined from code — fix the documentation
- If unclear — ask the user via `AskUserQuestion`

### Step 5: Report

Show the user:
1. What was changed (list of files)
2. What was verified and is current
3. What was corrected (if there were inaccuracies)
4. Questions (if any uncertainties remain)

Then via `AskUserQuestion` offer:
- **"Commit"** — `git add CLAUDE.md docs/ && git commit -m "docs: reorganize CLAUDE.md documentation"`
- **"Not yet"** — leave changes local

## Update rules (repeat runs)

On repeat runs the skill MUST NOT:
- Rewrite the entire CLAUDE.md
- Overwrite docs/ files without reason
- Touch the ESSENTIAL block without real changes

The skill MUST:
- Check the ESSENTIAL block for accuracy (Step 4)
- Check docs/ files for accuracy (Step 4)
- Add new information if it has appeared (new components, endpoints, etc.)
- Remove outdated information if something was removed from code
- Update only sections where there are real discrepancies with the code

## What does NOT belong in docs/

- README.md — that's for GitHub users, not for Claude
- Files in .claude/ — that's Claude Code config
- Tests, migrations, scripts — that's code, not documentation

## CRITICAL RULES

- ALWAYS read code before updating documentation — never write from guesswork
- The ESSENTIAL block must be as compact as possible — every line costs context
- Links to docs/ files MUST always be relative
- Do not add secrets, tokens, or passwords to documentation
- If you find secrets in existing documentation — warn the user and offer to remove them
- Documentation language: English only — always write all documentation and comments in English regardless of the existing content language
