---
description: Break an epic into ready-to-deliver user stories under docs/stories/
argument-hint: <EPIC-id, e.g. EPIC-01>
allowed-tools: Read, Write, Edit, Glob, Grep
model: opus
---

You are running the **Story breakdown** phase. Target epic: $ARGUMENTS

1. Read the epic file `docs/epics/$ARGUMENTS-*.md` and the PRD for context.
   If the epic file does not exist, list available epics and stop.
2. Consult the `story-format` skill for the exact story template and the
   "INVEST" quality bar. Each story must be small enough to deliver in one
   `/claude-factory:deliver` run (a few hours of agent work), and independently testable.
3. For each story create `docs/stories/STORY-<NN>-<slug>.md` containing:
   - Story id and parent epic id
   - User story sentence ("As a … I want … so that …")
   - Context / background (links to PRD sections)
   - **Acceptance criteria** as Given/When/Then, numbered and testable
   - Out of scope
   - Technical notes / affected areas (best guess; Refine will firm it up)
   - Definition of Done reference (see CLAUDE.md)
4. Number stories sequentially within the epic. To pick `<NN>`, scan both
   `docs/stories/*.md` and `docs/stories/done/*.md` for existing
   `STORY-<NN>-*.md` files and use the next unused number — archived stories
   still count toward numbering so a new story never collides with one
   that's been moved to `done/`.
5. Present the list and ask which story to deliver. Remind the user they can
   then run `/claude-factory:deliver docs/stories/STORY-<NN>-<slug>.md`.

Write stories in the user's language (default: English), but keep
acceptance criteria precise enough to drive tests.
