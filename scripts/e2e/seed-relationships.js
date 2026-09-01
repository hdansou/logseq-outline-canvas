// Browser-eval payload: seed the relationship fixture into the current graph.
//
// Run through scripts/e2e/seed-relationships.sh, which handles the two-step
// promise dance. Assumes the five relationship properties already exist —
// create them first with scripts/e2e/make-property.sh (a plugin cannot).
//
// IMPORTANT: this file must remain a single expression with NO trailing
// semicolon. playwright-cli splices it into `() => ( … )`.
void (window.__ocSeed = (async function () {
  var api = logseq.api;
  var out = { blocks: [], rels: [], skipped: [] };

  // --- pages + blocks -----------------------------------------------------
  var PAGES = [
    ["Wiki Migration Demo", "Wiki Migration", {
      "Evidence": [
        "Survey: 78% cannot find docs",
        "Pilot: tickets down 40%",
        "Pilot: 3 weeks lost to migration",
        "Legal: retention policy blocks deletion"
      ],
      "Components": ["Search indexer", "Auth bridge", "Migration scripts"],
      "Milestones": ["Adopt the new wiki", "Launch v1", "Freeze old wiki"]
    }],
    // Off-page endpoints: one ghost target, one ghost source. Both only show
    // up when relationshipScope is "graph".
    ["Finance", "Budget approval", { "Notes": ["CFO memo: wiki spend is justified"] }]
  ];

  for (var i = 0; i < PAGES.length; i++) {
    var pageName = PAGES[i][0], rootTitle = PAGES[i][1], branches = PAGES[i][2];
    await api.create_page(pageName, {}, { createFirstBlock: false, redirect: false });
    var root = await api.append_block_in_page(pageName, rootTitle);
    if (!root) { out.skipped.push(pageName); continue; }
    out.blocks.push(rootTitle);
    var names = Object.keys(branches);
    for (var b = 0; b < names.length; b++) {
      var branch = await api.insert_block(root.uuid, names[b], { sibling: false, before: false });
      var leaves = branches[names[b]];
      for (var l = 0; l < leaves.length; l++) {
        await api.insert_block(branch.uuid, leaves[l], { sibling: false, before: false });
        out.blocks.push(leaves[l]);
      }
    }
  }

  // --- resolve properties + blocks ---------------------------------------
  var props = {};
  var pq = await api.datascript_query('[:find (pull ?p [:db/ident :block/title]) :where [?p :block/tags :logseq.class/Property] [?p :db/ident ?i] [(str ?i) ?s] [(clojure.string/starts-with? ?s ":user.property/")]]');
  for (var q = 0; q < pq.length; q++) { props[pq[q][0].title] = pq[q][0].ident; }

  var byTitle = {};
  var bq = await api.datascript_query('[:find (pull ?b [:db/id :block/uuid :block/title]) :where [?b :block/title ?t] [(missing? $ ?b :block/tags)]]');
  for (var j = 0; j < bq.length; j++) { byTitle[bq[j][0].title] = bq[j][0]; }

  // --- relationships ------------------------------------------------------
  // Covers: every built-in kind, a same-column pair (stacked routing), an
  // outgoing off-page ref (ghost target) and an incoming one (ghost source,
  // only findable by the reverse query).
  var RELS = [
    ["Survey: 78% cannot find docs", "supports", "Adopt the new wiki"],
    ["Pilot: tickets down 40%", "supports", "Adopt the new wiki"],
    ["Pilot: tickets down 40%", "relates_to", "Pilot: 3 weeks lost to migration"],
    ["Pilot: 3 weeks lost to migration", "contradicts", "Adopt the new wiki"],
    ["Legal: retention policy blocks deletion", "contradicts", "Freeze old wiki"],
    ["Search indexer", "part_of", "Launch v1"],
    ["Auth bridge", "part_of", "Launch v1"],
    ["Migration scripts", "depends_on", "Auth bridge"],
    ["Launch v1", "depends_on", "Migration scripts"],
    ["Freeze old wiki", "depends_on", "Launch v1"],
    ["Freeze old wiki", "relates_to", "Adopt the new wiki"],
    ["Adopt the new wiki", "depends_on", "Budget approval"],
    ["CFO memo: wiki spend is justified", "supports", "Adopt the new wiki"]
  ];

  for (var r = 0; r < RELS.length; r++) {
    var src = byTitle[RELS[r][0]], tgt = byTitle[RELS[r][2]], prop = props[RELS[r][1]];
    if (!src || !tgt || !prop) {
      out.skipped.push(RELS[r][0] + " " + RELS[r][1] + (prop ? "" : " (property missing — run make-property.sh)"));
      continue;
    }
    try {
      await api.upsert_block_property(src.uuid, prop, tgt.id);
      out.rels.push(RELS[r][0] + " -" + RELS[r][1] + "-> " + RELS[r][2]);
    } catch (e) { out.skipped.push(RELS[r][0] + " " + RELS[r][1] + " ERR " + String(e)); }
  }

  return { seeded: out.rels.length, blocks: out.blocks.length, skipped: out.skipped }
})())
