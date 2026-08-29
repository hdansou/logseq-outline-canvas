import { describe, it, expect } from "vitest";
import { parseNameList } from "./settings";

describe("parseNameList", () => {
  it("splits on commas and trims", () => {
    expect(parseNameList("rebuts, cites ,owns")).toEqual(["rebuts", "cites", "owns"]);
  });

  it("drops empty entries from trailing or doubled commas", () => {
    expect(parseNameList("rebuts,,cites,")).toEqual(["rebuts", "cites"]);
  });

  it("returns nothing for an empty or whitespace-only setting", () => {
    expect(parseNameList("")).toEqual([]);
    expect(parseNameList("   ")).toEqual([]);
  });
});
