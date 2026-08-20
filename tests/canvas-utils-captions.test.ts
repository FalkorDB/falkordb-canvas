import { describe, expect, it } from "vitest";
import {
  getNodeDisplayKey,
  getNodeDisplayText,
  normalizeCaptionsKeys,
} from "../src/canvas-utils";
import type { Node } from "../src/canvas-types";

const makeNode = (data: Record<string, unknown>, id = 1): Node => ({
  id,
  labels: ["A"],
  visible: true,
  color: "#f00",
  data,
});

describe("normalizeCaptionsKeys", () => {
  it.each([
    ["undefined", undefined, []],
    ["empty array", [], []],
    ["bare strings", ["name", "title"], [["name", false], ["title", false]]],
    ["flagless tuples", [["name"], ["title"]], [["name", false], ["title", false]]],
    ["full tuples", [["name", true], ["title", false]], [["name", true], ["title", false]]],
    ["mixed forms", ["name", ["title"], ["Label", true]], [["name", false], ["title", false], ["Label", true]]],
  ])("normalizes %s", (_label, input, expected) => {
    expect(normalizeCaptionsKeys(input as Parameters<typeof normalizeCaptionsKeys>[0])).toEqual(expected);
  });

  it("preserves the caller's key order", () => {
    expect(normalizeCaptionsKeys(["c", "a", "b"]).map(([key]) => key)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input: Array<string | [string, boolean?]> = ["name", ["title"]];
    normalizeCaptionsKeys(input);
    expect(input).toEqual(["name", ["title"]]);
  });
});

describe("getNodeDisplayText", () => {
  it("matches fuzzily and case-insensitively for a bare-string key", () => {
    const node = makeNode({ displayName: "Hello" });
    expect(getNodeDisplayText(node, normalizeCaptionsKeys(["name"]), false)).toBe("Hello");
  });

  it("requires an exact key match when the flag is true", () => {
    const node = makeNode({ displayName: "Hello" });
    expect(getNodeDisplayText(node, normalizeCaptionsKeys([["name", true]]), false)).toBe("1");
    expect(getNodeDisplayText(node, normalizeCaptionsKeys([["displayName", true]]), false)).toBe("Hello");
  });

  it("uses the first key that resolves to a non-empty value", () => {
    const node = makeNode({ title: "", name: "Bob" });
    expect(getNodeDisplayText(node, normalizeCaptionsKeys(["title", "name"]), false)).toBe("Bob");
  });

  it("skips whitespace-only values", () => {
    const node = makeNode({ name: "   ", title: "Boss" });
    expect(getNodeDisplayText(node, normalizeCaptionsKeys(["name", "title"]), false)).toBe("Boss");
  });

  it("falls back to the node ID when no key matches", () => {
    const node = makeNode({ other: "x" }, 42);
    expect(getNodeDisplayText(node, normalizeCaptionsKeys(["name"]), false)).toBe("42");
  });

  it("falls back to the node ID for an empty caption key list", () => {
    const node = makeNode({ name: "Bob" }, 7);
    expect(getNodeDisplayText(node, normalizeCaptionsKeys(undefined), false)).toBe("7");
  });

  it("prefixes the requested key — not the matched key — when showPropertyKeyPrefix is on", () => {
    const node = makeNode({ displayName: "Hello" });
    expect(getNodeDisplayText(node, normalizeCaptionsKeys(["name"]), true)).toBe("name: Hello");
  });

  it("prefixes the fallback with 'ID' when showPropertyKeyPrefix is on", () => {
    const node = makeNode({}, 5);
    expect(getNodeDisplayText(node, normalizeCaptionsKeys(["name"]), true)).toBe("ID: 5");
  });

  it("stringifies non-string values", () => {
    const node = makeNode({ count: 0 });
    expect(getNodeDisplayText(node, normalizeCaptionsKeys(["count"]), false)).toBe("0");
  });
});

describe("getNodeDisplayKey", () => {
  it("returns the matched data key, not the requested one", () => {
    const node = makeNode({ displayName: "Hello" });
    expect(getNodeDisplayKey(node, normalizeCaptionsKeys(["name"]))).toBe("displayName");
  });

  it("returns 'id' when no key matches", () => {
    expect(getNodeDisplayKey(makeNode({}), normalizeCaptionsKeys(["name"]))).toBe("id");
  });
});
