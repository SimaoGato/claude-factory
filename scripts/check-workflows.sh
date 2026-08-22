#!/usr/bin/env bash
# Checks for workflows/*.js that `claude plugin validate` doesn't cover:
#   1. JS syntax — the workflow runtime's top-level `return`/`await` aren't
#      valid to a plain `node --check`, so we stub the runtime globals
#      (agent/pipeline/parallel/phase/log/args) and wrap the body in an async
#      function before checking it. The stub shapes below MUST match the
#      real runtime's signatures (phase(title) is void, agent() takes no
#      `tools` option) — a stub that's wrong the same way a script is wrong
#      makes this check pass on a broken script. That's exactly what
#      happened before: phase(name, callback) parsed fine here and then blew
#      up for real as "config.retry_budget" on undefined, because the stub
#      quietly invoked the callback instead of rejecting the extra argument.
#   2. API misuse — every workflow author so far has independently guessed
#      `phase(title, callback)` instead of `phase(title); await agent(...)`,
#      and `tools: [...]` as an agent() option (not part of the real API —
#      an agent's tools come from its agentType's definition, or all tools
#      with none). Static grep since the syntax check above can't catch
#      call-shape mistakes, only parse errors.
#   3. agentType validity — every `agentType:` value shipped without the
#      plugin's own namespace prefix (e.g. `'story-refiner'` instead of
#      `'claude-factory:story-refiner'`), which crashed a live `deliver` run
#      with "agent type 'story-refiner' not found" the same day the
#      phase()/tools misuse above was fixed. Cross-checks every agentType
#      literal against the plugin name in .claude-plugin/plugin.json plus
#      the real `agents/*.md` frontmatter — catches both a missing prefix
#      and a typo'd agent name.
#   4. Drift between the two hand-copied STABILIZE-LOOP blocks in
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
    echo "const agent=async()=>{}; const pipeline=async(items,fn)=>Promise.all(items.map(fn)); const parallel=async(thunks)=>Promise.all(thunks.map(t=>t())); const phase=(title)=>{}; const log=()=>{}; let args={};"
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
echo "== phase()/agent() API usage check =="
for f in deliver promote rework; do
  src="$WORKFLOWS_DIR/$f.js"
  if grep -nE "phase\(['\"][^'\"]*['\"]\s*,\s*(async\s*)?\(" "$src"; then
    echo "FAIL: $src calls phase(title, callback) — phase() only takes a title and returns nothing; call it, then separately \`await agent(...)\`/\`await pipeline(...)\`"
    fail=1
  fi
  if grep -nE "^\s*tools:\s*\[" "$src"; then
    echo "FAIL: $src passes a \`tools:\` option to agent() — that's not part of the real API (an agent's tools come from its agentType's definition, or all tools with none); remove it"
    fail=1
  fi
done
if [ "$fail" -eq 0 ]; then
  echo "OK: no phase(title, callback) or tools: misuse found"
fi

echo ""
echo "== agentType validity check =="
PLUGIN_NAME=$(grep -m1 '"name"' .claude-plugin/plugin.json | sed -E 's/.*"name": *"([^"]+)".*/\1/')
BASENAMES=""
for af in agents/*.md; do
  name=$(sed -nE 's/^name: *(.+)$/\1/p' "$af" | head -1)
  BASENAMES="$BASENAMES $name"
done

agent_type_fail=0
for f in deliver promote rework; do
  src="$WORKFLOWS_DIR/$f.js"
  # bare (unprefixed) agent name used as agentType — the exact mistake that
  # crashed a live run. A quoted-name match here can't accidentally hit the
  # prefixed form: 'claude-factory:story-refiner' has no `'` right before
  # "story-refiner" (it's `:`), so `'story-refiner'` only matches the bare form.
  for name in $BASENAMES; do
    if grep -nE "agentType:.*'$name'" "$src"; then
      echo "FAIL: $src uses agentType '$name' without the required '$PLUGIN_NAME:' prefix"
      agent_type_fail=1
    fi
  done
  # prefixed agentType values that don't match any real agents/*.md (typo)
  for lit in $(grep "agentType:" "$src" | grep -oE "'$PLUGIN_NAME:[a-zA-Z0-9-]+'" | tr -d "'"); do
    base="${lit#$PLUGIN_NAME:}"
    known=0
    for name in $BASENAMES; do [ "$name" = "$base" ] && known=1 && break; done
    if [ "$known" -eq 0 ]; then
      echo "FAIL: $src uses agentType '$lit' — no agents/$base.md exists"
      agent_type_fail=1
    fi
  done
done
if [ "$agent_type_fail" -eq 0 ]; then
  echo "OK: every agentType is '$PLUGIN_NAME:'-prefixed and matches a real agent"
else
  fail=1
fi

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
