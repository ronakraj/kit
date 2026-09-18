import { describe, it, expect } from "vitest";
import { extractWikiLinks, getBacklinksFor, type BacklinksIndex } from "./backlinks";

describe("extractWikiLinks", () => {
  it("returns an empty array for text with no links", () => {
    expect(extractWikiLinks("just plain text, nothing special")).toEqual([]);
  });

  it("extracts a single wiki link", () => {
    expect(extractWikiLinks("See [[Kubernetes]] for details.")).toEqual(["Kubernetes"]);
  });

  it("extracts multiple distinct links from one note", () => {
    expect(extractWikiLinks("[[Term A]] relates to [[Term B]] and also [[Term C]].")).toEqual([
      "Term A",
      "Term B",
      "Term C",
    ]);
  });

  it("preserves duplicate links (does not dedupe)", () => {
    expect(extractWikiLinks("[[Kubernetes]] is great. Also see [[Kubernetes]] again.")).toEqual([
      "Kubernetes",
      "Kubernetes",
    ]);
  });

  it("trims whitespace inside the brackets", () => {
    expect(extractWikiLinks("[[  Padded Term  ]]")).toEqual(["Padded Term"]);
  });

  it("does not match a single unclosed bracket pair", () => {
    expect(extractWikiLinks("this has [[ only one open bracket")).toEqual([]);
  });

  it("does not match plain single-bracket text", () => {
    expect(extractWikiLinks("a footnote [1] and an array a[0] access")).toEqual([]);
  });

  it("matches adjacent links back-to-back", () => {
    expect(extractWikiLinks("[[A]][[B]]")).toEqual(["A", "B"]);
  });
});

describe("getBacklinksFor", () => {
  function buildIndex(entries: [string, { name: string; path: string }[]][]): BacklinksIndex {
    return new Map(entries);
  }

  it("returns the linking notes for a title present in the index", () => {
    const index = buildIndex([["kubernetes", [{ name: "Kubernetes", path: "Kubernetes.md" }]]]);
    expect(getBacklinksFor(index, "Kubernetes")).toEqual([{ name: "Kubernetes", path: "Kubernetes.md" }]);
  });

  it("is case-insensitive on lookup", () => {
    const index = buildIndex([["kubernetes", [{ name: "Kubernetes", path: "Kubernetes.md" }]]]);
    expect(getBacklinksFor(index, "KUBERNETES")).toEqual([{ name: "Kubernetes", path: "Kubernetes.md" }]);
    expect(getBacklinksFor(index, "kUbErNeTeS")).toEqual([{ name: "Kubernetes", path: "Kubernetes.md" }]);
  });

  it("trims whitespace on lookup", () => {
    const index = buildIndex([["kubernetes", [{ name: "Kubernetes", path: "Kubernetes.md" }]]]);
    expect(getBacklinksFor(index, "  Kubernetes  ")).toEqual([{ name: "Kubernetes", path: "Kubernetes.md" }]);
  });

  it("returns an empty array for a title not present in the index", () => {
    const index = buildIndex([]);
    expect(getBacklinksFor(index, "Nonexistent")).toEqual([]);
  });

  it("returns the same empty array reference for repeated misses (referential stability)", () => {
    const index = buildIndex([]);
    const a = getBacklinksFor(index, "Missing One");
    const b = getBacklinksFor(index, "Missing Two");
    expect(a).toBe(b);
  });
});
