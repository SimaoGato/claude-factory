// /claude-factory:deliver — Refine → Challenge → Implement → (Review ⇄ Rework ⇄ QA ⇄ CI).
// Stops at a green-CI draft PR with status `in_review`. The runtime can't pause
// for human sign-off, so approve/reject are separate workflows (promote.js, rework.js).
//
// Runtime API gotchas, enforced by scripts/check-workflows.sh: phase(title) only
// labels progress (no callback, no return value); agent() has no `tools` option;
// agentType needs the `claude-factory:` prefix. No import() — shared code is copied.

export const meta = {
  name: 'deliver',
  description: 'Take a story to a green-CI draft PR, awaiting manual verification (see promote/rework).',
}

// Cheap model for mechanical steps (read config, run gh, edit frontmatter):
// these never need the session model, which may be Opus.
const UTILITY_MODEL = 'haiku'
const DEFAULT_RETRY_BUDGET = 2

// Config is optional; unset keys fall back to defaults, and an unset model
// means "use the agent's own frontmatter model".
const CONFIG_PROMPT = 'Read .claude/factory.yml if it exists (legacy fallback: the yaml block under "## Pipeline config" in CLAUDE.md, where ci.required means ci_required). Report only keys actually set there: retry_budget, ci_required, models (stage name → model). No file → report none of them.'
const configProps = {
  retry_budget: { type: 'integer', minimum: 1 },
  ci_required: { type: 'boolean' },
  models: { type: 'object', additionalProperties: { type: 'string' } },
}

const setupSchema = {
  type: 'object',
  required: ['insideRepo', 'hasCommits', 'hasOrigin', 'ghReady', 'hasWorkflowScope', 'hasCI', 'message'],
  properties: {
    ...configProps,
    insideRepo: { type: 'boolean' },
    hasCommits: { type: 'boolean' },
    hasOrigin: { type: 'boolean' },
    ghReady: { type: 'boolean' },
    hasWorkflowScope: { type: 'boolean' },
    hasCI: { type: 'boolean' },
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
// A slash command may hand over one raw string: `<story path> [extra text]`.

function parseArgs(a) {
  if (a && typeof a === 'object') return a
  const [storyPath, ...rest] = String(a ?? '').trim().split(/\s+/)
  return { storyPath, rest: rest.join(' ').replace(/^(["'])(.*)\1$/, '$2') }
}

const input = parseArgs(args)
const storyPath = input.storyPath
const extraContext = input.context || input.rest

if (!storyPath) {
  return { error: 'usage: /claude-factory:deliver <path to story file> [extra context]' }
}

function escalate(reason, extra) {
  log(`ESCALATING — ${reason}`)
  return { story: storyPath, escalated: true, reason, ...extra }
}

// ---- setup: config + read-only preflight in one call, before any real spend --

phase('setup')
const setup = await agent(`${CONFIG_PROMPT}

Then, read-only (never create, commit, or push), check via Bash: "git rev-parse --is-inside-work-tree" (insideRepo), "git rev-parse HEAD" (hasCommits), "git remote get-url origin" (hasOrigin), "gh auth status" (ghReady = logged in with "repo" scope; hasWorkflowScope = has "workflow" scope), and whether .github/workflows/ contains any *.yml/*.yaml (hasCI). Put any problem in message.`, {
  schema: setupSchema,
  model: UTILITY_MODEL,
})
const retryBudget = setup.retry_budget || DEFAULT_RETRY_BUDGET
const models = setup.models || {}

if (!setup.insideRepo || !setup.hasCommits) {
  return { error: 'Not a git repository with at least one commit. Run: git init -b main && git add -A && git commit -m "chore: initial commit" (/discover does this on a new project), then re-run.' }
}
if (!setup.hasOrigin) {
  return { error: 'No "origin" remote, so no branch can be pushed or PR opened. Run: gh repo create <name> --private --source=. --remote=origin --push — then re-run.' }
}
if (!setup.ghReady) {
  return { error: `gh is not ready: ${setup.message}. Run "gh auth login" (add "-s workflow" if stories touch .github/workflows/), then re-run.` }
}
if (!setup.hasWorkflowScope) {
  log('Note: gh token lacks the "workflow" scope — pushes touching .github/workflows/ will be rejected. Fix: gh auth refresh -s workflow')
}
if (!setup.hasCI && setup.ci_required !== false) {
  return { error: 'No CI in .github/workflows/, so "CI is green" can never be satisfied. Add a CI workflow that runs build + tests, or opt out with "ci_required: false" in .claude/factory.yml — then re-run.' }
}

// ---- Refine ⇄ Challenge -----------------------------------------------------

const refine = prompt => agent(prompt, {
  agentType: 'claude-factory:story-refiner',
  schema: planSchema,
  model: models.refine,
})

phase('refine')
let plan = await refine(`Refine story ${storyPath}${extraContext ? ` — extra context: ${extraContext}` : ''}: write its Implementation Plan.`)

for (let cycle = 0; ; cycle++) {
  if (plan.blockingQuestions?.length) {
    return escalate('story-refiner raised blocking questions', { questions: plan.blockingQuestions })
  }
  // Only the first plan's tag counts: a revision answering CRITICAL findings
  // must not dodge re-challenge by relabelling itself trivial.
  if (cycle === 0 && plan.complexity === 'trivial') break
  phase('challenge')
  const verdict = await agent(`Challenge the Implementation Plan in ${storyPath} against its acceptance criteria and the scope firewall.`, {
    agentType: 'claude-factory:challenger',
    schema: verdictSchema,
    model: models.challenge,
  })
  if (verdict.approved) break
  if (cycle >= retryBudget) return escalate('challenge retry budget exhausted', { critical: verdict.critical })
  log(`Challenge cycle ${cycle + 1}/${retryBudget}: NEEDS REVISION — ${verdict.critical.join('; ')}`)
  phase('refine')
  plan = await refine(`Revise the Implementation Plan in ${storyPath} to fix these CRITICAL findings: ${verdict.critical.join('; ')}`)
}

// ---- Implement ----------------------------------------------------------------

const trivial = plan.complexity === 'trivial'
const implement = (light, note) => agent(`Implement the approved plan in ${storyPath} and open a draft PR.${note || ''}`, {
  agentType: light ? 'claude-factory:implementer-light' : 'claude-factory:implementer',
  schema: implSchema,
  model: light ? models.implement_light : models.implement,
})

phase('implement')
let impl = await implement(trivial)
if (trivial && impl.escalated) {
  log(`implementer-light escalated: ${impl.escalationReason} — retrying with the standard implementer.`)
  impl = await implement(false, ` implementer-light escalated (${impl.escalationReason}); reuse its branch/PR if it made one.`)
}
if (impl.escalated) return escalate(`implementer escalated: ${impl.escalationReason}`, { impl })
if (!impl.testsGreen) return escalate('implementation left tests red', { impl })

// ---- Review ⇄ Rework ⇄ QA ⇄ CI ------------------------------------------------
// Each gate has its own retry counter, so many rounds of review fixes don't
// starve QA or CI of attempts.

// One reviewer per area costs one agent each; a trivial change gets one.
const areas = trivial || !plan.affectedAreas.length ? ['general'] : plan.affectedAreas
const prNumber = impl.prNumber
const branch = impl.branch
let reviewCycle = 0, qaCycle = 0, ciCycle = 0
let ciPassed = false, ciSkipped = false, escalateReason = null

// Kept byte-identical to the block in rework.js (no import() in workflows);
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
if (!ciPassed) return escalate(escalateReason, { pr: prNumber, prUrl: impl.prUrl, reviewCycle, qaCycle, ciCycle })

// ---- hand off for manual verification (never codifies, undrafts, or merges) --
// The status change is committed to the PR branch so it survives checkouts
// and promote/rework can find it from any branch.

phase('hand-off')
await agent(`On branch ${branch}: in ${storyPath} set frontmatter "status: in_review" and "pr: ${prNumber}", commit ("chore: mark story in_review"), and push. Then comment on PR #${prNumber}: "## Ready for manual verification\\n\\n**How to test locally:** <git checkout ${branch}, then the exact commands to run it>\\n\\nThen: /claude-factory:promote ${storyPath} (approve) or /claude-factory:rework ${storyPath} \\"<issue>\\" (reject)." Never undraft, merge, or close the PR.`, {
  model: UTILITY_MODEL,
})

const nextSteps = `Manually verify PR #${prNumber}, then /claude-factory:promote ${storyPath} or /claude-factory:rework ${storyPath} "<issue>".`
log(`${storyPath} is in_review: PR #${prNumber} (${impl.prUrl}) — ${ciSkipped ? 'no CI' : 'CI green'}, still draft.${openWarnings.length ? ` Open warnings (not blocking): ${openWarnings.join('; ')}.` : ''} ${nextSteps}`)

return {
  story: storyPath,
  pr: prNumber,
  prUrl: impl.prUrl,
  branch,
  retryCyclesUsed: { review: reviewCycle, qa: qaCycle, ci: ciCycle },
  openWarnings,
  ciSkipped,
  status: 'in_review',
  escalated: false,
  nextSteps,
}
