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

## Install

```
/plugin marketplace add <your-github-user>/claude-factory
/plugin install claude-factory@claude-factory
```

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
```
