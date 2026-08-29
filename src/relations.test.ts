import { describe, it, expect, beforeEach } from "vitest";
import {
  BUILTIN_KINDS,
  BUILTIN_STYLES,
  setRegistry,
  resetRegistry,
  registryKinds,
  relStyle,
  relPaletteIndex,
  identToKind,
  buildRegistry,
  STYLE_SLOTS,
} from "./relations";

beforeEach(() => resetRegistry());

describe("built-ins", () => {
  it("keeps the five curated kinds", () => {
    expect(BUILTIN_KINDS).toEqual([
      "relates_to", "depends_on", "supports", "contradicts", "part_of",
    ]);
  });

  it("marks relates_to as the only undirected built-in", () => {
    const directed = BUILTIN_KINDS.filter((k) => BUILTIN_STYLES[k].arrowEnd);
    expect(directed).not.toContain("relates_to");
    expect(directed).toHaveLength(BUILTIN_KINDS.length - 1);
  });

  it("is the default registry before anything is discovered", () => {
    expect(registryKinds().map((d) => d.kind)).toEqual([...BUILTIN_KINDS]);
  });
});

describe("buildRegistry", () => {
  it("merges built-ins, tagged properties, and explicit names", () => {
    const defs = buildRegistry({
      tagged: [{ ident: ":user.property/rebuts-A1", title: "rebuts" }],
      explicit: ["cites"],
    });
    const kinds = defs.map((d) => d.kind);
    expect(kinds).toContain("supports");
    expect(kinds).toContain("rebuts");
    expect(kinds).toContain("cites");
  });

  it("gives built-ins precedence when a tagged property shares their name", () => {
    const defs = buildRegistry({
      tagged: [{ ident: ":user.property/supports-Z9", title: "supports" }],
      explicit: [],
    });
    const supports = defs.filter((d) => d.kind === "supports");
    expect(supports).toHaveLength(1);
    expect(supports[0].source).toBe("builtin");
    expect(supports[0].style).toEqual(BUILTIN_STYLES.supports);
  });

  it("does not duplicate a name given both by tag and explicitly", () => {
    const defs = buildRegistry({
      tagged: [{ ident: ":user.property/rebuts-A1", title: "rebuts" }],
      explicit: ["rebuts"],
    });
    expect(defs.filter((d) => d.kind === "rebuts")).toHaveLength(1);
  });

  it("treats custom kinds as directed unless listed undirected", () => {
    const defs = buildRegistry({
      tagged: [],
      explicit: ["cites", "sibling_of"],
      undirected: ["sibling_of"],
    });
    expect(defs.find((d) => d.kind === "cites")!.style.arrowEnd).toBe(true);
    expect(defs.find((d) => d.kind === "sibling_of")!.style.arrowEnd).toBeFalsy();
  });

  it("ignores blank and whitespace-only explicit entries", () => {
    const defs = buildRegistry({ tagged: [], explicit: ["  ", "", "cites"] });
    expect(defs.map((d) => d.kind)).toEqual([...BUILTIN_KINDS, "cites"]);
  });
});

describe("palette assignment", () => {
  it("is stable when other kinds are added or removed", () => {
    const a = relPaletteIndex("rebuts");
    const b = relPaletteIndex("rebuts");
    expect(a).toBe(b);
    // Adding neighbours must not move an existing kind's slot.
    buildRegistry({ tagged: [], explicit: ["aaa", "rebuts", "zzz"] });
    expect(relPaletteIndex("rebuts")).toBe(a);
  });

  it("stays inside the palette", () => {
    for (const name of ["rebuts", "cites", "owns", "calls", "x", "a-very-long-kind-name"]) {
      const i = relPaletteIndex(name);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(STYLE_SLOTS.length);
    }
  });

  it("gives custom kinds a style from the slot table", () => {
    const defs = buildRegistry({ tagged: [], explicit: ["rebuts"] });
    const rebuts = defs.find((d) => d.kind === "rebuts")!;
    expect(rebuts.style.dash).toEqual(STYLE_SLOTS[relPaletteIndex("rebuts")].dash);
  });
});

describe("relStyle", () => {
  it("returns the built-in style for a built-in kind", () => {
    expect(relStyle("depends_on")).toEqual(BUILTIN_STYLES.depends_on);
  });

  it("falls back to a palette style for an unregistered kind", () => {
    const style = relStyle("never_registered");
    expect(style.lw).toBeGreaterThan(0);
  });

  it("reflects the active registry after setRegistry", () => {
    setRegistry(buildRegistry({ tagged: [], explicit: ["cites"], undirected: ["cites"] }));
    expect(relStyle("cites").arrowEnd).toBeFalsy();
  });
});

describe("identToKind", () => {
  it("maps discovered idents to their kind", () => {
    setRegistry(buildRegistry({
      tagged: [{ ident: ":user.property/rebuts-A1", title: "rebuts" }],
      explicit: [],
    }));
    expect(identToKind()[":user.property/rebuts-A1"]).toBe("rebuts");
  });

  it("has no entry for kinds with no known ident", () => {
    setRegistry(buildRegistry({ tagged: [], explicit: ["cites"] }));
    expect(Object.values(identToKind())).not.toContain("cites");
  });
});
