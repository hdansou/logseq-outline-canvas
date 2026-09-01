#!/usr/bin/env bash
# Seed the relationship fixture into the running Logseq graph.
#
#   scripts/e2e/seed-relationships.sh
#
# Order matters:
#   1. Logseq + plugin dev server up      (scripts/logseq-dev-up.sh)
#   2. Plugin installed once by hand      (see CLAUDE.md — no programmatic install)
#   3. The five properties exist          (scripts/e2e/make-property.sh relates_to depends_on supports contradicts part_of)
#   4. This script
set -uo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

assert_plugin_url || exit 1

echo "→ seeding blocks + relationships"
result=$(eval_async "$(dirname "${BASH_SOURCE[0]}")/seed-relationships.js" "__ocSeed" 15)
echo "  $result"

# eval_js returns the JSON string as printed by the browser, so quotes arrive
# escaped (\"skipped\":[]). Strip backslashes before matching.
plain=${result//\\/}
case "$plain" in
  TIMEOUT*)      echo "✗ seed timed out — check the browser console"; exit 1 ;;
  *'"skipped":[]'*) echo "✓ fixture complete" ;;
  *)             echo "! some items skipped (see above) — usually a missing property; run scripts/e2e/make-property.sh first" ;;
esac
