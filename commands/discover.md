---
description: Run product discovery and draft a PRD into docs/product/PRD.md
argument-hint: [one-line product or feature idea]
allowed-tools: Read, Write, Edit, Glob, Grep, WebSearch
model: opus
---

You are running the **Discovery** phase. Goal: turn a rough idea into a clear PRD.

Idea from the user: $ARGUMENTS

## Process
0. **Scaffold the project tree, if missing.** Before anything else, check for
   and create whichever of these don't already exist — never overwrite a file
   that's already there:
   - Directories: `docs/product/`, `docs/epics/`, `docs/stories/`,
     `docs/stories/done/`, `docs/adr/`.
   - `docs/adr/DECISIONS.md` — seed it if missing, with just a one-line
     header (`# Decision log` plus one sentence: dated bullets, one line
     each; a standalone `ADR-<NNN>-<slug>.md` in this same directory is the
     rare exception, not the default — see `CLAUDE.md`'s "Decision records"
     section). This is where `codifier` appends by default.
   - `CLAUDE.md` at the project root — copy it from
     `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md` if the project has no
     `CLAUDE.md` yet. If one already exists, leave it untouched (it's the
     project's own conventions file — do not overwrite prior content), but
     if it has no `## Pipeline config` section, append one from the template
     so `/claude-factory:deliver` has a retry budget and model routing to read.
   - `docs/stories/README.md` — write it if missing, with this exact
     convention so it never has to be inferred again:
     ```
     # Stories archive convention

     Active stories live directly under `docs/stories/` as
     `STORY-<NN>-<slug>.md`, `CHORE-<NN>-<slug>.md`, or `BUGFIX-<NN>-<slug>.md`.

     Once a story's status becomes `done`, it is moved (`git mv`) into
     `docs/stories/done/` in the same commit that flips its status. This keeps
     the top-level directory to only what's still actionable.

     Numbering for new stories/chores/bugfixes always scans **both**
     `docs/stories/*.md` and `docs/stories/done/*.md` for the highest existing
     number in that prefix, so archived files still reserve their number and
     a new file never collides with one that's been archived.
     ```
1. **Interview the user.** Ask focused questions, ONE topic at a time, until you
   can answer: who is this for, what problem, why now, what success looks like,
   what is explicitly out of scope, and the main constraints (tech, time, legal).
   Do not invent answers. If the user is vague, propose options and let them pick.
2. **Research lightly** if the domain needs it (competitors, standards) using
   WebSearch. Keep it brief.
3. **Draft the PRD** to `docs/product/PRD.md` using this structure:
   - Problem & context
   - Target users / personas
   - Goals and non-goals
   - Success metrics (measurable)
   - Key user journeys
   - Functional requirements (numbered)
   - Non-functional requirements (perf, security, accessibility, i18n)
   - Constraints, assumptions, open questions
   - Rough scope / phasing
4. Write the PRD in the language the user is speaking (default: English).
5. End by listing the open questions and asking the user to confirm before
   moving on to `/epics`.

Keep it tight. A PRD nobody reads is worthless; aim for signal, not volume.
