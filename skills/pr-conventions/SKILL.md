---
name: pr-conventions
description: Conventions for branches, commits, and pull request descriptions. Use this whenever opening, updating, or describing a pull request, creating a feature branch, or writing commit messages in the /claude-factory:deliver workflow. Ensures PRs are reviewable and traceable back to the story.
---

# PR conventions

## Branches
- One story per branch: `story/<story-id>-<short-slug>` (e.g. `story/01-login`).
- Rebase on the default branch before opening; keep history readable.
- Always open a new branch against the **latest main**. So before checking to a new branch, run `git fetch origin && git checkout main && git pull origin main`.

## Commits
- Conventional style: `type(scope): summary` (feat, fix, test, refactor, docs,
  chore). Imperative mood, ≤ 72 chars on the subject line.
- Small, logically scoped commits. Tests and the code they cover can share a commit.

## Pull request description
Open as a **draft** until QA passes, then mark ready. Use this template:

```
## Story
Links: <path to story file> (STORY-<id>)

## What changed
- bullet list of the meaningful changes

## Acceptance criteria → tests
- AC1: <criterion> → <test name/path>
- AC2: ...

## How to test locally
1. <commands a reviewer runs>

## Notes / risks
- migrations, feature flags, rollout, anything reviewers must know

## QA evidence
- added after the QA stage (links / paths)
```

The "Acceptance criteria → tests" section above is where AC traceability
belongs — not inline code comments in the diff (see `code-comments`).

## Review hygiene
- Keep PRs small enough to review in one sitting. If a story produces a huge
  diff, that is a signal the story was too big — flag it for re-slicing.
- Respond to every review thread; resolve only when actually addressed.
