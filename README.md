# claude-factory

A Claude Code plugin for a PRD → epics → stories → implementation pipeline,
ending in a green-CI PR that a human manually verifies and merges.
Language- and stack-agnostic.

```
/discover  → docs/product/PRD.md + CLAUDE.md project brief
/epics     → docs/epics/EPIC-<NN>-<slug>.md
/stories   → docs/stories/STORY-<NN>-<slug>.md

/claude-factory:deliver docs/stories/STORY-<NN>-<slug>.md
           → refine → challenge → implement → review ⇄ rework ⇄ QA ⇄ CI
           → status: in_review — green-CI PR, still DRAFT, awaiting you

              ↓ you manually verify the PR

/claude-factory:promote docs/stories/STORY-<NN>-<slug>.md            (approve)
           → codify learnings into CLAUDE.md + undraft → status: done
/claude-factory:rework docs/stories/STORY-<NN>-<slug>.md "<issue>"   (reject)
           → fix, re-run review ⇄ QA ⇄ CI → back to in_review
```

Nothing ever runs `gh pr merge`. Green CI never self-certifies a story: only
you, via `promote`, mark it done.

Side entrances: `/triage <concern>` investigates and files stories/chores if
needed; `/fix <bug>` is a TDD hotfix for bugs found after merge (`rework` is
for bugs in a still-open PR); `/status-glance` lists every story's status.

## Definition of Done
Every AC has a test that failed before the change · lint, types, full suite
green · no open CRITICAL review findings (WARNINGs fixed once, leftovers listed for you) · QA PASS per AC with evidence ·
CI green · a human verified the PR and ran `promote`. Merging stays with you.

## Prerequisites
- A git repo with an `origin` remote. `/discover` runs `git init -b main` and the
  first commit; creating the GitHub repo is yours:
  `gh repo create <name> --private --source=. --remote=origin --push`
- An authenticated `gh` CLI: `gh auth login`. Add `-s workflow` if stories may
  touch `.github/workflows/*`, and `-s gist` if QA should post UI screenshots.
- A CI workflow in `.github/workflows/` (or opt out, see config below).

Every workflow preflights these and stops with the exact fix command.

`/discover`, `/epics`, `/stories` pin `model: opus`, but that only covers their
first turn. Run `/model opus` for the session if you want it throughout.

## Install
```
/plugin marketplace add SimaoGato/claude-factory
/plugin install claude-factory@claude-factory
```
Pick **user scope** so it's available in every project. This also installs two
dependencies, both active by default:
- [ponytail](https://github.com/DietrichGebert/ponytail) — write the least code that works.
- [caveman](https://github.com/JuliusBrussee/caveman) — terse agent prose, fewer
  output tokens. Code, commits, PRs and docs stay in normal language.

## Project files
- **`CLAUDE.md` — the project brief.** What it is, stack, commands, layout,
  environments, conventions & gotchas. Claude Code loads it into every session
  and subagent, so it is kept under ~60 lines: `/discover` seeds it,
  implementers update commands/stack when they change, and `codifier` (in
  `promote`) adds learnings and prunes stale lines.
- **`.claude/factory.yml` — optional pipeline config.** Omit it for defaults:
  ```yaml
  retry_budget: 2        # attempts per loop: challenge, review, QA, CI (each counted separately)
  ci_required: true      # false = repo has no CI; skip the CI gate
  models:                # per-stage override; unset = the agent's own model
    implement: opus      # stages: refine challenge implement implement_light review rework qa codify
  ```
  A legacy `## Pipeline config` block in CLAUDE.md is still read if this file is absent.

## Token economy
- Setup, CI-wait and bookkeeping steps run on Haiku in a single call each,
  never the session model.
- `trivial` stories skip Challenge, use `implementer-light` (Haiku), and get one reviewer.
- Agents read only what the story touches; the brief replaces re-exploring the repo.
- No ADRs or decision logs: the PR description records the change, CLAUDE.md
  the reusable lessons.

## Standards
Skills every code-writing agent follows: `coding-standards` (simple over clever,
why-only comments, errors, security), `tdd-discipline`, `pr-conventions`,
`story-format`.

## Optional MCP servers
`/discover` suggests these when relevant; nothing is required.
- UI projects: `claude mcp add playwright npx @playwright/mcp@latest` (web) or
  `claude mcp add mobile npx @mobilenext/mobile-mcp@latest` (mobile) — QA drives
  and screenshots the golden path for a baseline visual sanity check.
- Heavy external library/framework use: `claude mcp add context7 -- npx -y @upstash/context7-mcp@latest`.
- GitHub MCP is not used by the pipeline: every PR/CI operation goes through
  `gh`, which works the same interactively and inside workflows.

## Layout
```
.claude-plugin/          plugin + marketplace manifests (ponytail, caveman deps)
commands/                discover, epics, stories, triage, fix, status-glance
workflows/               deliver.js, promote.js, rework.js
agents/                  the specialist subagents the workflows orchestrate
skills/                  coding-standards, tdd-discipline, pr-conventions, story-format
templates/CLAUDE.md      project brief scaffolded by /discover
scripts/                 workflow syntax/API/drift checks + smoke test, run in CI
```
