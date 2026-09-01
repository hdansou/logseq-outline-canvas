#!/usr/bin/env bash
# Shared helpers for driving Logseq through playwright-cli.
#
# Source this, don't run it:  source "$(dirname "$0")/lib.sh"

PLUGIN_ID="${PLUGIN_ID:-logseq-plugin-outline-canvas}"
PLUGIN_URL="${PLUGIN_URL:-http://localhost:8090}"
LOGSEQ_URL="${LOGSEQ_URL:-http://localhost:3001/index.html#/}"

pc() { playwright-cli "$@"; }

# Latest snapshot file. Refs regenerate on every UI transition, so re-snapshot
# before every click rather than reusing a ref from earlier.
snap() { pc snapshot 2>&1 | tail -1 | sed 's/.*(\(.*\))/\1/'; }

# Pull a ref out of a snapshot line. Deliberately loose: snapshot lines carry
# state markers between the label and the ref —
#   button "Set property" [active] [ref=e894]
# — so anchoring the pattern to `label [ref=` silently misses the element you
# just interacted with.
refline() { grep -E "$1" "$2" | head -1 | grep -oE 'ref=e[0-9]+' | head -1 | cut -d= -f2; }

# Evaluate an expression in the host page and print the first result line.
#
# playwright-cli splices the argument into `() => ( ARG )`, so ARG must be a
# single expression: no statement blocks, no arrow callbacks, and NO TRAILING
# SEMICOLON (that one fails with "Passed function is not well-serializable").
eval_js() { pc eval "$1" 2>&1 | grep -m1 '^"' ; }

# Run an async payload and read its result. Two steps because the eval wrapper
# cannot await: the payload stashes a promise on window, then we resolve it.
#   eval_async /path/to/payload.js __seed
# The payload must assign its promise to window.<name> and end WITHOUT a `;`.
eval_async() {
  local file="$1" name="$2" tries="${3:-10}"
  pc eval "$(cat "$file")" >/dev/null 2>&1
  pc eval "window.${name}.then(function(r){window.${name}_out=JSON.stringify(r)}).catch(function(e){window.${name}_out='ERR '+String(e)}) || 'fired'" >/dev/null 2>&1
  for _ in $(seq 1 "$tries"); do
    local out
    out=$(eval_js "window.${name}_out || null")
    [[ -n "$out" && "$out" != "null" ]] && { echo "$out"; return 0; }
    sleep 1
  done
  echo "TIMEOUT waiting for ${name}"; return 1
}

# Confirm the port is serving THIS plugin. Several plugins in this workspace
# default to :8080 and vite falls back silently, so installing from the wrong
# port registers someone else's plugin and every assertion after is noise.
assert_plugin_url() {
  local name
  name=$(curl -s "${PLUGIN_URL}/package.json" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name",""))' 2>/dev/null)
  if [[ "$name" != "$PLUGIN_ID" ]]; then
    echo "ERROR: ${PLUGIN_URL} serves '${name:-nothing}', expected '${PLUGIN_ID}'" >&2
    return 1
  fi
  echo "✓ ${PLUGIN_URL} serves ${name}"
}

plugin_registered() {
  eval_js "JSON.stringify(Array.from(window.LSPluginCore._registeredPlugins.keys()))" | grep -q "$PLUGIN_ID"
}
