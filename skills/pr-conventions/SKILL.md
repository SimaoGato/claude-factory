---
name: pr-conventions
description: Conventions for branches, commits, and pull request descriptions. Use whenever creating a branch, writing commit messages, or opening/updating a PR in the claude-factory workflows.
---

# PR conventions

## Branches
- Start from latest main: `git fetch origin && git checkout main && git pull origin main`.
- One story per branch: `story/<story-id>-<slug>` (e.g. `story/STORY-01-login`). Bug fixes: `fix/<slug>`.

## Commits
- `type(scope): summary` — feat, fix, test, refactor, docs, chore. Imperative, subject ≤ 72 chars.
- Small, logically scoped. A test and the code it covers may share a commit.

## PR
Always open as **draft**. It stays draft until a human runs
`/claude-factory:promote` — never undraft it yourself.

```
## Story
<path to story file>

## What changed
- meaningful changes only

## Acceptance criteria → tests
- AC1: <criterion> → <test name/path>

## How to test locally
1. <commands>

## Notes / risks
- migrations, flags, rollout — or "none"
```

AC traceability lives here, not in code comments.

## Hygiene
- Reviewable in one sitting. A huge diff means the story was too big — flag it for splitting.
- Reply to every review thread; resolve only when actually addressed.
