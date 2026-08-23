# claude-factory

A Claude Code plugin for a PRD → epics → stories → implementation pipeline,
ending in a green-CI PR that a human has manually verified and merges.

```
/discover  → docs/product/PRD.md
/epics     → docs/epics/EPIC-<NN>-<slug>.md
/stories   → docs/stories/STORY-<NN>-<slug>.md

/claude-factory:deliver docs/stories/STORY-<NN>-<slug>.md
           → refine → challenge → implement → review ⇄ rework ⇄ QA ⇄ CI
           → status: in_review — a green-CI PR, still DRAFT, awaiting you

              ↓ you manually verify the PR

/claude-factory:promote docs/stories/STORY-<NN>-<slug>.md    (looks good)
           → codify + undraft the PR → status: done — never auto-merged

/claude-factory:rework docs/stories/STORY-<NN>-<slug>.md "<issue>"   (found a bug)
           → fixes it, re-runs review ⇄ QA ⇄ CI → back to status: in_review
```

CI passing does not self-certify a story as done — `deliver` (and `rework`)
deliberately stop at `in_review` with the PR still in draft. Only a human
running `promote`, after actually checking the PR, moves it to `done` and
un-drafts it. Nothing in this pipeline ever runs `gh pr merge`.

Side entrances: `/triage <concern>` investigates something and files a
story/chore if action is needed; `/fix <bug>` is a standalone TDD hotfix flow
for bugs found **after** a story already merged (`rework` is the equivalent
for bugs found in an still-open PR); `/status-glance` gives a read-only table
of every story/chore/bugfix, including which ones are sitting in `in_review`
waiting on you.

## Prerequisites

**A git repo with an `origin` remote.** The pipeline branches, pushes and opens
PRs, so `/claude-factory:deliver` can't run without one. `/discover` runs the
`git init -b main` and the first commit for you on a new project; creating the
GitHub repo is left to you, deliberately — it's your account, your visibility
choice:

```
gh repo create <name> --private --source=. --remote=origin --push
```

**An authenticated `gh` CLI.** Every PR/CI operation goes through it:

```
gh auth login
```

If any of your stories might touch `.github/workflows/*` (CI config itself),
add the `workflow` scope too — GitHub silently rejects pushes to workflow
files without it:

```
gh auth login -s workflow
# or, if already logged in: gh auth refresh -s workflow
```

If the project has a UI, add the `gist` scope too — `qa-verifier` uses
`gh gist create` to host screenshot evidence (as a secret/unlisted gist) so
it can embed it in the QA PR comment:

```
gh auth login -s gist
# or, if already logged in: gh auth refresh -s gist
```

You don't have to remember to check any of this yourself — every workflow
(`deliver`, `promote`, `rework`) runs a preflight check before doing anything
else and stops immediately with the exact command to run if something's
missing, rather than failing confusingly mid-Implement. `deliver`'s preflight
covers the repo and remote too, not just `gh` auth.

**Model selection for the planning commands.** `/discover`, `/epics` and
`/stories` carry a `model: opus` pin, but a command's `model:` frontmatter only
applies for the turn that invokes it — Claude Code resumes the session model on
your next prompt. Those three are conversational (discovery is an interview;
the other two end by asking what to do next), so most of their work runs on
whatever `/model` is set to. Run `/model opus` for the session before them if
that's what you want.

## Install

```
/plugin marketplace add SimaoGato/claude-factory
/plugin install claude-factory@claude-factory
```

Choose **user scope** when prompted, unless you specifically want this
checked into one repo's shared config for collaborators — user scope makes
the pipeline available in every project you open, which is the point of a
personal delivery pipeline like this.

This also installs [ponytail](https://github.com/DietrichGebert/ponytail)
(`plugin.json`'s `dependencies` field, resolved from this repo's own
`marketplace.json`) — a "write the least code" discipline that's active by
default (`mode: full`) the moment it's installed, injected into every
subagent this plugin spawns. Nothing further to configure.

## First run in a project

`/discover` scaffolds everything the pipeline needs on first use if it isn't
already there: `docs/product/`, `docs/epics/`, `docs/stories/` (+ `done/`),
`docs/adr/DECISIONS.md`, `docs/stories/README.md` (the archive convention),
and `CLAUDE.md` from `templates/CLAUDE.md` — the Definition of Done, quality
gates, and the pipeline's retry-budget/model-routing config that every
workflow reads at the start of every run. It never overwrites an existing
`CLAUDE.md`.

## Why the delivery pipeline is three workflows, not one command

The implement → review → QA → CI stage used to be a single prose-orchestrated
`/deliver` command trusting the model to count "max 2 retry cycles" correctly
and to re-parse free-text verdicts between stages. It's now three
[dynamic workflows](https://code.claude.com/docs/en/workflows)
(`workflows/deliver.js`, `promote.js`, `rework.js`): retry budgets are real
bounded loops reading one number from `CLAUDE.md`, and every stage handoff
(plan, challenge verdict, review findings, QA result, CI result) is
schema-enforced structured JSON instead of prose the next stage has to
interpret.

It's three workflows, not one, specifically because the runtime **can't
pause mid-run for your sign-off** — "for sign-off between stages, run each
stage as its own workflow" is how Claude Code's own docs put it. So
`deliver`/`rework` stop at a green-CI, still-draft PR (`status: in_review`)
instead of self-certifying on CI alone, and only `promote` — which you run
yourself, after checking the PR — codifies learnings and un-drafts it. None
of the three ever runs `gh pr merge`.

## Codify: a log entry by default, an ADR only rarely

`codifier` (run inside `promote`) appends one dated bullet to
`docs/adr/DECISIONS.md` for most delivered stories. It only writes a
standalone `docs/adr/ADR-<NNN>-<slug>.md` when the decision is hard to
reverse, crosses multiple modules/teams, or was a genuine judgment call among
real alternatives — and has to say which of those applied. Most decisions
don't clear that bar, so most stories don't get a new file.

## Optional MCP servers

None of these are bundled or required — the pipeline works without any of
them. Add per-project, only when it actually helps:

- **GitHub MCP — deliberately not used.** Every PR/CI operation
  (`implementer`, `reworker`, the CI-wait step, `promote`'s undraft) already
  goes through the `gh` CLI via Bash. That's a better fit here than GitHub
  MCP tool calls: it works identically whether an agent is running
  interactively or unattended inside a workflow, and needs only
  `gh auth login` rather than a persistent MCP server with its own auth flow.
  Switching to GitHub MCP wouldn't add capability, just a second way to do
  the same thing — this is noted here so it isn't "rediscovered" as a gap.
`/discover` prints the relevant ones from this list at the end of its run
(checking `claude mcp list` first so it doesn't suggest what you already have),
since discovery is when the platform gets decided. It never installs one itself.

- **UI-automation MCP — add if the project has a UI; pick the one matching
  the platform.**
  ```
  claude mcp add playwright npx @playwright/mcp@latest        # web
  claude mcp add mobile npx @mobilenext/mobile-mcp@latest     # React Native/Expo
  ```
  Once present, `qa-verifier` drives the golden-path flow through it and
  screenshots for a **baseline visual sanity check** (obviously broken or
  unstyled rendering) alongside its usual functional PASS/FAIL per AC. This
  is a sanity check, not a full design/polish review — genuinely
  design-sensitive work still wants a human look.
- **context7 MCP — add if the project leans on external library/framework
  APIs.**
  ```
  claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
  ```
  Once present, `implementer`/`implementer-light` prefer it for current API
  docs over relying on (potentially stale) training knowledge.

## Layout

```
.claude-plugin/plugin.json     plugin manifest (declares the ponytail dependency)
.claude-plugin/marketplace.json  this repo's own marketplace (claude-factory + ponytail)
commands/                      discover, epics, stories, triage, fix, status-glance
workflows/deliver.js           refine → ... → CI-green, stops at in_review
workflows/promote.js           human-triggered approval: codify + undraft
workflows/rework.js            human-triggered rejection: fix + re-stabilize
agents/                        the 8 specialist subagents the workflows orchestrate
skills/                        story-format, tdd-discipline, pr-conventions
templates/CLAUDE.md            scaffolded into a project's root by /discover
scripts/check-workflows.sh     JS syntax + stabilize-loop drift check, run in CI
.github/workflows/validate.yml CI for this repo itself: claude plugin validate + the script above
```
