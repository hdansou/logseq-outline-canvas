import { describe, it, expect } from "vitest";
import { identsByKind, specsFromQueryRows } from "./reverse-refs";

describe("identsByKind", () => {
  it("maps a property ident to its relationship kind by title", () => {
    const rows = [
      [{ ident: ":user.property/supports-rsddWi2L", title: "supports" }],
      [{ ident: ":user.property/part_of-D6EArJR-", title: "part_of" }],
    ];
    expect(identsByKind(rows)).toEqual({
      ":user.property/supports-rsddWi2L": "supports",
      ":user.property/part_of-D6EArJR-": "part_of",
    });
  });

  it("ignores properties whose title is not a relationship kind", () => {
    const rows = [[{ ident: ":user.property/status-AB", title: "status" }]];
    expect(identsByKind(rows)).toEqual({});
  });

  it("tolerates malformed rows", () => {
    expect(identsByKind([[], [null], [{ title: "supports" }], undefined])).toEqual({});
  });
});

describe("specsFromQueryRows", () => {
  const idents = { ":user.property/supports-X": "supports" as const };

  it("builds an EdgeSpec per referring block", () => {
    const rows = [
      [{ uuid: "SRC" }, ":user.property/supports-X", { uuid: "TGT" }],
    ];
    expect(specsFromQueryRows(rows, idents)).toEqual([
      { sourceUuid: "SRC", kind: "supports", targetUuid: "TGT" },
    ]);
  });

  it("drops rows whose ident is not a known relationship property", () => {
    const rows = [[{ uuid: "SRC" }, ":user.property/other-Y", { uuid: "TGT" }]];
    expect(specsFromQueryRows(rows, idents)).toEqual([]);
  });

  it("dedupes identical source/kind/target triples", () => {
    const row = [{ uuid: "SRC" }, ":user.property/supports-X", { uuid: "TGT" }];
    expect(specsFromQueryRows([row, row], idents)).toHaveLength(1);
  });

  it("skips rows missing either endpoint uuid", () => {
    const rows = [
      [{ uuid: "SRC" }, ":user.property/supports-X", {}],
      [{}, ":user.property/supports-X", { uuid: "TGT" }],
    ];
    expect(specsFromQueryRows(rows, idents)).toEqual([]);
  });
});
