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
// `args`) and the documented `schema`/`label`/`model` options on agent(). The
// `agentType` and `tools` options below assume agent() can route a call
// through one of this plugin's existing `agents/*.md` definitions (by their
// frontmatter `name:`) the same way the Task tool does, and can restrict
// tools per one-off call. Validate both against the installed Claude Code
// version (`use a workflow` on a small slice first) before relying on this in
// production, and adjust the option names if the runtime differs.

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

const config = await phase('config', () =>
  agent('Read the "## Pipeline config" fenced yaml block from CLAUDE.md at the project root and return it as structured data.', {
    schema: pipelineConfigSchema,
    tools: ['Read'],
  }),
)
const retryBudget = config.retry_budget

// ---- stage 1 & 2: Refine ⇄ Challenge --------------------------------------

let plan = await phase('refine', () =>
  agent(`Refine story ${storyPath}${extraContext ? ` — extra context: ${extraContext}` : ''}. Read the story and its acceptance criteria, explore the codebase for relevant patterns, and write an Implementation Plan into the story file per the story-refiner agent's instructions.`, {
    agentType: 'story-refiner',
    schema: planSchema,
    model: config.models.refine,
  }),
)
if (plan.blockingQuestions?.length) {
  return escalate('story-refiner raised blocking questions', { questions: plan.blockingQuestions })
}

let approved = false
for (let i = 0; i < retryBudget; i++) {
  const verdict = await phase('challenge', () =>
    agent(`Challenge the current Implementation Plan in ${storyPath} against its acceptance criteria and the scope firewall.`, {
      agentType: 'challenger',
      schema: verdictSchema,
      model: config.models.challenge,
    }),
  )
  if (verdict.approved) { approved = true; break }
  log(`Challenge cycle ${i + 1}/${retryBudget}: NEEDS REVISION — ${verdict.critical.join('; ')}`)
  plan = await phase('refine', () =>
    agent(`Revise the Implementation Plan in ${storyPath} to address these CRITICAL findings: ${verdict.critical.join('; ')}`, {
      agentType: 'story-refiner',
      schema: planSchema,
      model: config.models.refine,
    }),
  )
}
if (!approved) return escalate('challenge/refine retry budget exhausted', { plan })

// ---- stage 3: Implement -----------------------------------------------

let impl = await phase('implement', () =>
  agent(`Implement the approved plan in ${storyPath} on a new branch and open a draft PR, per the implementer${plan.complexity === 'trivial' ? '-light' : ''} agent's instructions.`, {
    agentType: plan.complexity === 'trivial' ? 'implementer-light' : 'implementer',
    schema: implSchema,
    model: plan.complexity === 'trivial' ? config.models.implement_light : config.models.implement,
  }),
)
if (impl.escalated) {
  log(`implementer-light escalated: ${impl.escalationReason} — falling back to the standard implementer.`)
  impl = await phase('implement', () =>
    agent(`Implement the approved plan in ${storyPath} on a new branch and open a draft PR. (Escalated from implementer-light: ${impl.escalationReason})`, {
      agentType: 'implementer',
      schema: implSchema,
      model: config.models.implement,
    }),
  )
}
if (!impl.testsGreen) return escalate('implementation left tests red', { impl })

// ---- stages 4-6 + CI: one shared bounded loop -----------------------------
// Mirrors the original design (Review ⇄ Rework, QA failure shares the same
// budget) and extends it to CI failures, since a CI failure is just another
// class of "review found a problem" that needs a rework cycle.

const areas = plan.affectedAreas.length ? plan.affectedAreas : ['general']
let cycle = 0
let ciPassed = false

while (cycle < retryBudget) {
  const reviews = await phase('review', () =>
    pipeline(areas, area =>
      agent(`Review PR #${impl.prNumber} (branch ${impl.branch}), area: ${area}. Only review files in that area's diff.`, {
        agentType: 'code-reviewer',
        schema: reviewSchema,
        model: config.models.review,
        label: area,
      }),
    ),
  )
  const critical = reviews.filter(Boolean).flatMap(r => r.critical)
  const warnings = reviews.filter(Boolean).flatMap(r => r.warnings)

  if (critical.length === 0 && warnings.length === 0) {
    const qa = await phase('qa', () =>
      agent(`QA-verify PR #${impl.prNumber} against the acceptance criteria in ${storyPath}.`, {
        agentType: 'qa-verifier',
        schema: qaSchema,
        model: config.models.qa,
      }),
    )
    if (qa.passed) {
      const ci = await phase('ci', () =>
        agent(`Wait for CI on PR #${impl.prNumber}: run "${config.ci.watch_command.replace('{pr_number}', impl.prNumber)}" and report the final state. Do not merge or close the PR.`, {
          schema: ciSchema,
          tools: ['Bash'],
        }),
      )
      if (ci.passed) { ciPassed = true; break }
      log(`CI cycle ${cycle + 1}/${retryBudget}: FAILED — ${ci.failures.join('; ')}`)
      await phase('rework', () =>
        agent(`Fix these CI failures on PR #${impl.prNumber} (branch ${impl.branch}): ${ci.failures.join('; ')}`, {
          agentType: 'reworker',
          schema: reworkSchema,
          model: config.models.rework,
        }),
      )
    } else {
      log(`QA cycle ${cycle + 1}/${retryBudget}: FAILED — ${qa.bugReport}`)
      await phase('rework', () =>
        agent(`Fix this QA-reported bug on PR #${impl.prNumber} (branch ${impl.branch}): ${qa.bugReport}`, {
          agentType: 'reworker',
          schema: reworkSchema,
          model: config.models.rework,
        }),
      )
    }
  } else {
    log(`Review cycle ${cycle + 1}/${retryBudget}: ${critical.length} critical, ${warnings.length} warning`)
    await phase('rework', () =>
      agent(`Fix these review findings on PR #${impl.prNumber} (branch ${impl.branch}). CRITICAL: ${critical.join('; ') || 'none'}. WARNING: ${warnings.join('; ') || 'none'}.`, {
        agentType: 'reworker',
        schema: reworkSchema,
        model: config.models.rework,
      }),
    )
  }
  cycle++
}
if (!ciPassed) return escalate('review/QA/CI retry budget exhausted', { pr: impl.prNumber, prUrl: impl.prUrl, cycle })

// ---- hand off for manual verification (never codifies, never undrafts) ----
// Codify + undraft happen in workflows/promote.js, run by a human only after
// they've manually verified the PR — the workflow runtime can't pause this
// script for that sign-off (see the note at the top of promote.js), so the
// gate has to be a separate, human-triggered workflow.

await phase('hand-off', () =>
  agent(`In ${storyPath}, set frontmatter "status: in_review" and "pr: ${impl.prNumber}". Post a comment on PR #${impl.prNumber} summarizing the branch (${impl.branch}) and how to run/test it locally, noting it's awaiting manual verification before promotion. Do NOT undraft, merge, or close the PR.`, {
    tools: ['Bash', 'Read', 'Write'],
  }),
)

const nextSteps = `Manually verify PR #${impl.prNumber}, then run /claude-factory:promote ${storyPath} (approve) or /claude-factory:rework ${storyPath} "<issue>" (reject with a reason).`
log(`${storyPath} is in_review: PR #${impl.prNumber} (${impl.prUrl}) — CI green, still draft. ${nextSteps}`)

return {
  story: storyPath,
  pr: impl.prNumber,
  prUrl: impl.prUrl,
  branch: impl.branch,
  retryCyclesUsed: cycle,
  status: 'in_review',
  escalated: false,
  nextSteps,
}
