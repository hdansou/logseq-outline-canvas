import { describe, it, expect } from "vitest";
import { edgeFocusArg } from "./visibility";

describe("edgeFocusArg", () => {
  it("passes the focused uuid through in lazy mode", () => {
    expect(edgeFocusArg("lazy", "abc")).toBe("abc");
  });

  it("passes null through in lazy mode when nothing is focused", () => {
    expect(edgeFocusArg("lazy", null)).toBeNull();
  });

  it("returns undefined in always mode so every edge is emitted", () => {
    expect(edgeFocusArg("always", "abc")).toBeUndefined();
    expect(edgeFocusArg("always", null)).toBeUndefined();
  });

  it("returns null in off mode so no edge is emitted, whatever the focus", () => {
    expect(edgeFocusArg("off", "abc")).toBeNull();
    expect(edgeFocusArg("off", null)).toBeNull();
  });
});
