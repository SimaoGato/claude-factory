// /claude-factory:rework <story-path> "<issue description>" — human-triggered
// when manual verification of an `in_review` PR finds a problem. Fixes it on
// the same branch, then re-runs the SAME bounded review/QA/CI stabilize loop
// deliver.js uses, and lands back on `in_review` for you to re-check. Never
// auto-promotes — run /claude-factory:promote yourself once you're satisfied.
//
// KNOWN TRADEOFF: the workflow runtime disallows import(), so the
// review/QA/CI stabilize loop below is a duplicate of the one in
// workflows/deliver.js (~40 lines) rather than a shared module. If you change
// the loop's behavior in one file, change it in the other too.
//
// NOTE on runtime API: see the header comment in workflows/deliver.js — the
// same caveats about agentType/tools/schema options apply here.

export const meta = {
  name: 'rework',
  description: 'Fix a manually-reported issue on an in_review PR, re-stabilize, and return to in_review.',
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

const storyStateSchema = {
  type: 'object',
  required: ['id', 'pr', 'branch', 'status', 'affectedAreas'],
  properties: {
    id: { type: 'string' },
    pr: { type: 'integer' },
    branch: { type: 'string' },
    status: { type: 'string' },
    affectedAreas: { type: 'array', items: { type: 'string' } },
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
const issue = typeof args === 'object' ? args?.issue : undefined

if (!storyPath || !issue) {
  return { error: 'usage: /claude-factory:rework <path to story file> "<issue description>"' }
}

function escalate(reason, extra) {
  log(`ESCALATING — ${reason}`)
  return { story: storyPath, escalated: true, reason, ...extra }
}

const config = await phase('config', () =>
  agent('Read the "## Pipeline config" fenced yaml block from CLAUDE.md at the project root and return it as structured data.', {
    schema: pipelineConfigSchema,
    tools: ['Read'],
  }),
)
const retryBudget = config.retry_budget

const story = await phase('read-story', () =>
  agent(`Read ${storyPath}: return its id, pr number, branch, status, and the affected areas listed in its Implementation Plan section.`, {
    schema: storyStateSchema,
    tools: ['Read'],
  }),
)

if (story.status !== 'in_review') {
  return { error: `${storyPath} has status "${story.status}", not "in_review" — nothing to rework yet. Run /claude-factory:deliver first.` }
}

// ---- fix the manually-reported issue first, on its own (not budget-charged
// — a concretely reported bug isn't a runaway retry, it's known work) -------

await phase('rework', () =>
  agent(`Fix this manually-reported issue on PR #${story.pr} (branch ${story.branch}): ${issue}`, {
    agentType: 'reworker',
    schema: reworkSchema,
    model: config.models.rework,
  }),
)

// ---- re-stabilize: same bounded Review ⇄ Rework ⇄ QA ⇄ CI loop as deliver.js

const areas = story.affectedAreas.length ? story.affectedAreas : ['general']
let cycle = 0
let ciPassed = false

while (cycle < retryBudget) {
  const reviews = await phase('review', () =>
    pipeline(areas, area =>
      agent(`Review PR #${story.pr} (branch ${story.branch}), area: ${area}. Only review files in that area's diff.`, {
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
      agent(`QA-verify PR #${story.pr} against the acceptance criteria in ${storyPath}.`, {
        agentType: 'qa-verifier',
        schema: qaSchema,
        model: config.models.qa,
      }),
    )
    if (qa.passed) {
      const ci = await phase('ci', () =>
        agent(`Wait for CI on PR #${story.pr}: run "${config.ci.watch_command.replace('{pr_number}', story.pr)}" and report the final state. Do not merge or close the PR.`, {
          schema: ciSchema,
          tools: ['Bash'],
        }),
      )
      if (ci.passed) { ciPassed = true; break }
      log(`CI cycle ${cycle + 1}/${retryBudget}: FAILED — ${ci.failures.join('; ')}`)
      await phase('rework', () =>
        agent(`Fix these CI failures on PR #${story.pr} (branch ${story.branch}): ${ci.failures.join('; ')}`, {
          agentType: 'reworker',
          schema: reworkSchema,
          model: config.models.rework,
        }),
      )
    } else {
      log(`QA cycle ${cycle + 1}/${retryBudget}: FAILED — ${qa.bugReport}`)
      await phase('rework', () =>
        agent(`Fix this QA-reported bug on PR #${story.pr} (branch ${story.branch}): ${qa.bugReport}`, {
          agentType: 'reworker',
          schema: reworkSchema,
          model: config.models.rework,
        }),
      )
    }
  } else {
    log(`Review cycle ${cycle + 1}/${retryBudget}: ${critical.length} critical, ${warnings.length} warning`)
    await phase('rework', () =>
      agent(`Fix these review findings on PR #${story.pr} (branch ${story.branch}). CRITICAL: ${critical.join('; ') || 'none'}. WARNING: ${warnings.join('; ') || 'none'}.`, {
        agentType: 'reworker',
        schema: reworkSchema,
        model: config.models.rework,
      }),
    )
  }
  cycle++
}
if (!ciPassed) return escalate('review/QA/CI retry budget exhausted during rework', { pr: story.pr, cycle })

// ---- back to in_review for a human to re-check -----------------------------
// (status is already in_review; just refresh the PR comment — never
// codifies, never undrafts, never merges — same handoff as deliver.js)

await phase('hand-off', () =>
  agent(`Post a comment on PR #${story.pr} summarizing the rework just done for: "${issue}". Note it's ready for re-verification. Do NOT change frontmatter status away from in_review, and do NOT undraft, merge, or close the PR.`, {
    tools: ['Bash'],
  }),
)

const nextSteps = `Manually re-verify PR #${story.pr}, then run /claude-factory:promote ${storyPath} (approve) or /claude-factory:rework ${storyPath} "<issue>" again (reject with a reason).`
log(`${storyPath} is back in_review after rework: PR #${story.pr} — CI green, still draft. ${nextSteps}`)

return {
  story: storyPath,
  pr: story.pr,
  status: 'in_review',
  retryCyclesUsed: cycle,
  escalated: false,
  nextSteps,
}
