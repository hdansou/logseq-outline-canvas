#!/usr/bin/env bash
# Idempotently bring up the two services needed to test the plugin end-to-end:
#   - Logseq web app   (http://localhost:3001, started via `yarn watch` in the logseq repo)
#   - Plugin dev server (http://localhost:8090, started via `npx vite` in this repo)
#
# Both are no-ops if already listening. Pass --fresh to kill-and-restart.
#
# Usage:
#   scripts/logseq-dev-up.sh          # idempotent
#   scripts/logseq-dev-up.sh --fresh  # kill existing, start clean
set -euo pipefail

LOGSEQ_REPO="${LOGSEQ_REPO:-/Users/dzu/Projects/src/github.com/logseq}"
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGSEQ_LOG="/tmp/logseq-watch.log"
PLUGIN_LOG="/tmp/plugin-vite.log"
LOGSEQ_PORT=3001
# 8080 is the default for several plugins in this workspace, and vite silently
# falls back to 8081, 8082… when it is taken — which loads the *wrong* plugin.
# Pinned to a port unique to this one, with --strictPort so a collision fails
# loudly instead of quietly serving someone else's package.json.
PLUGIN_PORT=8090
WAIT_SECS=180

fresh=0
[[ "${1:-}" == "--fresh" ]] && fresh=1

port_pid() { lsof -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }

kill_port() {
  local pid
  pid=$(port_pid "$1") || true
  if [[ -n "${pid:-}" ]]; then
    echo "killing pid $pid on :$1"
    kill "$pid" 2>/dev/null || true
    sleep 1
    pid=$(port_pid "$1") || true
    [[ -n "${pid:-}" ]] && kill -9 "$pid" 2>/dev/null || true
  fi
}

start_logseq() {
  [[ -d "$LOGSEQ_REPO" ]] || { echo "ERROR: logseq repo not found at $LOGSEQ_REPO"; exit 1; }
  echo "starting logseq watch -> $LOGSEQ_LOG"
  # Logseq's package.json pins packageManager to pnpm@10.33.0 (corepack-managed)
  ( cd "$LOGSEQ_REPO" && nohup pnpm watch >"$LOGSEQ_LOG" 2>&1 & )
}

start_plugin() {
  echo "starting plugin vite -> $PLUGIN_LOG"
  ( cd "$PLUGIN_DIR" && nohup npx vite --port "$PLUGIN_PORT" --strictPort >"$PLUGIN_LOG" 2>&1 & )
}

wait_for_http() {
  local url="$1" name="$2" deadline=$(( $(date +%s) + WAIT_SECS ))
  while (( $(date +%s) < deadline )); do
    if curl -sf -o /dev/null "$url"; then
      echo "  $name ready"
      return 0
    fi
    sleep 2
  done
  echo "ERROR: $name did not become ready within ${WAIT_SECS}s (see log)"
  return 1
}

if (( fresh )); then
  kill_port "$LOGSEQ_PORT"
  kill_port "$PLUGIN_PORT"
fi

if [[ -z "$(port_pid "$LOGSEQ_PORT")" ]]; then
  start_logseq
else
  echo "logseq already listening on :$LOGSEQ_PORT"
fi

if [[ -z "$(port_pid "$PLUGIN_PORT")" ]]; then
  start_plugin
else
  echo "plugin dev server already listening on :$PLUGIN_PORT"
fi

echo "waiting for services…"
wait_for_http "http://localhost:${LOGSEQ_PORT}"  "logseq  (:$LOGSEQ_PORT)"
wait_for_http "http://localhost:${PLUGIN_PORT}/package.json" "plugin  (:$PLUGIN_PORT)"

echo "ready."
echo "  logseq log : $LOGSEQ_LOG"
echo "  plugin log : $PLUGIN_LOG"
