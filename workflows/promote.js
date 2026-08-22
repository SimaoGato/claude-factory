// /claude-factory:promote — human-triggered approval, run only after you've
// manually verified an `in_review` PR from /claude-factory:deliver or
// /claude-factory:rework. Codifies learnings, then undrafts the PR. Never
// runs "gh pr merge" — a human always merges.
//
// This exists as its own workflow (not a stage inside deliver.js) because the
// dynamic-workflow runtime cannot pause mid-run for user sign-off; per
// Claude Code's docs: "For sign-off between stages, run each stage as its
// own workflow." See the same note in workflows/deliver.js and rework.js.
//
// NOTE on runtime API: see the header comment in workflows/deliver.js — the
// same phase()/agent() usage rules apply here.

export const meta = {
  name: 'promote',
  description: "Approve a manually-verified in_review PR: codify learnings, then undraft it (never merges).",
}

const pipelineConfigSchema = {
  type: 'object',
  required: ['retry_budget', 'models', 'ci'],
  properties: {
    retry_budget: { type: 'integer', minimum: 1 },
    models: {
      type: 'object',
      required: ['refine', 'challenge', 'implement', 'implement_light', 'review', 'rework', 'qa', 'codify'],
      properties: {
        refine: { type: 'string' }, challenge: { type: 'string' },
        implement: { type: 'string' }, implement_light: { type: 'string' },
        review: { type: 'string' }, rework: { type: 'string' },
        qa: { type: 'string' }, codify: { type: 'string' },
      },
    },
    ci: {
      type: 'object',
      required: ['watch_command'],
      properties: { watch_command: { type: 'string' } },
    },
  },
}

const preflightSchema = {
  type: 'object',
  required: ['authenticated', 'hasRepoScope', 'hasWorkflowScope', 'message'],
  properties: {
    authenticated: { type: 'boolean' },
    hasRepoScope: { type: 'boolean' },
    hasWorkflowScope: { type: 'boolean' },
    message: { type: 'string' },
  },
}

const storyStateSchema = {
  type: 'object',
  required: ['id', 'pr', 'status'],
  properties: {
    id: { type: 'string' },
    pr: { type: 'integer' },
    status: { type: 'string' },
  },
}

// Two-tier codify policy: by default just one dated bullet in the running
// docs/adr/DECISIONS.md log. A standalone ADR file is the exception, not the
// default — only when the decision is hard to reverse, crosses multiple
// modules/teams, or was a genuine judgment call among real alternatives.
// `adrCreated`/`adrJustification` make that choice auditable in the report.
const codifySchema = {
  type: 'object',
  required: ['claudeMdUpdated', 'decisionLogEntry', 'adrCreated'],
  properties: {
    claudeMdUpdated: { type: 'boolean' },
    decisionLogEntry: { type: 'string' },
    adrCreated: { type: 'boolean' },
    adrJustification: { type: 'string' },
    adrPath: { type: 'string' },
  },
}

// ---- input ----------------------------------------------------------------

const storyPath = typeof args === 'string' ? args : args?.storyPath

if (!storyPath) {
  return { error: 'usage: /claude-factory:promote <path to story file>' }
}

phase('config')
const config = await agent('Read the "## Pipeline config" fenced yaml block from CLAUDE.md at the project root and return it as structured data.', {
  schema: pipelineConfigSchema,
})

phase('preflight')
const preflight = await agent('Run "gh auth status" (and inspect its token-scopes output) via Bash. Report whether you are authenticated, whether the token has the "repo" scope, and whether it has the "workflow" scope.', {
  schema: preflightSchema,
})
if (!preflight.authenticated || !preflight.hasRepoScope) {
  return { error: `gh is not ready for this pipeline: ${preflight.message}. Run "gh auth login", then re-run /claude-factory:promote.` }
}

phase('read-story')
const story = await agent(`Read ${storyPath} frontmatter and return its id, pr number, and current status.`, {
  schema: storyStateSchema,
})

if (story.status !== 'in_review') {
  return { error: `${storyPath} has status "${story.status}", not "in_review" — nothing to promote. Run /claude-factory:deliver or /claude-factory:rework first.` }
}

// ---- re-verify CI is STILL green before doing anything irreversible -------
// `deliver`/`rework` confirmed CI was green when they finished, but time may
// have passed since — someone could have pushed another commit to the branch,
// or a flaky test could have flipped. Check current status (not --watch, it
// should already be resolved) rather than trusting stale information.

const ciSchema = {
  type: 'object',
  required: ['passed'],
  properties: {
    passed: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' } },
  },
}

phase('verify-ci')
const ci = await agent(`Check current CI status on PR #${story.pr}: run "gh pr checks ${story.pr} --json name,state" (no --watch — just the current status) and report whether it's passing.`, {
  schema: ciSchema,
})
if (!ci.passed) {
  return { error: `CI is not green on PR #${story.pr} anymore (${ci.failures.join('; ') || 'unknown failure'}) — something changed since it was marked in_review. Investigate, or run /claude-factory:rework instead of promoting on stale information.` }
}

// ---- codify (two-tier: decision log by default, ADR only above the bar) ---

phase('codify')
const codified = await agent(`Extract reusable learnings from delivering ${storyPath} (PR #${story.pr}). Per the codifier agent's instructions: update CLAUDE.md conventions if warranted, and append one dated bullet to docs/adr/DECISIONS.md. Only create a standalone docs/adr/ADR-<NNN>-<slug>.md if this decision is hard to reverse, crosses multiple modules/teams, or was a genuine judgment call among real alternatives — if you do, say exactly why in adrJustification.`, {
  agentType: 'codifier',
  schema: codifySchema,
  model: config.models.codify,
})

// ---- promote: undraft PR (never merge), archive story ---------------------

phase('promote')
await agent(`Mark PR #${story.pr} ready for review (undraft it, e.g. "gh pr ready ${story.pr}"). Do NOT merge, close, or auto-merge it under any circumstances — a human merges it. Then in ${storyPath}, set frontmatter "status: done", git mv the file into docs/stories/done/, and commit that change.`)

log(`Promoted ${storyPath}: PR #${story.pr} is now ready for human review/merge.${codified.adrCreated ? ` New ADR: ${codified.adrPath}` : ''}`)

return {
  story: storyPath,
  pr: story.pr,
  status: 'done',
  codified: {
    claudeMdUpdated: codified.claudeMdUpdated,
    decisionLogEntry: codified.decisionLogEntry,
    adrCreated: codified.adrCreated,
    adrJustification: codified.adrJustification,
    adrPath: codified.adrPath,
  },
}
