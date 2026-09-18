import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzySearch } from "./search";

describe("fuzzyScore", () => {
  it("returns 0 for an empty query against anything", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("returns null when the query is not a subsequence of the target", () => {
    expect(fuzzyScore("xyz", "kubernetes")).toBeNull();
  });

  it("matches a subsequence out of order in the source characters but in query order", () => {
    // "kb" is a subsequence of "kubernetes" (k...b)
    expect(fuzzyScore("kb", "kubernetes")).not.toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("KUBE", "kubernetes")).toEqual(fuzzyScore("kube", "kubernetes"));
  });

  it("scores an exact match higher than a loose subsequence match", () => {
    const exact = fuzzyScore("kubernetes", "kubernetes");
    const loose = fuzzyScore("kuits", "kubernetes"); // k-u-...-i(no)... won't even match, use a real subsequence instead
    // use a genuinely valid loose subsequence: "kts" from "kubernetes" (k...t...s)
    const looseValid = fuzzyScore("kts", "kubernetes");
    expect(exact).not.toBeNull();
    expect(looseValid).not.toBeNull();
    expect(exact!).toBeGreaterThan(looseValid!);
    void loose;
  });

  it("scores a prefix match higher than the same characters appearing mid-string", () => {
    const prefix = fuzzyScore("kube", "kubernetes");
    const midString = fuzzyScore("kube", "the kube thing");
    expect(prefix).not.toBeNull();
    expect(midString).not.toBeNull();
    expect(prefix!).toBeGreaterThan(midString!);
  });

  it("scores consecutive character matches higher than scattered ones", () => {
    // "abc" consecutively present vs scattered across a longer gap-filled string
    const consecutive = fuzzyScore("abc", "abcxxxxxxxxxx");
    const scattered = fuzzyScore("abc", "axbxcxxxxxxxx");
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive!).toBeGreaterThan(scattered!);
  });
});

describe("fuzzySearch", () => {
  const items = ["Kubernetes Basics", "Docker Compose", "React Hooks", "Rust Ownership"];

  it("returns all items unchanged (in original order) for an empty/whitespace query", () => {
    expect(fuzzySearch("   ", items, (s) => s)).toEqual(items);
    expect(fuzzySearch("", items, (s) => s)).toEqual(items);
  });

  it("returns an empty array when nothing matches", () => {
    expect(fuzzySearch("zzzzzz", items, (s) => s)).toEqual([]);
  });

  it("finds a case-insensitive match", () => {
    expect(fuzzySearch("react", items, (s) => s)).toEqual(["React Hooks"]);
  });

  it("ranks a stronger match before a weaker one", () => {
    const results = fuzzySearch("Docker", items, (s) => s);
    expect(results[0]).toBe("Docker Compose");
  });

  it("uses the provided text accessor rather than assuming string items", () => {
    const objs = [{ title: "Alpha" }, { title: "Beta" }, { title: "Gamma" }];
    expect(fuzzySearch("gam", objs, (o) => o.title)).toEqual([{ title: "Gamma" }]);
  });
});
