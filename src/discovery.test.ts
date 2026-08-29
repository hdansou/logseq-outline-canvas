import { describe, it, expect } from "vitest";
import { parseCatalog, taggedWith, attachIdents } from "./discovery";
import { buildRegistry } from "./relations";

const rows = [
  [{
    "db/ident": ":user.property/supports-K9",
    "block/title": "supports",
    "block/tags": [{ "block/title": "Property" }],
  }],
  [{
    "db/ident": ":user.property/rebuts-A1",
    "block/title": "rebuts",
    "block/tags": [{ "block/title": "Property" }, { "block/title": "semantic-connector" }],
  }],
  [{
    "db/ident": ":user.property/author-Z9",
    "block/title": "author",
    "block/tags": [{ "block/title": "Property" }],
  }],
];

describe("parseCatalog", () => {
  it("reads ident, title, and tag titles", () => {
    expect(parseCatalog(rows)).toEqual([
      { ident: ":user.property/supports-K9", title: "supports", tags: ["Property"] },
      { ident: ":user.property/rebuts-A1", title: "rebuts", tags: ["Property", "semantic-connector"] },
      { ident: ":user.property/author-Z9", title: "author", tags: ["Property"] },
    ]);
  });

  it("skips rows missing an ident or title", () => {
    expect(parseCatalog([[{ "block/title": "no ident" }], [{}], [], undefined])).toEqual([]);
  });

  it("tolerates a property with no tags", () => {
    const out = parseCatalog([[{ "db/ident": ":user.property/x-1", "block/title": "x" }]]);
    expect(out[0].tags).toEqual([]);
  });
});

describe("taggedWith", () => {
  it("returns only properties carrying the marker tag", () => {
    expect(taggedWith(parseCatalog(rows), "semantic-connector")).toEqual([
      { ident: ":user.property/rebuts-A1", title: "rebuts" },
    ]);
  });

  it("returns nothing when no property carries the tag", () => {
    expect(taggedWith(parseCatalog(rows), "nope")).toEqual([]);
  });

  it("matches the tag name exactly, not by prefix", () => {
    expect(taggedWith(parseCatalog(rows), "semantic")).toEqual([]);
  });
});

describe("attachIdents", () => {
  const catalog = parseCatalog(rows);

  it("gives a built-in kind the ident of the property that shares its name", () => {
    const defs = attachIdents(buildRegistry({ tagged: [], explicit: [] }), catalog);
    expect(defs.find((d) => d.kind === "supports")!.ident).toBe(":user.property/supports-K9");
  });

  it("leaves a kind with no matching property without an ident", () => {
    const defs = attachIdents(buildRegistry({ tagged: [], explicit: [] }), catalog);
    expect(defs.find((d) => d.kind === "part_of")!.ident).toBeUndefined();
  });

  it("does not overwrite an ident a tagged kind already carries", () => {
    const defs = attachIdents(
      buildRegistry({ tagged: [{ ident: ":user.property/rebuts-A1", title: "rebuts" }], explicit: [] }),
      catalog
    );
    expect(defs.find((d) => d.kind === "rebuts")!.ident).toBe(":user.property/rebuts-A1");
  });

  it("resolves an explicit name to its ident once the property exists", () => {
    const defs = attachIdents(buildRegistry({ tagged: [], explicit: ["author"] }), catalog);
    expect(defs.find((d) => d.kind === "author")!.ident).toBe(":user.property/author-Z9");
  });
});
