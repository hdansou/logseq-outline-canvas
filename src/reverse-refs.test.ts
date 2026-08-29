import { describe, it, expect } from "vitest";
import { specsFromQueryRows } from "./reverse-refs";

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
