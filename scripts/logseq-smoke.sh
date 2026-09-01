#!/usr/bin/env bash
# End-to-end smoke test: open canvas, maximize, view-switch (incl. Treemap),
# dock back, close. Asserts the container size and sidebar visibility at each
# step. Exits non-zero on any failure with a screenshot under .playwright-cli/.
#
# Requires services running — run scripts/logseq-dev-up.sh first.
#
# Usage:
#   scripts/logseq-smoke.sh
#
# Cross-origin reality check: the plugin iframe is hosted at :8090 while Logseq
# is at :3001, so we can't read .contentDocument. Instead we:
#   - click inside the iframe via playwright-cli refs parsed from snapshots,
#   - assert *from the host context* on the container's style / sidebar CSS,
#     both of which are accessible cross-origin because they live on host DOM.
set -euo pipefail

PLUGIN_ID="logseq-plugin-outline-canvas"
PLUGIN_URL="${PLUGIN_URL:-http://localhost:8090}"
LOGSEQ_URL="http://localhost:3001/index.html#/"

pc() { playwright-cli "$@"; }
latest_yml() { ls -t .playwright-cli/*.yml 2>/dev/null | head -1; }

# eval an expression in the host page, strip playwright-cli boilerplate
eval_js() { pc eval "$1" 2>&1 | awk '/^### Result/{getline; print; exit}'; }

# Snapshot and pick out the ref of the first button matching a literal label.
# Usage: ref_of_button '"✕"'    or    ref_of_button '"▦ Treemap"'
ref_of_button() {
  pc snapshot >/dev/null
  local yml match
  yml=$(latest_yml)
  match=$(grep -nE "button $1 \[" "$yml" | head -1 || true)
  [[ -n "$match" ]] || { echo "ref_of_button: no match for $1 in $yml" >&2; return 1; }
  printf '%s' "$match" | sed -E 's/.*\[ref=([a-z0-9]+)\].*/\1/'
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "  ✓ $label"
  else
    echo "  ✗ $label"
    echo "      expected substring: $expected"
    echo "      actual:             $actual"
    pc screenshot >/dev/null 2>&1 || true
    exit 1
  fi
}

pc close >/dev/null 2>&1 || true
pc open >/dev/null

echo "→ opening logseq"
pc goto "$LOGSEQ_URL" >/dev/null

# Programmatic install is gone. `window.frontend.handler` on Logseq >= 2.0
# exposes only { user, common, db_based } — load_plugin_from_web_url_BANG_ was
# removed, and the URL-install flow lives in a ClojureScript namespace that is
# not reachable from window.*. LSPluginCore.register is the *registration*
# step, not the install (which fetches package.json and parses the manifest
# first), so it is not a substitute.
#
# The script therefore expects the plugin to be installed already and tells you
# how if it is not, rather than appearing to work and then asserting nothing.
echo "→ checking plugin is installed"
for i in {1..15}; do
  count=$(eval_js "document.querySelectorAll('.lsp-iframe-sandbox-container').length")
  [[ "$count" == "1" ]] && break
  sleep 1
done
if [[ "${count:-0}" != "1" ]]; then
  cat <<MSG
plugin iframe not found — install it once by hand, then re-run:

  Settings → Advanced → Developer mode (on)
  ⋯ → Plugins → ⋯ (top right) → Load plugin from web url
  ${PLUGIN_URL}

The install survives reloads, so this is a one-time step per Logseq profile.
MSG
  exit 1
fi
echo "  ✓ plugin iframe mounted"

echo "→ clicking toolbar button"
toolbar_ref=$(ref_of_button '""' 2>/dev/null || true)
# fall back to the outline-canvas-btn generic ref if the icon-only button wasn't labeled
if [[ -z "${toolbar_ref:-}" ]]; then
  toolbar_ref=$(grep -nE 'OutlineCanvas — Visual Diagrams.*\[ref=([a-z0-9]+)\]' "$(latest_yml)" \
                  | sed -E 's/.*\[ref=([a-z0-9]+)\].*/\1/' | head -1)
fi
[[ -n "$toolbar_ref" ]] || { echo "toolbar button ref not found"; exit 1; }
pc click "$toolbar_ref" >/dev/null
sleep 1

echo "→ asserting docked geometry + sidebar hidden"
style=$(eval_js "document.querySelector('.lsp-iframe-sandbox-container').style.cssText")
assert_eq "container is fixed"                              "position: fixed" "$style"
assert_eq "container has width (40vw or measured px)"       "width: "         "$style"
vis=$(eval_js "getComputedStyle(document.querySelector('#right-sidebar')).visibility")
assert_eq "sidebar visibility: hidden while iframe visible" "hidden" "$vis"

echo "→ clicking maximize (⊞) — regression guard for the layout-persistence bug"
maximize_ref=$(ref_of_button '"⊞"')
pc click "$maximize_ref" >/dev/null
sleep 1
style=$(eval_js "document.querySelector('.lsp-iframe-sandbox-container').style.cssText")
assert_eq "full-screen width 100vw"  "width: 100vw"  "$style"
assert_eq "full-screen height 100vh" "height: 100vh" "$style"

echo "→ clicking Treemap view — regression guard for the drag-region click-stealing bug"
treemap_ref=$(ref_of_button '"▦ Treemap"')
pc click "$treemap_ref" >/dev/null
sleep 1

echo "→ docking back (⊟ in full-screen toggles to dock)"
dock_ref=$(ref_of_button '"⊟"')
pc click "$dock_ref" >/dev/null
sleep 1
style=$(eval_js "document.querySelector('.lsp-iframe-sandbox-container').style.cssText")
assert_eq "back to docked (not 100vw)" "40vw" "$style"

echo "→ closing (✕)"
close_ref=$(ref_of_button '"✕"')
pc click "$close_ref" >/dev/null
sleep 1
visible=$(eval_js "document.querySelector('.lsp-iframe-sandbox-container').classList.contains('visible')")
assert_eq "iframe no longer .visible" "false" "$visible"

echo
echo "all smoke assertions passed."
