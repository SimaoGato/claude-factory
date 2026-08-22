---
description: Run product discovery and draft a PRD into docs/product/PRD.md
argument-hint: [one-line product or feature idea]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch
model: opus
---

You are running the **Discovery** phase. Goal: turn a rough idea into a clear PRD.

Idea from the user: $ARGUMENTS

> The `model:` pin above only covers the **first turn** of this command — Claude
> Code resumes the session model on the next prompt, and discovery is an
> interview spanning many turns. If the user wants Opus throughout, tell them to
> run `/model opus` for the session.

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

     A UI-affecting story with a visual reference (mockup, screenshot, an
     export from Claude Design or Figma) keeps its image(s) at
     `docs/stories/assets/<story-id>/`, linked from that story's "## Design
     references" section — see `story-format`.
     ```

   Then **bootstrap git** — after the files above exist, so the first commit
   contains them. `/claude-factory:deliver` branches, pushes and opens PRs, so
   an un-versioned directory blocks the whole pipeline later:
   - If `git rev-parse --is-inside-work-tree` fails, run `git init -b main`.
     Pass `-b main` explicitly: `pr-conventions` branches off `main`, and a bare
     `git init` honours `init.defaultBranch`, still `master` on many machines.
   - If the repo has no commits (`git rev-parse HEAD` fails), run
     `git add -A && git commit -m "chore: scaffold claude-factory project docs"`.
     `main` doesn't exist as a branch until a commit does.
   - Never touch an existing repo's history, current branch, or working tree
     beyond that. No `.gitignore` — the stack isn't chosen yet; the first story
     writes one.
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
5. **Tailor `CLAUDE.md`** to what the interview actually established — only
   that, never invented. It was copied from a template in step 0 and its
   optional sections are placeholders until someone resolves them:
   - `## Environments`: fill the table if this product has meaningfully
     different environments; **delete the section entirely** if it doesn't (a
     library, a CLI, a local-only tool). `qa-verifier` reads this section to
     pick what it verifies against — an unresolved placeholder is worse than
     no section at all.
   - Keep the UI-automation MCP line only if there's a UI, naming the one that
     matches the platform (Playwright for web, mobile-mcp for React
     Native/Expo). Drop it for a headless project.
   - Leave `## Conventions & gotchas` empty — `codifier` owns it, and it fills
     up as stories get promoted.
   - Do **not** invent test, lint, or build commands: the stack usually isn't
     decided at discovery. If the interview did pin one, record it in a line.
6. **Close out.** List the open questions, then print — never run — whichever of
   these apply, and ask the user to confirm before moving on to `/epics`:
   - If `git remote get-url origin` fails, there's no GitHub repo yet. Creating
     one is the user's call, not yours; give them the command:
     `gh repo create <name> --private --source=. --remote=origin --push`
   - **Recommended MCP servers for this project.** Run `claude mcp list` first
     and stay silent about anything already installed. Never add one yourself:
     - This project has a UI → `claude mcp add playwright npx @playwright/mcp@latest`
       (web) or `claude mcp add mobile npx @mobilenext/mobile-mcp@latest`
       (React Native/Expo). `qa-verifier` drives the golden path through it and
       screenshots for a baseline visual sanity check.
     - It leans on external library/framework APIs →
       `claude mcp add context7 -- npx -y @upstash/context7-mcp@latest`.
       `implementer` prefers it over potentially stale training knowledge.

Keep it tight. A PRD nobody reads is worthless; aim for signal, not volume.
