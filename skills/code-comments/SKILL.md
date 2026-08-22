---
name: code-comments
description: Comment discipline — explain non-obvious why, never restate what, and never use code comments as a substitute for the PR description or the decision log. Use this whenever writing or reworking application code in the /claude-factory:deliver or /claude-factory:rework workflows.
---

# Code comments

Code should be readable on its own through naming and structure. A comment
earns its place only when the code can't explain itself.

## Write a comment when
- A hidden constraint or subtle invariant isn't visible from the code (e.g.
  "must run before X initializes" / "assumes UTC — the API silently rejects
  local time").
- You're working around a specific bug, limitation, or surprising behavior in
  a dependency or platform.
- Behavior would genuinely surprise a careful reader, and there's no way to
  make that surprise disappear by renaming or restructuring.

Test before writing one: would a future reader be confused *without* this
comment? If not, delete it.

## Don't write a comment for
- **What the code does.** `// increment the counter` above `count++` is
  noise; well-named code doesn't need a caption.
- **Why this story/AC needed it.** `// this implements AC5 because...` does
  not belong in code — that traceability already has a home: the PR
  description's "Acceptance criteria → tests" section (see `pr-conventions`).
  Code outlives the story that produced it; a comment tying it to a ticket
  number rots the moment someone reads it without that context.
- **A decision log.** "We chose X over Y because..." belongs in
  `docs/adr/DECISIONS.md` or a standalone ADR, written by `codifier` — not
  scattered through the diff as inline commentary.

## In practice
If you're about to write a comment, first ask whether a better name or a
small extraction would make it unnecessary. Reach for a comment only when
that's genuinely not possible.
