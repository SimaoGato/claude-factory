---
name: story-format
description: The canonical user-story template and quality bar (INVEST, testable Given/When/Then acceptance criteria). Use this whenever writing, splitting, or reviewing user stories or acceptance criteria, especially in the /stories command and the Refine stage of the /claude-factory:deliver workflow.
---

# Story format

## Template

Frontmatter is the machine-readable source of truth — `/status-glance` and
`workflows/deliver.js` read it directly (via a schema'd `agent()` call in the
latter case) instead of regexing prose, so keep it accurate and don't drop it.

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
Why this exists. Link to PRD sections and the parent epic.

## Acceptance criteria
1. Given <context>, when <action>, then <observable outcome>.
2. ...
(each criterion must be objectively testable)

## Out of scope
- explicitly excluded items

## Technical notes
- best-guess affected areas / file types (Refine will confirm)

## Definition of Done
See CLAUDE.md.
```

`status` is one of: `draft`, `ready`, `in_progress`, `in_review`, `blocked`,
`done`. `in_review` means `/claude-factory:deliver` (or `rework`) got to a
green-CI, still-draft PR and is waiting on a human to manually verify it
before `/claude-factory:promote` marks it `done`. `pr` is `null` until a PR
exists, then the PR number. `CHORE-<NN>` and `BUGFIX-<NN>` files use the same
frontmatter shape (`id: CHORE-<NN>` / `id: BUGFIX-<NN>`; chores use
`epic: maintenance`).

## Quality bar — INVEST
- **Independent**: deliverable on its own branch/PR without waiting on siblings.
- **Negotiable**: states the need, not a rigid solution.
- **Valuable**: a user or the business gains something observable.
- **Estimable**: small enough to reason about; if not, split it.
- **Small**: fits one `/claude-factory:deliver` run (a few hours of agent work). If a story
  would produce a huge diff, split it first.
- **Testable**: every acceptance criterion can be turned into a passing test.

## Splitting heuristics when a story is too big
- By workflow step, by data variation, by happy-path vs edge-cases, by
  interface (API first, UI second), or by operations (create / read / update /
  delete) — pick the seam that yields independently valuable slices.
