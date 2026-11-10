---
description: Break an epic into ready-to-deliver user stories under docs/stories/
argument-hint: <EPIC-id, e.g. EPIC-01>
allowed-tools: Read, Write, Edit, Glob, Grep
model: opus
---

**Story breakdown** for epic: $ARGUMENTS

(`model: opus` covers only this turn; suggest `/model opus` for the follow-ups.)

1. Read `docs/epics/$ARGUMENTS-*.md`. Missing → list available epics; stop. Read only the PRD sections it links.
2. Write each story per the `story-format` skill as `docs/stories/STORY-<NN>-<slug>.md`. Each must fit one `/claude-factory:deliver` run and be independently testable; ACs precise enough to drive tests.
3. Show the list and ask which to deliver: `/claude-factory:deliver docs/stories/STORY-<NN>-<slug>.md`.

Write in the user's language.
