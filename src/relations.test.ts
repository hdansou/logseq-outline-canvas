import { describe, it, expect } from "vitest";
import { REL_KINDS, REL_STYLES, REL_KIND_ALTERNATION } from "./relations";
import { setTheme, theme } from "./colors";

describe("relationship registry", () => {
  it("exposes every declared kind", () => {
    expect(REL_KINDS).toEqual([
      "relates_to",
      "depends_on",
      "supports",
      "contradicts",
      "part_of",
    ]);
  });

  it("marks relates_to as the only undirected kind", () => {
    const directed = REL_KINDS.filter((k) => REL_STYLES[k].arrowEnd);
    expect(directed).not.toContain("relates_to");
    expect(directed).toHaveLength(REL_KINDS.length - 1);
  });

  it("orders the regex alternation longest-first", () => {
    const lengths = REL_KIND_ALTERNATION.split("|").map((k) => k.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
  });

  it.each(["dark", "light"] as const)("gives each kind a distinct %s color", (mode) => {
    setTheme(mode);
    const colors = REL_KINDS.map((k) => theme().rel[k]);
    expect(new Set(colors).size).toBe(REL_KINDS.length);
    setTheme("dark");
  });
});
