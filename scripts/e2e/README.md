# E2E fixtures

Scripts for driving a live Logseq instance through `playwright-cli`. They exist
because setting up a relationship fixture by hand is slow and easy to get
subtly wrong, and because two constraints make the obvious approaches fail.

## The two constraints

1. **A plugin cannot create a user property.** `upsertProperty(":user.property/x")`
   is rejected with *"Plugins can only upsert its own properties"*, and
   properties a plugin creates land under `:plugin.property.<id>/x`, which the
   adapter deliberately ignores. So fixtures need a UI pass — that is all
   `make-property.sh` is.
2. **There is no programmatic install.** `load_plugin_from_web_url_BANG_` was
   removed in Logseq 2.0. Install once by hand per profile; it survives page
   reloads (the in-memory Demo graph does not).

## Order

```bash
scripts/logseq-dev-up.sh                  # Logseq :3001 + plugin :8090

# once per Logseq profile — Settings → Advanced → Developer mode,
# then ⋯ → Plugins → ⋯ → Load plugin from web url → http://localhost:8090

scripts/e2e/make-property.sh relates_to depends_on supports contradicts part_of
scripts/e2e/seed-relationships.sh
```

`seed-relationships.sh` is idempotent enough to re-run: it recreates blocks and
re-assigns properties. If the graph gets wedged (SQLite errors from rapid API
calls), `playwright-cli reload` resets the in-memory graph while leaving the
plugin installed — then re-run from `make-property.sh`.

## What the fixture covers

Every built-in kind; a same-column pair (`Migration scripts → Auth bridge`) that
exercises the stacked-column edge routing; an outgoing off-page ref
(`Adopt the new wiki → Budget approval`) that becomes a ghost target; and an
incoming one (`CFO memo → Adopt the new wiki`) that only the reverse query can
find. The last two are invisible unless `relationshipScope` is `graph`.

## `lib.sh` notes

`playwright-cli eval` splices its argument into `() => ( ARG )`. Consequences,
all of which cost real debugging time before they were written down:

- ARG must be a **single expression** — no statement blocks, no arrow callbacks.
- **No trailing semicolon.** A `;` at the top level fails with the unhelpful
  `Passed function is not well-serializable!`.
- `await` is impossible, hence the two-step `eval_async`: the payload stashes a
  promise on `window`, then a second eval resolves it.
- Snapshot lines carry state markers between label and ref
  (`button "Set property" [active] [ref=e894]`), so `refline` matches loosely
  and takes the ref last. Anchoring the pattern misses the element you just
  clicked.
