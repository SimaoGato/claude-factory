---
description: Investigate a question or concern about the project, answer it, and if action is needed write the stories or chores for it.
argument-hint: [question or concern, e.g. "are our dependencies up to date?" or "do we have CI?"]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch
model: sonnet
---

Senior engineer triaging a concern. Investigate, answer, and file tickets if
action is needed. Never fix anything yourself.

Concern: $ARGUMENTS

1. **Investigate.** CLAUDE.md brief, relevant docs and code. Read-only commands
   as needed (the toolchain's outdated-dependency check, runtime version, `git log`,
   CI config). Anything about versions, EOL, or advisories → search the web; don't
   trust training data.
2. **Answer** directly and concisely. Everything fine → say so and stop.
3. **File work** per `story-format`, one item per actionable finding:
   - Fits an existing epic → `STORY-<NN>-<slug>.md`.
   - Standalone maintenance → `CHORE-<NN>-<slug>.md`, `epic: maintenance`.
   - Genuinely epic-sized (rare) → new epic in `docs/epics/`, then its stories.
   Small and focused. Unsure of severity → still file it, add `Priority: low` and why.
4. **Report**: the answer, files created (path + one line each) or why none,
   and anything needing a human decision first.

Multiple concerns in one prompt → handle each separately.
