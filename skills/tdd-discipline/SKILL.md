---
name: tdd-discipline
description: Test-driven development discipline for implementing and reworking code, with concrete rules against common TDD anti-patterns (mirror assertions, overmocking, testing implementation details). Use this whenever writing, changing, or fixing application code in the /claude-factory:deliver or /claude-factory:rework workflows, or any time the user asks to add a feature or fix a bug with tests. Enforces test-first, red-green-refactor, one-test-per-acceptance-criterion, and a pre-commit mutation check.
---

# TDD discipline

Write the test first. Always. A change without a test that would have failed
before it is not done.

## The loop (per acceptance criterion)
1. **Red** — write the smallest test that expresses the next acceptance
   criterion and watch it fail for the right reason. If it passes immediately,
   the test is wrong or the behaviour already exists.
2. **Green** — write the minimum production code to make it pass. No extra
   features, no speculative generality.
3. **Refactor** — clean up names, duplication, and structure with the suite green.
4. **Mutation check** (before committing) — mentally mutate the code you just
   wrote: flip a boundary (`<` to `<=`), drop a branch, return empty/null
   instead of the real value. At least one test must fail. If none would,
   the test isn't earning its place — go back and fix it, don't just move on.
5. Commit. Move to the next criterion.

## Rules
- One acceptance criterion maps to at least one test. Trace them explicitly in
  the PR description.
- **Derive expectations independently.** The expected value must be a
  hand-checked literal, not something computed by calling the same function
  or helper as the code under test — a "mirror assertion" (`expect(f(x)).toBe(f(x))`
  in disguise) passes no matter what the code does.
- **Test behaviour, not implementation.** Test the outward contract, not
  internals that will churn on refactor. E.g. test "a failing call retries 5
  times and never attempts a 6th," not `MAX_RETRIES === 5`.
- **Test your boundaries, not framework/library mechanics.** Assert your
  code's contract at its edge (the route registered, the query emitted, the
  payload produced) — skip testing trivial forwarding or a library's own
  behaviour, that's its maintainers' job. Exception: one narrow
  characterization test when upstream behaviour genuinely surprised you.
- **Mock selectively, exercise real implementations.** Learn every side
  effect of a dependency before replacing it with a mock — a mock assertion
  passes when the mock is present and fails when it's absent, and says
  nothing about the real component. Mock what's slow or external; keep what
  the test actually needs to verify real. If mock setup outgrows the test's
  actual logic, that's a signal to switch to an integration test with real
  components instead.
- **Keep test utilities out of production code.** A cleanup or setup method
  called only from tests doesn't belong on a production class.
- Cover edge cases the criterion implies: empty, invalid, boundary, permission,
  and (where relevant) concurrency.
- Keep tests fast and deterministic. No sleeps, no real network unless the test
  is explicitly an integration test.
- When fixing a bug, first write a failing test that reproduces it, then fix.

## Choosing test scope
Default to **unit**: one AC, one function/module, no real I/O. Reach for an
**integration** test specifically when the AC's behavior can't be
meaningfully verified without real component interaction (a DB constraint,
a multi-module contract, a real queue) — still test-first, just a broader
unit of "the code under test." Don't reach for one because a unit test felt
inconvenient to set up; that's what "mock selectively" above is for.

**End-to-end / golden-path verification is `qa-verifier`'s stage, not
yours.** Keep your suite at unit/integration level so it stays fast; don't
duplicate what QA already exercises against the running system.

**Smoke tests (post-deploy health checks) are out of scope for this
pipeline** — claude-factory doesn't own deployment or have a CD stage. If
the project deploys and wants smoke tests, that's the project's own CI to
define, not something this skill prescribes.

## Named anti-patterns — recognize these, don't write them
- **The Liar** — a test that passes without actually asserting the behaviour
  it claims to (missing/weak assertion, un-awaited async).
- **Mirror assertion** — expected value computed the same way as the actual
  value; can't ever fail. See "derive expectations independently" above.
- **Excessive setup** — 10+ mocks/fixtures before the interesting behaviour;
  usually means the unit under test has too many dependencies, not that the
  test needs more scaffolding.
- **The Giant** — one test asserting many unrelated behaviours. One behaviour
  per test; if the test name has "and" in it, split it.
- **The Slow Poke** — unnecessarily slow tests (real sleeps, real network,
  the whole suite reaching for integration/E2E when a unit test would do).
- **Overmocking** — mocking so much that the test only verifies the mock was
  called, not that the real component works.
- **Testing implementation details** — asserting on private methods, internal
  state, or exact call sequences that have nothing to do with the observable
  contract; breaks on every refactor, misses real bugs.

## Don't over-test
- Don't test framework code or third-party libraries (see boundaries rule above).
- Don't write tests that only restate the implementation.
- Prefer a few high-value tests over many brittle ones.

## Exploratory / spike code
Skipping TDD is allowed **only** for explicitly-flagged, genuinely throwaway
exploration (e.g. "let me spike this API integration to see if it's even
feasible before writing the real story"). When that's done: **discard the
spike** — don't harden it in place. The real implementation restarts
test-first from nothing. If you find yourself keeping spike code because
"it already works," that's the TDD-skipping rationalization to watch for —
stop, and write it test-first for real.

## Detecting the test framework
Look for existing config (package.json scripts, pytest.ini, go.mod, etc.) and
follow the project's existing conventions and runner. Match the style already in
the repo before introducing anything new.

## Confirm new tests are actually discovered
"The test passes" isn't enough — a test that CI never runs can never fail
either. After adding a test file, run the project's *existing aggregate test
command* (the one CI's workflow invokes, e.g. `npm test`, `pytest`, `go
test ./...`), not just the new file directly, and confirm the new test's name
appears in that run's output. If the new test's location falls outside the
current discovery pattern (glob/`testMatch`/`testpaths`/file list), fix the
test config — or the CI workflow itself — in the same PR. A test that only
passes when invoked directly is a false green.
