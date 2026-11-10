---
description: Run product discovery and draft a PRD into docs/product/PRD.md
argument-hint: [one-line product or feature idea]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch
model: opus
---

**Discovery**: turn a rough idea into a short PRD. Idea: $ARGUMENTS

(`model: opus` covers only this first turn. If the user wants Opus for the whole
interview, tell them to run `/model opus`.)

## 0. Scaffold — create only what's missing, never overwrite
- Dirs: `docs/product/`, `docs/epics/`, `docs/stories/done/`.
- `CLAUDE.md`: absent → copy `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md`. Present → leave it.
- `docs/stories/README.md`:
  ```
  # Stories
  Active: `docs/stories/{STORY,CHORE,BUGFIX}-<NN>-<slug>.md`. When status becomes
  `done` the file is `git mv`'d to `docs/stories/done/` in the same commit.
  New numbers scan both directories so archived files keep their number.
  Design images: `docs/stories/assets/<story-id>/`.
  ```
- Git: not a repo → `git init -b main` (explicit `main`: pr-conventions branches off it). No commits → `git add -A && git commit -m "chore: scaffold project docs"`. Never touch existing history, branch, or working tree. No ignore file yet — the stack isn't chosen.

## 1. Interview
One topic at a time until you know: who it's for, the problem, why now, what
success looks like, what's out of scope, constraints. Never invent answers;
if the user is vague, offer options to pick from.

## 2. Research
Only if the domain needs it (competitors, standards). WebSearch, brief.

## 3. PRD → `docs/product/PRD.md`, in the user's language
Problem & context · Users · Goals / non-goals · Success metrics (measurable) ·
Key journeys · Functional requirements (numbered) · Non-functional (perf,
security, a11y, i18n) · Constraints, assumptions, open questions · Phasing.
Signal over volume.

## 4. Fill the CLAUDE.md brief — only what the interview established
- What, Stack, Commands: fill what's decided; leave `<tbd>` otherwise (the first story fills them).
- Environments: fill if there are genuinely distinct ones; else delete the section.
- Link the PRD; never copy it. Stay under ~60 lines.

## 5. Close out
List open questions. Then print — never run — whatever applies, and ask the
user to confirm before `/epics`:
- No `origin` remote: `gh repo create <name> --private --source=. --remote=origin --push`
- MCP servers (run `claude mcp list` first; skip installed ones):
  - Web UI → `claude mcp add playwright npx @playwright/mcp@latest`; mobile UI → `claude mcp add mobile npx @mobilenext/mobile-mcp@latest`. QA drives and screenshots the golden path through it.
  - Leans on external library/framework APIs → `claude mcp add context7 -- npx -y @upstash/context7-mcp@latest`. Implementers use it for current docs.
