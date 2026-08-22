#!/usr/bin/env bash
# Checks for workflows/*.js that `claude plugin validate` doesn't cover:
#   1. JS syntax — the workflow runtime's top-level `return`/`await` aren't
#      valid to a plain `node --check`, so we stub the runtime globals
#      (agent/pipeline/parallel/phase/log/args) and wrap the body in an async
#      function before checking it.
#   2. Drift between the two hand-copied STABILIZE-LOOP blocks in
#      deliver.js and rework.js (see the comment at each block's start —
#      the workflow runtime disallows import(), so this loop can't be a
#      shared module; this script is what actually enforces they stay in sync
#      instead of just hoping a future edit remembers to touch both).
set -euo pipefail
cd "$(dirname "$0")/.."

WORKFLOWS_DIR="workflows"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail=0

echo "== JS syntax check =="
for f in deliver promote rework; do
  src="$WORKFLOWS_DIR/$f.js"
  check_file="$TMP_DIR/${f}_check.mjs"
  {
    echo "const agent=async()=>{}; const pipeline=async()=>{}; const parallel=async()=>{}; const phase=(n,fn)=>fn(); const log=()=>{}; let args={};"
    echo "async function __wrap(){"
    awk '/^export const meta = \{/{skip=1} skip{if(/^}/){skip=0}; next} {print}' "$src"
    echo "}"
    echo "__wrap();"
  } > "$check_file"
  if node --check "$check_file" 2>&1; then
    echo "OK: $src"
  else
    echo "FAIL: $src has a syntax error (see above)"
    fail=1
  fi
done

echo ""
echo "== stabilize-loop drift check (deliver.js vs rework.js) =="
extract_block() {
  awk '/\/\/ STABILIZE-LOOP-START/{flag=1} flag{print} /\/\/ STABILIZE-LOOP-END/{flag=0}' "$1"
}
extract_block "$WORKFLOWS_DIR/deliver.js" > "$TMP_DIR/deliver_loop.txt"
extract_block "$WORKFLOWS_DIR/rework.js" > "$TMP_DIR/rework_loop.txt"

if [ ! -s "$TMP_DIR/deliver_loop.txt" ] || [ ! -s "$TMP_DIR/rework_loop.txt" ]; then
  echo "FAIL: couldn't find a STABILIZE-LOOP-START/END marker pair in one or both files"
  fail=1
elif diff -u "$TMP_DIR/deliver_loop.txt" "$TMP_DIR/rework_loop.txt"; then
  echo "OK: stabilize loops match"
else
  echo "FAIL: deliver.js and rework.js stabilize loops have drifted apart — see diff above, apply the same edit to both"
  fail=1
fi

exit $fail
