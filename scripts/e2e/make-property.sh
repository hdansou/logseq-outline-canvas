#!/usr/bin/env bash
# Create user properties of type Node through the Logseq UI.
#
# This exists because a plugin CANNOT create a :user.property/* — the API
# rejects it with "Plugins can only upsert its own properties", and properties
# a plugin creates land under :plugin.property.<id>/* which the adapter
# deliberately ignores. The UI is the only path, so fixtures need this dance.
#
# Requires: canvas page open in the browser (any page with a "Set property"
# affordance) and the plugin installed.
#
# Usage:
#   scripts/e2e/make-property.sh supports contradicts part_of
#
# Note: the UI creates properties with cardinality ONE. Multi-value assignment
# fails until you change cardinality by hand.
set -uo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

for name in "$@"; do
  # Between properties the dialog can be left open; Escape resets to a known state.
  pc press Escape >/dev/null 2>&1; sleep 1

  f=$(snap); sp=$(refline 'button "Set property"' "$f")
  [[ -z "$sp" ]] && { echo "$name: no 'Set property' button — open a page first"; continue; }
  pc click "$sp" >/dev/null 2>&1; sleep 2

  f=$(snap); tb=$(refline 'textbox "Add or change property"' "$f")
  [[ -z "$tb" ]] && { echo "$name: property textbox never appeared"; continue; }
  pc fill "$tb" "$name" >/dev/null 2>&1; sleep 2

  f=$(snap); nw=$(refline "\+ New option: $name" "$f")
  if [[ -z "$nw" ]]; then
    echo "$name: no '+ New option' — a property with this name probably exists already"
    pc press Escape >/dev/null 2>&1
    continue
  fi
  pc click "$nw" >/dev/null 2>&1; sleep 3

  f=$(snap); nd=$(refline 'option "Node"' "$f")
  [[ -z "$nd" ]] && { echo "$name: type picker had no Node option"; pc press Escape >/dev/null 2>&1; continue; }
  pc click "$nd" >/dev/null 2>&1; sleep 3
  pc press Escape >/dev/null 2>&1; sleep 1
  echo "$name: created"
done
