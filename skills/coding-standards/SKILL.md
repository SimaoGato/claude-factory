---
name: coding-standards
description: Language-agnostic engineering standards (simple over clever, naming, small units, error handling, security, why-only comments). Use whenever writing, reworking, or reviewing code in /claude-factory:deliver, /claude-factory:rework, or /fix.
---

# Coding standards

Widely accepted defaults. The project's own conventions (CLAUDE.md, linter,
formatter, surrounding code) win where they differ.

## Simple, not smart
- Code is read far more than written. Optimize for the next reader.
- Boring and obvious beats clever. No one-liner tricks, no needless indirection.
- KISS, YAGNI: build what the acceptance criteria need, nothing speculative.
- No abstraction until the third real repetition (rule of three).
- No dead code, commented-out code, unused params, or "for later" scaffolding.

## Readable by itself
- Names say intent: `retryDelay`, not `d` or `tmp2`. Full words, no clever abbreviations.
- Small functions, one job each. Short files. Shallow nesting — return early.
- Named constants over magic numbers/strings.
- Prefer pure functions and immutable data; keep side effects at the edges.
- Match the existing style; let the formatter decide formatting.

## Comments: why only
Code says *what* and *how*. A comment earns its place only to explain a *why*
the code can't: a hidden constraint, a workaround for a dependency bug, a
non-obvious trade-off. Before writing one, try a better name or a small
extraction instead.

Never:
- restate the code (`increment counter` above an increment);
- reference stories, ACs, tickets, or "the plan" — traceability lives in the
  PR description, and code outlives the ticket;
- leave TODOs without an owner and reason.

## Errors and boundaries
- Fail fast. Validate input at trust boundaries (user input, network, files, env).
- Handle errors explicitly; never swallow them silently. Error messages say what failed and with what input.
- Release resources deterministically.

## Security
- No secrets in code, logs, or error messages.
- Parameterize queries and shell commands; never build them from raw input.
- Least privilege. Escape output for its context. Know the OWASP Top 10.

## Dependencies
- Standard library and existing dependencies first. Don't add a package for a few lines of code.
