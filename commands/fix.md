---
description: Fix a bug found after a story was merged. Reproduces it with a failing test first, fixes it, and opens a PR.
argument-hint: <bug description, optionally which story introduced it>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

Hotfix flow, not feature delivery — tight and focused. Follow `tdd-discipline`,
`coding-standards`, and `pr-conventions`. (Bug in a still-open PR? Use
`/claude-factory:rework` instead.)

Bug report: $ARGUMENTS

1. **Understand.** Find the code, reproduce the behavior, identify the root cause. Can't reproduce or explain it → stop and ask. Never guess-fix.
2. **Branch** `fix/<slug>` from latest main — before any commit.
3. **Failing test** that reproduces the bug; confirm it fails for the right reason. Commit `test(<scope>): reproduce <bug>`.
4. **Fix** with the minimum change. Lint, type checks, full suite green. Commit `fix(<scope>): <summary>`.
5. **PR.** Push, open a PR per `pr-conventions` with: **Bug** (what + repro), **Cause** (one sentence), **Fix**, **Test**, **Related story** (from the report or `git blame`). Missing AC in the original story caused it → say so.
6. **Track** on the same branch, then push:
   - `docs/stories/done/BUGFIX-<NN>-<slug>.md` per `story-format` (`status: done`, `pr: <number>`), so `/status-glance` lists it.
   - Related story file exists → append `Bug fix: fix/<slug> — <one line>`.

No refactors, no improvements, no scope creep.
