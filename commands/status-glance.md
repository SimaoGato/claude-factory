---
description: Show the status of all stories, chores, and bugfixes at a glance — what's done, what's waiting on you, what's next.
allowed-tools: Read, Glob, Grep
model: haiku
---

Read-only. For every `STORY-*`, `CHORE-*`, `BUGFIX-*` in `docs/stories/` and
`docs/stories/done/`, read only the frontmatter (`id`, `epic`, `status`; missing
status = `draft`) and the `# title` line — not the body.

Table grouped by epic, then `maintenance`:

```
Epic     | Item                         | Status
---------|------------------------------|-------------
EPIC-01  | STORY-01 Sign up             | done ✅
EPIC-01  | STORY-02 Route protection    | in_review 🔎
```
`done` → `done ✅`, `in_review` → `in_review 🔎`, `blocked` → `blocked ❌`, others as-is.

Then:
- Counts per status.
- Each `in_review` item: waiting on manual verification → `/claude-factory:promote <path>` or `/claude-factory:rework <path> "<issue>"`.
- Next: the first `draft`/`ready` story whose epic's dependencies are done → `/claude-factory:deliver <path>`.

Short. Modify nothing.
