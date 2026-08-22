// /claude-factory:deliver — Refine → Challenge → Implement → (Review ⇄ Rework ⇄ QA ⇄ CI)
// Stops at a green-CI, still-draft PR with the story marked `in_review` — it
// never codifies or undrafts. See workflows/promote.js (approve, after you've
// manually verified) and workflows/rework.js (reject with a reason).
//
// Replaces the old prose-orchestrated `/deliver` command with a real script so
// retry budgets are actual bounded loops (not a count the model has to keep
// in its head) and stage handoffs are structured JSON (via each agent()
// call's `schema` option) instead of free text the next stage re-parses.
//
// NOTE on runtime API: this targets Claude Code's documented dynamic-workflow
// primitives (agent, pipeline, parallel, phase, log, exported `meta`, global
// `args`) and the documented `schema`/`label`/`model` options on agent().
// `phase(title)` only sets a progress-group label — it does NOT take a
// callback and does NOT return a value; call it, then separately
// `await agent(...)`. There is no `tools` option on agent() — an agent gets
// whichever tools its `agentType`'s definition grants (or all tools, with no
// agentType). scripts/check-workflows.sh statically enforces both of these.

export const meta = {
  name: 'deliver',
  description: 'Take a story to a green-CI draft PR, awaiting manual verification (see promote/rework).',
}

// ---- schemas: force structured handoffs between stages ------------------

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
  required: ['insideRepo', 'hasCommits', 'hasOrigin', 'authenticated', 'hasRepoScope', 'hasWorkflowScope', 'message'],
  properties: {
    insideRepo: { type: 'boolean' },
    hasCommits: { type: 'boolean' },
    hasOrigin: { type: 'boolean' },
    authenticated: { type: 'boolean' },
    hasRepoScope: { type: 'boolean' },
    hasWorkflowScope: { type: 'boolean' },
    message: { type: 'string' },
  },
}

const planSchema = {
  type: 'object',
  required: ['affectedAreas', 'complexity', 'summary'],
  properties: {
    affectedAreas: { type: 'array', items: { type: 'string' } },
    complexity: { type: 'string', enum: ['trivial', 'standard', 'complex'] },
    blockingQuestions: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const verdictSchema = {
  type: 'object',
  required: ['approved', 'critical', 'warnings'],
  properties: {
    approved: { type: 'boolean' },
    critical: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}

const implSchema = {
  type: 'object',
  required: ['branch', 'prNumber', 'prUrl', 'testsGreen', 'escalated'],
  properties: {
    branch: { type: 'string' },
    prNumber: { type: 'integer' },
    prUrl: { type: 'string' },
    testsGreen: { type: 'boolean' },
    escalated: { type: 'boolean' },
    escalationReason: { type: 'string' },
  },
}

const reviewSchema = {
  type: 'object',
  required: ['critical', 'warnings', 'suggestions'],
  properties: {
    critical: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
}

const reworkSchema = {
  type: 'object',
  required: ['fixed', 'testsGreen'],
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    testsGreen: { type: 'boolean' },
  },
}

const qaSchema = {
  type: 'object',
  required: ['passed'],
  properties: {
    passed: { type: 'boolean' },
    results: { type: 'array', items: { type: 'object', properties: { ac: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail'] } } } },
    bugReport: { type: 'string' },
  },
}

const ciSchema = {
  type: 'object',
  required: ['passed'],
  properties: {
    passed: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' } },
  },
}

// ---- input ----------------------------------------------------------------

const storyPath = typeof args === 'string' ? args : args?.storyPath
const extraContext = typeof args === 'object' ? args?.context : undefined

if (!storyPath) {
  return { error: 'usage: /claude-factory:deliver <path to story file> [extra context]' }
}

function escalate(reason, extra) {
  log(`ESCALATING — ${reason}`)
  return { story: storyPath, escalated: true, reason, ...extra }
}

// ---- stage 0: load config (single source of truth, no hardcoded budgets) --

phase('config')
const config = await agent('Read the "## Pipeline config" fenced yaml block from CLAUDE.md at the project root and return it as structured data.', {
  schema: pipelineConfigSchema,
})
const retryBudget = config.retry_budget

// ---- preflight: fail fast, before spending anything on Refine/Implement ---
// Answers "how do I know I need a repo / to log in?" — the pipeline tells you
// here, immediately, instead of failing confusingly mid-Implement when it tries
// to branch, push, or open a PR.

phase('preflight')
const preflight = await agent('Via Bash, run each of these and report the outcome: "git rev-parse --is-inside-work-tree" (insideRepo), "git rev-parse HEAD" (hasCommits), "git remote get-url origin" (hasOrigin), and "gh auth status" with its token-scopes output (authenticated, plus whether the token has the "repo" and "workflow" scopes). Do not create, commit, or push anything — this is a read-only check.', {
  schema: preflightSchema,
})
// Repo first: no work tree / no commits / no remote is a more fundamental block
// than a missing gh scope, and the fix is a different command.
if (!preflight.insideRepo || !preflight.hasCommits) {
  return { error: 'This directory is not a git repository with at least one commit, so there is nothing to branch from or push. Run: git init -b main && git add -A && git commit -m "chore: initial commit" — then re-run /claude-factory:deliver. (/claude-factory:discover does this for you on a new project.)' }
}
if (!preflight.hasOrigin) {
  return { error: 'This repository has no "origin" remote, so the pipeline cannot push a branch or open a PR. Create the GitHub repo yourself: gh repo create <name> --private --source=. --remote=origin --push — then re-run /claude-factory:deliver.' }
}
if (!preflight.authenticated || !preflight.hasRepoScope) {
  return { error: `gh is not ready for this pipeline: ${preflight.message}. Run "gh auth login" (add "-s workflow" too if this story might touch .github/workflows/*), then re-run /claude-factory:deliver.` }
}
if (!preflight.hasWorkflowScope) {
  log('Note: gh token lacks the "workflow" scope — fine unless this story touches .github/workflows/*, in which case the push will be rejected. Run "gh auth refresh -s workflow" if needed.')
}

// ---- stage 1 & 2: Refine ⇄ Challenge --------------------------------------

phase('refine')
let plan = await agent(`Refine story ${storyPath}${extraContext ? ` — extra context: ${extraContext}` : ''}. Read the story and its acceptance criteria, explore the codebase for relevant patterns, and write an Implementation Plan into the story file per the story-refiner agent's instructions.`, {
  agentType: 'story-refiner',
  schema: planSchema,
  model: config.models.refine,
})
if (plan.blockingQuestions?.length) {
  return escalate('story-refiner raised blocking questions', { questions: plan.blockingQuestions })
}

let approved = false
for (let i = 0; i < retryBudget; i++) {
  phase('challenge')
  const verdict = await agent(`Challenge the current Implementation Plan in ${storyPath} against its acceptance criteria and the scope firewall.`, {
    agentType: 'challenger',
    schema: verdictSchema,
    model: config.models.challenge,
  })
  if (verdict.approved) { approved = true; break }
  log(`Challenge cycle ${i + 1}/${retryBudget}: NEEDS REVISION — ${verdict.critical.join('; ')}`)
  phase('refine')
  plan = await agent(`Revise the Implementation Plan in ${storyPath} to address these CRITICAL findings: ${verdict.critical.join('; ')}`, {
    agentType: 'story-refiner',
    schema: planSchema,
    model: config.models.refine,
  })
}
if (!approved) return escalate('challenge/refine retry budget exhausted', { plan })

// ---- stage 3: Implement -----------------------------------------------

phase('implement')
let impl = await agent(`Implement the approved plan in ${storyPath} on a new branch and open a draft PR, per the implementer${plan.complexity === 'trivial' ? '-light' : ''} agent's instructions.`, {
  agentType: plan.complexity === 'trivial' ? 'implementer-light' : 'implementer',
  schema: implSchema,
  model: plan.complexity === 'trivial' ? config.models.implement_light : config.models.implement,
})
if (impl.escalated) {
  log(`implementer-light escalated: ${impl.escalationReason} — falling back to the standard implementer.`)
  phase('implement')
  impl = await agent(`Implement the approved plan in ${storyPath} on a new branch and open a draft PR. (Escalated from implementer-light: ${impl.escalationReason})`, {
    agentType: 'implementer',
    schema: implSchema,
    model: config.models.implement,
  })
}
if (!impl.testsGreen) return escalate('implementation left tests red', { impl })

// ---- stages 4-6 + CI: one shared bounded loop -----------------------------
// Mirrors the original design (Review ⇄ Rework, QA failure shares the same
// budget) and extends it to CI failures, since a CI failure is just another
// class of "review found a problem" that needs a rework cycle.

const areas = plan.affectedAreas.length ? plan.affectedAreas : ['general']
const prNumber = impl.prNumber
const branch = impl.branch
let cycle = 0
let ciPassed = false

// The block between the markers below is kept byte-identical to the same
// block in workflows/rework.js — scripts/check-workflows.sh (run in
// .github/workflows/validate.yml) diffs them and fails CI if they drift.
// If you edit this loop, make the same edit in both files.
// STABILIZE-LOOP-START
while (cycle < retryBudget) {
  phase('review')
  const reviews = await pipeline(areas, area =>
    agent(`Review PR #${prNumber} (branch ${branch}), area: ${area}. Only review files in that area's diff.`, {
      agentType: 'code-reviewer',
      schema: reviewSchema,
      model: config.models.review,
      label: area,
    }),
  )
  const critical = reviews.filter(Boolean).flatMap(r => r.critical)
  const warnings = reviews.filter(Boolean).flatMap(r => r.warnings)

  if (critical.length === 0 && warnings.length === 0) {
    phase('qa')
    const qa = await agent(`QA-verify PR #${prNumber} against the acceptance criteria in ${storyPath}.`, {
      agentType: 'qa-verifier',
      schema: qaSchema,
      model: config.models.qa,
    })
    if (qa.passed) {
      phase('ci')
      const ci = await agent(`Wait for CI on PR #${prNumber}: run "${config.ci.watch_command.replace('{pr_number}', prNumber)}" and report the final state. Do not merge or close the PR.`, {
        schema: ciSchema,
      })
      if (ci.passed) { ciPassed = true; break }
      log(`CI cycle ${cycle + 1}/${retryBudget}: FAILED — ${ci.failures.join('; ')}`)
      phase('rework')
      await agent(`Fix these CI failures on PR #${prNumber} (branch ${branch}): ${ci.failures.join('; ')}`, {
        agentType: 'reworker',
        schema: reworkSchema,
        model: config.models.rework,
      })
    } else {
      log(`QA cycle ${cycle + 1}/${retryBudget}: FAILED — ${qa.bugReport}`)
      phase('rework')
      await agent(`Fix this QA-reported bug on PR #${prNumber} (branch ${branch}): ${qa.bugReport}`, {
        agentType: 'reworker',
        schema: reworkSchema,
        model: config.models.rework,
      })
    }
  } else {
    log(`Review cycle ${cycle + 1}/${retryBudget}: ${critical.length} critical, ${warnings.length} warning`)
    phase('rework')
    await agent(`Fix these review findings on PR #${prNumber} (branch ${branch}). CRITICAL: ${critical.join('; ') || 'none'}. WARNING: ${warnings.join('; ') || 'none'}.`, {
      agentType: 'reworker',
      schema: reworkSchema,
      model: config.models.rework,
    })
  }
  cycle++
}
// STABILIZE-LOOP-END
if (!ciPassed) return escalate('review/QA/CI retry budget exhausted', { pr: prNumber, prUrl: impl.prUrl, cycle })

// ---- hand off for manual verification (never codifies, never undrafts) ----
// Codify + undraft happen in workflows/promote.js, run by a human only after
// they've manually verified the PR — the workflow runtime can't pause this
// script for that sign-off (see the note at the top of promote.js), so the
// gate has to be a separate, human-triggered workflow.

phase('hand-off')
await agent(`In ${storyPath}, set frontmatter "status: in_review" and "pr: ${prNumber}". Post a comment on PR #${prNumber} with exactly this structure (fill in the blanks): "## Ready for manual verification\\n\\n**Branch:** ${branch}\\n\\n**How to test locally:** <fill in — pull the branch and the commands to run it>\\n\\nOnce verified, run /claude-factory:promote or /claude-factory:rework with a reason.". Do NOT undraft, merge, or close the PR.`)

const nextSteps = `Manually verify PR #${prNumber}, then run /claude-factory:promote ${storyPath} (approve) or /claude-factory:rework ${storyPath} "<issue>" (reject with a reason).`
log(`${storyPath} is in_review: PR #${prNumber} (${impl.prUrl}) — CI green, still draft. ${nextSteps}`)

return {
  story: storyPath,
  pr: prNumber,
  prUrl: impl.prUrl,
  branch: impl.branch,
  retryCyclesUsed: cycle,
  status: 'in_review',
  escalated: false,
  nextSteps,
}
