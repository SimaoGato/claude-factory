# Project conventions

This file is the single source of truth for the `claude-factory` delivery
pipeline: the Definition of Done, the quality gates each stage checks against,
and the machine-readable config `workflows/deliver.js`, `promote.js`, and
`rework.js` all read at the start of every run. Edit the `pipeline` block
below to tune the pipeline; edit the prose sections to reflect how this
specific project actually works.

`codifier` (run by `/claude-factory:promote`, never automatically) appends
durable learnings to the "Conventions & gotchas" section below and to
`docs/adr/DECISIONS.md` after each promoted story — keep "Conventions &
gotchas" current, prune what's obsolete, and don't hand-edit around it.

## Definition of Done

A story is **done** only when all of the following are true:

- Every acceptance criterion has at least one test that would have failed
  before the change (see the `tdd-discipline` skill).
- Lint, type checks, and the full test suite are green.
- Code review findings classified CRITICAL or WARNING are resolved (see
  `pr-conventions`); SUGGESTIONs are addressed or explicitly deferred with a
  reason.
- QA has exercised the golden path and key edge cases against running code
  and recorded PASS evidence per acceptance criterion.
- CI is green on the PR.
- **A human has manually verified the PR** (`/claude-factory:deliver` stops
  at `status: in_review` specifically so this can happen — it does not
  self-certify as done on green CI alone).
- Only after that: the PR is marked ready for review (undrafted, via
  `/claude-factory:promote`) and left for a human to merge — the pipeline
  never merges its own PRs.

## Quality gates

| Stage | Gate |
|---|---|
| Challenge | Any CRITICAL issue blocks — plan must be revised and re-challenged. |
| Review | Any CRITICAL or WARNING blocks — must be reworked and re-reviewed. |
| QA | Any AC marked FAIL blocks — bug goes back to Rework. |
| CI | Any failing check blocks — failure detail goes back to Rework. |
| Manual verification | Green CI alone does not promote. A human checks the PR, then runs `/claude-factory:promote` (approve) or `/claude-factory:rework "<issue>"` (reject). |

## Pipeline config

`workflows/deliver.js` reads this block at the start of every run — it is the
only place retry budgets and model routing are defined, so there is exactly
one number to change, not several scattered across prompts.

```yaml
pipeline:
  # Shared retry budget number, applied independently to each bounded loop:
  # Challenge→Refine, Review→Rework, QA→Rework, and CI→Rework each get their
  # own count of `retry_budget` attempts before escalating to a human — a
  # story needing several rounds of review fixes doesn't eat into QA's or
  # CI's budget, and vice versa.
  retry_budget: 2
  models:
    refine: sonnet
    challenge: sonnet
    implement: sonnet
    implement_light: haiku
    review: sonnet
    rework: sonnet
    qa: sonnet
    codify: haiku
  ci:
    # Command an agent runs (with the Bash tool) to wait for checks to finish.
    # Must exit only once checks are final, and must never merge anything.
    watch_command: "gh pr checks {pr_number} --watch --json name,state"
    # Whether "CI is green" is enforced as a Definition of Done gate. If this
    # repo has no .github/workflows/ configured, preflight hard-blocks unless
    # you set this to false — that's an explicit opt-out, not a silent skip.
    required: true
```

## Decision records

Most decisions made while delivering a story get **one dated bullet** in
`docs/adr/DECISIONS.md` — not a new file. `codifier` only writes a standalone
`docs/adr/ADR-<NNN>-<slug>.md` when a decision meets at least one of:

- hard or costly to reverse later,
- crosses multiple modules or teams,
- was a genuine judgment call among real, named alternatives.

If none of those apply, it belongs in the log, not a document. This keeps
`docs/adr/` from accumulating a file per story for decisions nobody will ever
need to re-read.

## Environments (optional — delete this section if it doesn't apply)

Fill in if this project has meaningfully different environments (e.g. a
deployed service with dev/staging/prod); delete it entirely if it doesn't
(e.g. a library or CLI with no deployment target). `qa-verifier` checks for
this section and verifies against the environment it names for QA, defaulting
to local/dev if the section is absent.

| Environment | URL / how to target it | Used for |
|---|---|---|
| dev | e.g. `localhost:3000`, run `npm run dev` | day-to-day dev, QA stage default |
| staging | e.g. `https://staging.example.com` | pre-promotion manual verification |
| production | e.g. `https://example.com` | live — never targeted by the pipeline |

If this project has a UI, add the matching UI-automation MCP — Playwright
(web) or mobile-mcp (React Native/Expo) — (see this plugin's README →
"Optional MCP servers") so `qa-verifier` can screenshot and sanity-check it
instead of only running scripted API/CLI checks.

## Conventions & gotchas

<!-- codifier appends here after each promoted story. Empty until the first run. -->
