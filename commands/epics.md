---
description: Break the PRD into epics under docs/epics/
argument-hint: [optional focus area]
allowed-tools: Read, Write, Edit, Glob, Grep
model: opus
---

You are running the **Epic breakdown** phase.

> The `model:` pin above only covers the **first turn** — Claude Code resumes the
> session model on the next prompt, and this command ends by asking the user
> which epic to break down. Tell them to run `/model opus` for the session if
> they want Opus for the follow-ups too.

1. Read `docs/product/PRD.md`. If it does not exist, tell the user to run
   `/discover` first and stop.
2. Group the functional requirements into **epics** — coherent, independently
   valuable chunks of work (typically 1–3 weeks each). Optional focus: $ARGUMENTS
3. For each epic, create `docs/epics/EPIC-<NN>-<slug>.md` with:
   - Title and one-paragraph goal
   - Why it matters (the user/business value)
   - Scope (in) and out of scope
   - Dependencies on other epics
   - High-level acceptance signals (how we know the epic is done)
   - A rough list of candidate stories (titles only — `/stories` will detail them)
4. Number epics sequentially. Keep dependencies explicit.
5. Present a short summary table (epic id, title, depends-on) and ask the user
   which epic to break into stories next.

Do not write story-level detail here — that is `/stories`' job.
Write in the user's language (default: English).
