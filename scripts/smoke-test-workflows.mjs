#!/usr/bin/env node
// Executes each workflows/*.js body with mocked runtime globals, to catch
// wrong-API-usage bugs (e.g. phase(title, cb) making a "stage result"
// undefined, then crashing on the first property access) that ship a
// syntax-valid script which still blows up for real. Complements, does not
// replace, scripts/check-workflows.sh's static grep checks — those catch
// misuse at call sites whose result is never dereferenced (this script
// can't, since nothing there throws), and this catches misuse this session's
// grep patterns don't happen to match (this script doesn't need to know the
// bug's exact shape, only that a real phase()/agent() would behave
// differently than a broken script assumes).
//
// Not a correctness test of the actual pipeline logic — the fixture data
// below is schema-shaped stub data, not anything a real agent would say.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function stripMetaBlock(src) {
  // Mirrors check-workflows.sh's awk: skip from '^export const meta = {' to
  // the next '^}'.
  const lines = src.split('\n')
  const out = []
  let skip = false
  for (const line of lines) {
    if (/^export const meta = \{/.test(line)) { skip = true; continue }
    if (skip) { if (/^}/.test(line)) skip = false; continue }
    out.push(line)
  }
  return out.join('\n')
}

// ---- generic JSON-Schema-driven fixture generator --------------------------
// Fills every declared property (required and optional) with a plausible
// stub value. Two named overrides beyond the generic fill (not more
// name-sniffing — just the two spots a purely generic fill would either
// dead-end control flow or silently skip a whole branch):
//   - `status` (a bare string, no enum) is compared against the literal
//     'in_review' by rework.js/promote.js on the line right after it's read;
//     a generic filler would give 'stub' and dead-end both files there.
//   - a "fail-once-then-recover" gate, keyed by the schema's own object
//     identity (module-level consts recur across loop iterations, so the
//     same reference naturally repeats within one file's run): the first
//     time a schema with an approved/passed boolean (or a review-findings
//     shape with critical/warnings and no approved/passed sibling) is
//     requested, force it to the "failing" values; every later request for
//     that same reference gets the normal passing ones. This exercises each
//     retry/rework branch at least once without hand-scripting per-stage
//     state.
function makeFiller(gateFailOnce) {
  const requestCounts = new Map()

  function fillSchema(schema) {
    if (!schema || schema.type !== 'object') return {}
    const obj = {}
    for (const [name, prop] of Object.entries(schema.properties || {})) {
      obj[name] = fillProp(prop)
    }
    if ('status' in obj) obj.status = 'in_review'

    if (gateFailOnce) {
      const hasBooleanGate = 'approved' in obj || 'passed' in obj
      const isReviewShape = 'critical' in obj && 'warnings' in obj && !hasBooleanGate
      if (hasBooleanGate || isReviewShape) {
        const n = (requestCounts.get(schema) || 0) + 1
        requestCounts.set(schema, n)
        if (n === 1) {
          if ('approved' in obj) obj.approved = false
          if ('passed' in obj) obj.passed = false
          if ('critical' in obj) obj.critical = ['stub problem']
          if ('failures' in obj) obj.failures = ['stub problem']
        }
      }
    }
    return obj
  }

  function fillProp(prop) {
    if (prop.enum) return prop.enum[0]
    switch (prop.type) {
      case 'object': return fillSchema(prop)
      case 'array': return []
      case 'integer': case 'number': return 1
      case 'boolean': return true
      default: return 'stub'
    }
  }

  return fillSchema
}

// ---- mock runtime globals ---------------------------------------------------
function makeGlobals(fixtureArgs, gateFailOnce, overrides) {
  const fillSchema = makeFiller(gateFailOnce)
  let currentPhase = '(start)'
  const phase = (title) => { currentPhase = title }
  const log = (msg) => console.log(`    [log] ${msg}`)
  const agent = async (_prompt, opts = {}) => {
    if (!opts.schema) return {}
    const result = fillSchema(opts.schema)
    for (const [key, value] of Object.entries(overrides || {})) {
      if (key in result) result[key] = value
    }
    return result
  }
  // ponytail: only the single-stage pipeline() and no-thunk-shape parallel()
  // used today — extend if a future workflow calls either differently.
  const pipeline = async (items, fn) => Promise.all(items.map(fn))
  const parallel = async (thunks) => Promise.all(thunks.map(t => t()))
  return { agent, pipeline, parallel, phase, log, args: fixtureArgs, getCurrentPhase: () => currentPhase }
}

async function runOne(file, fixtureArgs, gateFailOnce, overrides) {
  const src = readFileSync(file, 'utf8')
  const body = stripMetaBlock(src)
  const g = makeGlobals(fixtureArgs, gateFailOnce, overrides)
  const run = new Function('agent', 'pipeline', 'parallel', 'phase', 'log', 'args',
    `async function __wrap(){\n${body}\n}\nreturn __wrap();`)
  try {
    const result = await run(g.agent, g.pipeline, g.parallel, g.phase, g.log, g.args)
    if (result === null || typeof result !== 'object') {
      throw new Error(`resolved value is not an object: ${JSON.stringify(result)}`)
    }
    console.log(`OK: ${file} (last phase: ${g.getCurrentPhase()})`)
    return true
  } catch (err) {
    console.error(`FAIL: ${file} (last phase: ${g.getCurrentPhase()}): ${err.stack}`)
    return false
  }
}

const CASES = [
  {
    file: join(ROOT, 'workflows/deliver.js'),
    args: 'docs/stories/example.md',
    gateFailOnce: true,
    overrides: { retry_budget: 6 }, // see header: room for review+qa+ci to each fail once then recover
  },
  {
    file: join(ROOT, 'workflows/rework.js'),
    args: { storyPath: 'docs/stories/example.md', issue: 'example issue' },
    gateFailOnce: true,
    overrides: { retry_budget: 6 },
  },
  {
    file: join(ROOT, 'workflows/promote.js'),
    args: 'docs/stories/example.md',
    gateFailOnce: false, // promote's ci check has no retry loop — a forced failure would just dead-end every run
    overrides: {},
  },
]

let ok = true
for (const c of CASES) {
  if (!(await runOne(c.file, c.args, c.gateFailOnce, c.overrides))) ok = false
}
process.exitCode = ok ? 0 : 1
