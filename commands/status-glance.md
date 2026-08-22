---
description: Show the status of all stories and chores at a glance — what's done, what's next, what's blocked.
allowed-tools: Read, Glob, Grep
model: haiku
---

Scan every file in `docs/stories/*.md` and `docs/stories/done/*.md` —
`STORY-*.md`, `CHORE-*.md`, **and** `BUGFIX-*.md` (bugfixes created by `/fix`
must show up here too). For each one, read the `status:` field from the
frontmatter (if missing, treat as `draft`), the epic, and the title. Files in
`docs/stories/done/` are reported in the same summary table below,
distinguished by their `status:` value as already described — the directory
split changes where files live, not what gets reported.

Render `status:` as: `done` → `done ✅`, `blocked` → `blocked ❌`,
`in_review` → `in_review 🔎`, anything else shown as-is (`draft`, `ready`,
`in_progress`).

Present a summary table grouped by epic, then standalone chores:

```
Epic          | Story                              | Status
--------------|------------------------------------|----------
EPIC-01       | STORY-01 Scaffold and deploy        | done ✅
EPIC-01       | STORY-02 Sign up and sign in        | done ✅
EPIC-01       | STORY-03 Route protection            | draft
...           | ...                                  | ...
maintenance   | CHORE-09 Upgrade Node to LTS         | draft
```

After the table, summarise:
- Total / done / in_review / in-progress / draft / blocked
- Any `in_review` stories: call them out by name and remind the user they're
  waiting on manual verification, then `/claude-factory:promote <path>`
  (approve) or `/claude-factory:rework <path> "<issue>"` (reject).
- Next deliverable: the first `draft` story whose dependencies (if any) are all
  `done`. Suggest the `/claude-factory:deliver` workflow for it.

Keep it short. Do not modify any files.