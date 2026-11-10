// /claude-factory:rework <story-path> "<issue>" — run by a human when manual
// verification of an `in_review` PR finds a problem. Fixes it on the same
// branch, re-runs deliver.js's Review ⇄ Rework ⇄ QA ⇄ CI loop, and lands back
// on `in_review`. Never promotes — that's /claude-factory:promote.
//
// Runtime API gotchas: see the header of workflows/deliver.js.

export const meta = {
  name: 'rework',
  description: 'Fix a manually-reported issue on an in_review PR, re-stabilize, and return to in_review.',
}

// Cheap model for mechanical steps (read config/state, run gh, post comments).
const UTILITY_MODEL = 'haiku'
const DEFAULT_RETRY_BUDGET = 2

const CONFIG_PROMPT = 'Read .claude/factory.yml if it exists (legacy fallback: the yaml block under "## Pipeline config" in CLAUDE.md, where ci.required means ci_required). Report only keys actually set there: retry_budget, ci_required, models (stage name → model). No file → report none of them.'
const configProps = {
  retry_budget: { type: 'integer', minimum: 1 },
  ci_required: { type: 'boolean' },
  models: { type: 'object', additionalProperties: { type: 'string' } },
}

// The local story copy may be stale (deliver commits `in_review` to the PR
// branch), so state is read from the PR branch when the local copy disagrees.
const STORY_STATE_PROMPT = storyPath => `Read ${storyPath} frontmatter (id, status, pr). If the local copy isn't "in_review", run "git fetch origin", find the open PR whose head branch starts with "story/<id>" (gh pr list), and read the file from that branch with "git show origin/<branch>:${storyPath}" instead. Report id, status, pr, branch (the PR's head branch, via "gh pr view <pr> --json headRefName"), and the affected areas from its Implementation Plan.`
const storyProps = {
  id: { type: 'string' },
  status: { type: 'string' },
  pr: { type: 'integer' },
  branch: { type: 'string' },
  affectedAreas: { type: 'array', items: { type: 'string' } },
}

const setupSchema = {
  type: 'object',
  required: ['ghReady', 'hasCI', 'message', 'id', 'status', 'pr', 'branch', 'affectedAreas'],
  properties: {
    ...configProps,
    ...storyProps,
    ghReady: { type: 'boolean' },
    hasCI: { type: 'boolean' },
    message: { type: 'string' },
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
// A slash command may hand over one raw string: `<story path> "<issue>"`.

function parseArgs(a) {
  if (a && typeof a === 'object') return a
  const [storyPath, ...rest] = String(a ?? '').trim().split(/\s+/)
  return { storyPath, rest: rest.join(' ').replace(/^(["'])(.*)\1$/, '$2') }
}

const input = parseArgs(args)
const storyPath = input.storyPath
const issue = input.issue || input.rest

if (!storyPath || !issue) {
  return { error: 'usage: /claude-factory:rework <path to story file> "<issue description>"' }
}

function escalate(reason, extra) {
  log(`ESCALATING — ${reason}`)
  return { story: storyPath, escalated: true, reason, ...extra }
}

phase('setup')
const setup = await agent(`${CONFIG_PROMPT}

Then, read-only, check via Bash: "gh auth status" (ghReady = logged in with "repo" scope) and whether .github/workflows/ contains any *.yml/*.yaml (hasCI). Put any problem in message.

Then: ${STORY_STATE_PROMPT(storyPath)}`, {
  schema: setupSchema,
  model: UTILITY_MODEL,
})
const retryBudget = setup.retry_budget || DEFAULT_RETRY_BUDGET
const models = setup.models || {}

if (!setup.ghReady) {
  return { error: `gh is not ready: ${setup.message}. Run "gh auth login", then re-run.` }
}
if (!setup.hasCI && setup.ci_required !== false) {
  return { error: 'No CI in .github/workflows/, so "CI is green" can never be satisfied. Add a CI workflow, or opt out with "ci_required: false" in .claude/factory.yml — then re-run.' }
}
if (setup.status !== 'in_review') {
  return { error: `${storyPath} has status "${setup.status}", not "in_review" — nothing to rework. Run /claude-factory:deliver first.` }
}

// ---- fix the reported issue first. Not charged to the retry budget: a
// concrete human-reported bug is known work, not a runaway loop. ----------

const prNumber = setup.pr
const branch = setup.branch

phase('rework')
await agent(`Fix this manually-reported issue on PR #${prNumber} (branch ${branch}): ${issue}`, {
  agentType: 'claude-factory:reworker',
  schema: reworkSchema,
  model: models.rework,
})

// ---- re-stabilize -------------------------------------------------------------

const areas = setup.affectedAreas.length ? setup.affectedAreas : ['general']
let reviewCycle = 0, qaCycle = 0, ciCycle = 0
let ciPassed = false, ciSkipped = false, escalateReason = null

// Kept byte-identical to the block in deliver.js (no import() in workflows);
// scripts/check-workflows.sh fails CI if they drift.
// STABILIZE-LOOP-START
let warningsFixed = false, openWarnings = []
while (true) {
  phase('review')
  const reviews = await pipeline(areas, area =>
    agent(`Review PR #${prNumber} (branch ${branch}), area: ${area}. Only review files in that area's diff.`, {
      agentType: 'claude-factory:code-reviewer',
      schema: reviewSchema,
      model: models.review,
      label: area,
    }),
  )
  const critical = reviews.filter(Boolean).flatMap(r => r.critical)
  const warnings = reviews.filter(Boolean).flatMap(r => r.warnings)

  if (critical.length > 0) {
    if (reviewCycle >= retryBudget) { escalateReason = 'review retry budget exhausted'; break }
    log(`Review cycle ${reviewCycle + 1}/${retryBudget}: ${critical.length} critical, ${warnings.length} warning`)
    phase('rework')
    await agent(`Fix these review findings on PR #${prNumber} (branch ${branch}). CRITICAL: ${critical.join('; ') || 'none'}. WARNING: ${warnings.join('; ') || 'none'}.`, {
      agentType: 'claude-factory:reworker',
      schema: reworkSchema,
      model: models.rework,
    })
    reviewCycle++
    continue
  }
  // Warnings never block: a fresh reviewer always finds new ones (or reverses
  // the last fix), so re-reviewing them only burns the retry budget. Fix them
  // once, without re-review; QA and CI still gate. Later ones go to the human.
  if (warnings.length > 0 && !warningsFixed) {
    log(`Review: ${warnings.length} warning — fixing once, no re-review`)
    phase('rework')
    await agent(`Fix these review warnings on PR #${prNumber} (branch ${branch}). WARNING: ${warnings.join('; ')}.`, {
      agentType: 'claude-factory:reworker',
      schema: reworkSchema,
      model: models.rework,
    })
    warningsFixed = true
    openWarnings = []
  } else {
    openWarnings = warnings
  }

  phase('qa')
  const qa = await agent(`QA-verify PR #${prNumber} (branch ${branch}) against the acceptance criteria in ${storyPath}.`, {
    agentType: 'claude-factory:qa-verifier',
    schema: qaSchema,
    model: models.qa,
  })
  if (!qa.passed) {
    if (qaCycle >= retryBudget) { escalateReason = 'QA retry budget exhausted'; break }
    log(`QA cycle ${qaCycle + 1}/${retryBudget}: FAILED — ${qa.bugReport}`)
    phase('rework')
    await agent(`Fix this QA-reported bug on PR #${prNumber} (branch ${branch}): ${qa.bugReport}`, {
      agentType: 'claude-factory:reworker',
      schema: reworkSchema,
      model: models.rework,
    })
    qaCycle++
    continue
  }

  if (!setup.hasCI) {
    log('CI skipped — no .github/workflows/ and ci_required is false')
    ciPassed = true; ciSkipped = true; break
  }

  phase('ci')
  const ci = await agent(`Wait for CI on PR #${prNumber}: run "gh pr checks ${prNumber} --watch --fail-fast". If it reports no checks yet, wait 30s and retry, up to 10 times. passed = every check passed. For each failing check, put its name plus the key error lines (from "gh run view <run-id> --log-failed") in failures. Never merge or close the PR.`, {
    schema: ciSchema,
    model: UTILITY_MODEL,
  })
  if (ci.passed) { ciPassed = true; break }
  if (ciCycle >= retryBudget) { escalateReason = 'CI retry budget exhausted'; break }
  log(`CI cycle ${ciCycle + 1}/${retryBudget}: FAILED — ${(ci.failures || []).join('; ')}`)
  phase('rework')
  await agent(`Fix these CI failures on PR #${prNumber} (branch ${branch}): ${(ci.failures || []).join('; ') || 'see gh pr checks'}`, {
    agentType: 'claude-factory:reworker',
    schema: reworkSchema,
    model: models.rework,
  })
  ciCycle++
}
// STABILIZE-LOOP-END
if (!ciPassed) return escalate(`${escalateReason} during rework`, { pr: prNumber, reviewCycle, qaCycle, ciCycle })

// ---- back to in_review (status already is) — never undrafts or merges --------

phase('hand-off')
await agent(`Comment on PR #${prNumber}: "## Ready for re-verification\\n\\n**Fixed this round:** ${issue}\\n\\n**How to test locally:** <git checkout ${branch} && git pull, then the exact commands to run it>". Change nothing else; never undraft, merge, or close the PR.`, {
  model: UTILITY_MODEL,
})

const nextSteps = `Re-verify PR #${prNumber}, then /claude-factory:promote ${storyPath} or /claude-factory:rework ${storyPath} "<issue>" again.`
log(`${storyPath} back in_review: PR #${prNumber} — ${ciSkipped ? 'no CI' : 'CI green'}, still draft.${openWarnings.length ? ` Open warnings (not blocking): ${openWarnings.join('; ')}.` : ''} ${nextSteps}`)

return {
  story: storyPath,
  pr: prNumber,
  status: 'in_review',
  retryCyclesUsed: { review: reviewCycle, qa: qaCycle, ci: ciCycle },
  openWarnings,
  ciSkipped,
  escalated: false,
  nextSteps,
}
