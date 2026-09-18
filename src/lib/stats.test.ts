import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeStats, computeHealthTips } from "./stats";
import type { TreeEntry, NoteMeta } from "./types";
import type { VaultScanResult } from "./vaultScan";

function note(name: string, path = `${name}.md`): TreeEntry {
  return { kind: "note", name, path };
}

function folder(name: string, path: string, children: TreeEntry[]): TreeEntry {
  return { kind: "folder", name, path, children };
}

function dailyFolder(dates: string[]): TreeEntry {
  return folder(
    "Daily",
    "Daily",
    dates.map((d) => note(d, `Daily/${d}.md`))
  );
}

function meta(overrides: Partial<NoteMeta> = {}): NoteMeta {
  return { id: "id", tags: [], createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z", ...overrides };
}

function emptyScan(): VaultScanResult {
  return { backlinks: new Map(), contents: new Map(), metaByPath: new Map(), allTags: new Set() };
}

describe("computeStats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts notes across folders and ignores folder entries themselves", () => {
    const tree: TreeEntry[] = [note("A"), folder("Sub", "Sub", [note("B", "Sub/B.md")])];
    const stats = computeStats(tree, emptyScan());
    expect(stats.noteCount).toBe(2);
  });

  it("returns zero stats for an empty vault with no scan", () => {
    const stats = computeStats([], null);
    expect(stats).toEqual({ noteCount: 0, wordsToday: 0, currentStreak: 0, longestStreak: 0 });
  });

  it("sums word counts only for notes updated today", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [note("Today"), note("Yesterday")];
    const scan = emptyScan();
    scan.metaByPath.set("Today.md", meta({ updatedAt: "2024-06-15T09:00:00.000Z" }));
    scan.contents.set("Today.md", "five words go right here");
    scan.metaByPath.set("Yesterday.md", meta({ updatedAt: "2024-06-14T09:00:00.000Z" }));
    scan.contents.set("Yesterday.md", "this should not be counted at all");

    const stats = computeStats(tree, scan);
    expect(stats.wordsToday).toBe(5);
  });

  it("treats an empty body as zero words, not one", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [note("Empty")];
    const scan = emptyScan();
    scan.metaByPath.set("Empty.md", meta({ updatedAt: "2024-06-15T09:00:00.000Z" }));
    scan.contents.set("Empty.md", "");
    expect(computeStats(tree, scan).wordsToday).toBe(0);
  });

  it("reports zero streak when there are no daily notes", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [dailyFolder([])];
    const stats = computeStats(tree, emptyScan());
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
  });

  it("counts a current streak ending today", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [dailyFolder(["2024-06-13", "2024-06-14", "2024-06-15"])];
    const stats = computeStats(tree, emptyScan());
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
  });

  it("still counts yesterday's streak as current if today has no entry yet", () => {
    vi.setSystemTime(new Date("2024-06-15T08:00:00.000Z"));
    const tree: TreeEntry[] = [dailyFolder(["2024-06-13", "2024-06-14"])];
    const stats = computeStats(tree, emptyScan());
    expect(stats.currentStreak).toBe(2);
  });

  it("resets current streak to zero once a day is skipped (broken streak)", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    // Gap on the 14th: no note that day, so "today" (15th) is a lone streak of 1.
    const tree: TreeEntry[] = [dailyFolder(["2024-06-10", "2024-06-11", "2024-06-15"])];
    const stats = computeStats(tree, emptyScan());
    expect(stats.currentStreak).toBe(1);
  });

  it("finds the longest historical run even when it's not the current streak", () => {
    vi.setSystemTime(new Date("2024-06-20T12:00:00.000Z"));
    const tree: TreeEntry[] = [
      dailyFolder(["2024-06-01", "2024-06-02", "2024-06-03", "2024-06-04", "2024-06-20"]),
    ];
    const stats = computeStats(tree, emptyScan());
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(4);
  });

  it("correctly counts a streak that spans a month boundary", () => {
    vi.setSystemTime(new Date("2024-03-02T12:00:00.000Z"));
    const tree: TreeEntry[] = [dailyFolder(["2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02"])];
    // 2024 is a leap year, so Feb has 29 days - this also exercises leap-day handling.
    const stats = computeStats(tree, emptyScan());
    expect(stats.currentStreak).toBe(4);
    expect(stats.longestStreak).toBe(4);
  });

  it("correctly counts a streak that spans a year boundary", () => {
    vi.setSystemTime(new Date("2024-01-02T12:00:00.000Z"));
    const tree: TreeEntry[] = [dailyFolder(["2023-12-30", "2023-12-31", "2024-01-01", "2024-01-02"])];
    const stats = computeStats(tree, emptyScan());
    expect(stats.currentStreak).toBe(4);
    expect(stats.longestStreak).toBe(4);
  });

  it("ignores non-date-named entries in the Daily folder", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [
      folder("Daily", "Daily", [note("2024-06-15", "Daily/2024-06-15.md"), note("scratch notes", "Daily/scratch notes.md")]),
    ];
    const stats = computeStats(tree, emptyScan());
    expect(stats.currentStreak).toBe(1);
  });
});

describe("computeHealthTips", () => {
  it("returns an empty array when there is no scan yet", () => {
    expect(computeHealthTips([note("A")], null)).toEqual([]);
  });

  it("returns an empty array for a tidy vault (tagged, linked, fresh)", () => {
    const tree: TreeEntry[] = [note("A"), note("B")];
    const scan = emptyScan();
    scan.metaByPath.set("A.md", meta({ tags: ["x"], updatedAt: new Date().toISOString() }));
    scan.metaByPath.set("B.md", meta({ tags: ["y"], updatedAt: new Date().toISOString() }));
    scan.backlinks.set("a", [{ name: "B", path: "B.md" }]);
    scan.backlinks.set("b", [{ name: "A", path: "A.md" }]);
    expect(computeHealthTips(tree, scan)).toEqual([]);
  });

  it("flags untagged notes with a correctly pluralized message", () => {
    const tree: TreeEntry[] = [note("A")];
    const scan = emptyScan();
    scan.metaByPath.set("A.md", meta({ tags: [], updatedAt: new Date().toISOString() }));
    scan.backlinks.set("a", [{ name: "Other", path: "Other.md" }]);
    const tips = computeHealthTips(tree, scan);
    expect(tips).toEqual(["1 note has no tags"]);
  });

  it("flags multiple untagged notes with plural wording", () => {
    const tree: TreeEntry[] = [note("A"), note("B")];
    const scan = emptyScan();
    scan.metaByPath.set("A.md", meta({ tags: [], updatedAt: new Date().toISOString() }));
    scan.metaByPath.set("B.md", meta({ tags: [], updatedAt: new Date().toISOString() }));
    scan.backlinks.set("a", [{ name: "X", path: "X.md" }]);
    scan.backlinks.set("b", [{ name: "X", path: "X.md" }]);
    const tips = computeHealthTips(tree, scan);
    expect(tips).toContain("2 notes have no tags");
  });

  it("flags notes with nothing linking to them", () => {
    const tree: TreeEntry[] = [note("Orphan")];
    const scan = emptyScan();
    scan.metaByPath.set("Orphan.md", meta({ tags: ["x"], updatedAt: new Date().toISOString() }));
    const tips = computeHealthTips(tree, scan);
    expect(tips).toContain("1 note has nothing linking to it");
  });

  it("flags stale notes older than the 30-day cutoff but not fresher ones", () => {
    const tree: TreeEntry[] = [note("Old"), note("Fresh")];
    const scan = emptyScan();
    const veryOld = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date().toISOString();
    scan.metaByPath.set("Old.md", meta({ tags: ["x"], updatedAt: veryOld }));
    scan.metaByPath.set("Fresh.md", meta({ tags: ["x"], updatedAt: fresh }));
    scan.backlinks.set("old", [{ name: "Fresh", path: "Fresh.md" }]);
    scan.backlinks.set("fresh", [{ name: "Old", path: "Old.md" }]);
    const tips = computeHealthTips(tree, scan);
    expect(tips).toContain("1 note hasn't been touched in 30+ days");
  });

  it("does not flag a note updated just under the stale cutoff", () => {
    const tree: TreeEntry[] = [note("Recent")];
    const scan = emptyScan();
    const justUnder = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    scan.metaByPath.set("Recent.md", meta({ tags: ["x"], updatedAt: justUnder }));
    scan.backlinks.set("recent", [{ name: "Other", path: "Other.md" }]);
    const tips = computeHealthTips(tree, scan);
    expect(tips.some((t) => t.includes("touched in 30+ days"))).toBe(false);
  });
});
