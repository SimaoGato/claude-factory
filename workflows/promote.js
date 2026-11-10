// /claude-factory:promote <story-path> — run by a human after manually verifying
// an `in_review` PR. Re-checks CI, codifies learnings into CLAUDE.md, archives
// the story, then undrafts the PR. Never merges — a human always does.
//
// Separate workflow (not a deliver.js stage) because the runtime can't pause
// mid-run for sign-off. Runtime API gotchas: see the header of workflows/deliver.js.

export const meta = {
  name: 'promote',
  description: 'Approve a manually-verified in_review PR: codify learnings, then undraft it (never merges).',
}

// Cheap model for mechanical steps (read state, run gh/git).
const UTILITY_MODEL = 'haiku'

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
  required: ['ghReady', 'hasCI', 'ciPassed', 'message', 'id', 'status', 'pr', 'branch'],
  properties: {
    ...configProps,
    ...storyProps,
    ghReady: { type: 'boolean' },
    hasCI: { type: 'boolean' },
    ciPassed: { type: 'boolean' },
    ciFailures: { type: 'array', items: { type: 'string' } },
    message: { type: 'string' },
  },
}

const codifySchema = {
  type: 'object',
  required: ['claudeMdUpdated'],
  properties: {
    claudeMdUpdated: { type: 'boolean' },
    summary: { type: 'string' },
  },
}

// ---- input ----------------------------------------------------------------

const storyPath = String((args && typeof args === 'object' ? args.storyPath : args) ?? '').trim().split(/\s+/)[0]

if (!storyPath) {
  return { error: 'usage: /claude-factory:promote <path to story file>' }
}

// ---- setup: config, gh, story state, and CURRENT CI status in one call -------
// CI is re-checked because time has passed since in_review: a new push or a
// flaky check may have turned it red.

phase('setup')
const setup = await agent(`${CONFIG_PROMPT}

Then, read-only, check via Bash: "gh auth status" (ghReady = logged in with "repo" scope) and whether .github/workflows/ contains any *.yml/*.yaml (hasCI). Put any problem in message.

Then: ${STORY_STATE_PROMPT(storyPath)}

Finally, if hasCI: run "gh pr checks <pr>" (no --watch) and report ciPassed = every check passed, with failing check names in ciFailures. No CI → ciPassed = true.`, {
  schema: setupSchema,
  model: UTILITY_MODEL,
})
const models = setup.models || {}

if (!setup.ghReady) {
  return { error: `gh is not ready: ${setup.message}. Run "gh auth login", then re-run.` }
}
if (setup.status !== 'in_review') {
  return { error: `${storyPath} has status "${setup.status}", not "in_review" — nothing to promote. Run /claude-factory:deliver or /claude-factory:rework first.` }
}
if (setup.hasCI && !setup.ciPassed) {
  return { error: `CI is no longer green on PR #${setup.pr} (${(setup.ciFailures || []).join('; ') || 'unknown failure'}). Investigate, or run /claude-factory:rework.` }
}

// ---- codify ----------------------------------------------------------------

phase('codify')
const codified = await agent(`Extract reusable learnings from delivering ${storyPath} (PR #${setup.pr}, branch ${setup.branch}) into CLAUDE.md, per the codifier agent's instructions. Read the PR's diff and review/QA comments with gh if you need them.`, {
  agentType: 'claude-factory:codifier',
  schema: codifySchema,
  model: models.codify,
})

// ---- archive the story on the PR branch, then undraft (never merge) ----------

phase('promote')
await agent(`"git fetch origin && git checkout ${setup.branch} && git pull", carrying over any uncommitted CLAUDE.md edit (stash/pop if checkout refuses). In ${storyPath} set frontmatter "status: done", "git mv" it into docs/stories/done/, commit it together with any CLAUDE.md change ("chore: promote ${setup.id}"), and push. Only after the push succeeds: "gh pr ready ${setup.pr}". Never merge, close, or enable auto-merge.`, {
  model: UTILITY_MODEL,
})

log(`Promoted ${storyPath}: PR #${setup.pr} is ready for human review/merge.${codified.claudeMdUpdated ? ` CLAUDE.md: ${codified.summary}` : ''}`)

return {
  story: storyPath,
  pr: setup.pr,
  status: 'done',
  codified,
}
