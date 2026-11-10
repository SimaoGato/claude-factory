---
name: story-format
description: The canonical user-story template and quality bar (INVEST, testable Given/When/Then acceptance criteria). Use whenever writing, splitting, or reviewing stories, chores, bugfixes, or acceptance criteria.
---

# Story format

Frontmatter is machine-read by the workflows and `/status-glance` — keep it accurate.

```
---
id: STORY-<NN>
epic: EPIC-<NN>
status: draft
pr: null
---

# <title>

## User story
As a <role>, I want <capability>, so that <benefit>.

## Context
Why this exists. Link PRD sections / the epic; don't copy them.

## Design references (UI stories only, optional)
- `docs/stories/assets/<story-id>/<file>.png` — what it shows.
  Local images only: agents can't open Figma/design-tool URLs, so export a PNG.

## Acceptance criteria
1. Given <context>, when <action>, then <observable outcome>.

## Out of scope
- excluded items

## Technical notes
- best-guess affected areas (Refine confirms)
```

- `status`: `draft` → `in_progress` → `in_review` (green-CI draft PR awaiting a
  human) → `done`; or `blocked`. `pr`: `null` until a PR exists, then its number.
- Chores: `id: CHORE-<NN>`, `epic: maintenance`. Bugfixes: `id: BUGFIX-<NN>`.
- Numbering: next unused number for that prefix across **both**
  `docs/stories/*.md` and `docs/stories/done/*.md`.

## Quality bar — INVEST
Independent · Negotiable (need, not solution) · Valuable · Estimable ·
Small (one `/claude-factory:deliver` run) · Testable (every AC can become a test).

## Splitting a big story
By workflow step, data variation, happy path vs edge cases, interface (API
then UI), or CRUD operation — pick the seam that gives independently valuable slices.
