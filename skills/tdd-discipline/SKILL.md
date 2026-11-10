---
name: tdd-discipline
description: Test-driven development discipline with concrete rules against common anti-patterns (mirror assertions, overmocking, testing implementation details). Use whenever writing, changing, or fixing code in the claude-factory workflows or /fix, or when asked to add a feature or fix a bug with tests.
---

# TDD discipline

No change is done without a test that would have failed before it.

## Loop, per acceptance criterion
1. **Red** — smallest test for the next AC; watch it fail for the right reason. Passes immediately → the test is wrong or the behavior already exists.
2. **Green** — minimum code to pass.
3. **Refactor** — clean names/duplication with the suite green.
4. **Mutation check** — mentally flip a boundary, drop a branch, return empty. At least one test must fail; if none would, fix the test.
5. Commit; next AC.

Bug fix: first a test that reproduces the bug, then the fix.

## Rules
- Every AC → at least one test; map them in the PR description.
- **Expected values are hand-checked literals**, never computed by the code under test (a mirror assertion can't fail).
- **Test behavior, not implementation**: "retries 5 times, never a 6th", not `MAX_RETRIES == 5`. No asserting private state or call order.
- **Test your boundary, not the framework's**: assert the payload/query/route your code produces; don't test library behavior.
- **Mock only what's slow or external.** If mock setup outgrows the test logic, write an integration test with real components.
- No test-only helpers in production code.
- Cover the edges the AC implies: empty, invalid, boundary, permission, concurrency.
- Fast and deterministic: no sleeps, no real network outside integration tests.
- One behavior per test. "and" in the name → split it.

## Scope
- Default **unit**. Use **integration** only when the AC can't be verified without real components interacting (DB constraint, multi-module contract).
- End-to-end/golden path is `qa-verifier`'s job. Smoke/deploy checks are the project's CI, not this pipeline.
- Spikes may skip TDD only when explicitly throwaway — then delete the spike and restart test-first.

## Find and prove the runner
- Use the project's existing test runner and conventions (see CLAUDE.md Commands, the build config, the CI config). Don't introduce a new one.
- After adding a test file, run the **aggregate test command CI runs** and confirm the new test appears in its output. Outside the discovery pattern → fix the test config or CI in the same PR. A test CI never runs is a false green.
