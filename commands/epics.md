---
description: Break the PRD into epics under docs/epics/
argument-hint: [optional focus area]
allowed-tools: Read, Write, Edit, Glob, Grep
model: opus
---

**Epic breakdown.** Optional focus: $ARGUMENTS

(`model: opus` covers only this turn; suggest `/model opus` for the follow-ups.)

1. Read `docs/product/PRD.md`. Missing → tell the user to run `/discover`; stop.
2. Group the functional requirements into epics: coherent, independently valuable chunks.
3. Per epic, `docs/epics/EPIC-<NN>-<slug>.md` (sequential numbers):
   - Title + one-paragraph goal and why it matters
   - In scope / out of scope
   - Depends on (other epic ids)
   - Done signals
   - Candidate story titles (titles only)
4. Show a table (id, title, depends on) and ask which epic to break into stories.

No story-level detail here. Write in the user's language.
