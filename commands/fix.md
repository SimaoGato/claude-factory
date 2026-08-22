---
description: Fix a bug found after a story was merged. Reproduces it with a failing test first, then fixes it, and opens a PR. Follow TDD discipline — the test must fail before the fix and pass after.
argument-hint: <description of the bug, and optionally which story introduced it>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

You are fixing a bug in production/main code. This is a hotfix flow, not a
feature delivery — keep it tight and focused.

Bug report: $ARGUMENTS

## Step 1 — Understand
- Read `CLAUDE.md` for project conventions.
- Investigate the bug: find the relevant code, reproduce the behaviour if
  possible (run the app, hit the endpoint, run the failing path).
- Identify the root cause. If you cannot reproduce or understand it, stop and
  ask for more information — do not guess-fix.

## Step 2 — Reproduce with a failing test
- Write a test that **fails right now** because of the bug. This is mandatory —
  no fix without a regression test. Follow the `tdd-discipline` skill.
- Run the test and confirm it fails for the right reason. Commit it:
  `test(scope): reproduce bug — <short description>`.

## Step 3 — Fix
- Write the minimum change that makes the test pass.
- Run lint, type checks, and the full test suite. Everything must be green.
- Commit: `fix(scope): <short description>`.

## Step 4 — PR
- Create a branch: `fix/<short-slug>` (not `story/`).
- Push and open a PR following `pr-conventions`. The PR description must include:
  - **Bug:** what was wrong and how to reproduce.
  - **Cause:** root cause in one sentence.
  - **Fix:** what changed.
  - **Test:** which test now locks this in.
  - **Related story:** if known (from $ARGUMENTS or git blame).

## Step 5 — Update tracking
- If the bug relates to a delivered story, append a note to that story file:
  `Bug fix: fix/<slug> — <one-line summary>`.
- Create a `BUGFIX-<NN>-<slug>.md` in `docs/stories/` using the `story-format`
  skill's frontmatter shape (`id: BUGFIX-<NN>`, `status: done`, `pr: <number>`),
  so `/status-glance` tracks it. Pick `<NN>` by scanning both
  `docs/stories/*.md` and `docs/stories/done/*.md` for existing `BUGFIX-<NN>`
  files and using the next unused number. Since it's already `done`, `git mv`
  it straight into `docs/stories/done/` in the same commit.

## Rules
- Never fix without a failing test first.
- Keep the fix minimal — do not refactor, do not improve, do not scope-creep.
- If the bug is caused by a missing acceptance criterion in the original story,
  note that in the PR so the spec can be updated.