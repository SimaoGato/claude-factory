#!/usr/bin/env bash
# Fails CI if plugin-shipped files changed without a version bump in
# .claude-plugin/plugin.json — otherwise `/plugin update` has nothing to
# report changed. Mirrors the drift-check style of check-workflows.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_SHA="${BASE_SHA:-}"

if [ -z "$BASE_SHA" ] || [ "$BASE_SHA" = "0000000000000000000000000000000000000000" ]; then
  echo "No base commit to diff against (first push / new branch) — skipping."
  exit 0
fi

if ! git cat-file -e "$BASE_SHA" 2>/dev/null; then
  echo "Base commit $BASE_SHA not available locally — skipping."
  exit 0
fi

PLUGIN_PATHS="agents commands skills workflows templates README.md .claude-plugin/marketplace.json"
CHANGED=$(git diff --name-only "$BASE_SHA" -- $PLUGIN_PATHS)

if [ -z "$CHANGED" ]; then
  echo "No plugin-shipped files changed since $BASE_SHA — version bump not required."
  exit 0
fi

OLD_VERSION=$(git show "$BASE_SHA:.claude-plugin/plugin.json" | grep -m1 '"version"')
NEW_VERSION=$(grep -m1 '"version"' .claude-plugin/plugin.json)

if [ "$OLD_VERSION" = "$NEW_VERSION" ]; then
  echo "Plugin files changed but .claude-plugin/plugin.json version was not bumped ($NEW_VERSION):"
  echo "$CHANGED"
  exit 1
fi

echo "Version bumped: $OLD_VERSION -> $NEW_VERSION"
