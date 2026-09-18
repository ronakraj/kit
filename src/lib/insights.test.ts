import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeActivityCalendar,
  computeConnectivity,
  computeTagCounts,
  computeWordTrend,
  computeRecap,
} from "./insights";
import type { TreeEntry, NoteMeta } from "./types";
import type { VaultScanResult } from "./vaultScan";

function note(name: string, path = `${name}.md`): TreeEntry {
  return { kind: "note", name, path };
}

function meta(overrides: Partial<NoteMeta> = {}): NoteMeta {
  return { id: "id", tags: [], createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z", ...overrides };
}

function emptyScan(): VaultScanResult {
  return { backlinks: new Map(), contents: new Map(), metaByPath: new Map(), allTags: new Set() };
}

describe("computeActivityCalendar", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a zero-filled calendar for an empty vault with no scan", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const days = computeActivityCalendar([], null, 5);
    expect(days).toHaveLength(5);
    expect(days.every((d) => d.count === 0)).toBe(true);
    expect(days[days.length - 1].date).toBe("2024-06-15");
    expect(days[0].date).toBe("2024-06-11");
  });

  it("buckets a note's activity onto the day it was last saved", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [note("A"), note("B")];
    const scan = emptyScan();
    scan.metaByPath.set("A.md", meta({ updatedAt: "2024-06-13T09:00:00.000Z" }));
    scan.metaByPath.set("B.md", meta({ updatedAt: "2024-06-13T20:00:00.000Z" }));
    const days = computeActivityCalendar(tree, scan, 5);
    const day13 = days.find((d) => d.date === "2024-06-13");
    expect(day13?.count).toBe(2);
  });

  it("excludes activity that falls outside the trailing window", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [note("Old")];
    const scan = emptyScan();
    scan.metaByPath.set("Old.md", meta({ updatedAt: "2024-01-01T00:00:00.000Z" }));
    const days = computeActivityCalendar(tree, scan, 5);
    expect(days.every((d) => d.count === 0)).toBe(true);
  });

  it("includes the boundary day exactly `days` ago", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [note("Boundary")];
    const scan = emptyScan();
    // days=5 spans 06-11..06-15 inclusive, so 06-11 is the oldest included day.
    scan.metaByPath.set("Boundary.md", meta({ updatedAt: "2024-06-11T00:00:00.000Z" }));
    const days = computeActivityCalendar(tree, scan, 5);
    expect(days[0].date).toBe("2024-06-11");
    expect(days[0].count).toBe(1);
  });
});

describe("computeWordTrend", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns zero-word days for an empty vault", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const days = computeWordTrend([], null, 3);
    expect(days).toEqual([
      { date: "2024-06-13", words: 0 },
      { date: "2024-06-14", words: 0 },
      { date: "2024-06-15", words: 0 },
    ]);
  });

  it("sums word counts of notes saved on the same day", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [note("A"), note("B")];
    const scan = emptyScan();
    scan.metaByPath.set("A.md", meta({ updatedAt: "2024-06-15T09:00:00.000Z" }));
    scan.contents.set("A.md", "three word note");
    scan.metaByPath.set("B.md", meta({ updatedAt: "2024-06-15T10:00:00.000Z" }));
    scan.contents.set("B.md", "two words");
    const days = computeWordTrend(tree, scan, 3);
    expect(days[days.length - 1]).toEqual({ date: "2024-06-15", words: 5 });
  });
});

describe("computeConnectivity", () => {
  it("returns empty hubs/orphans when there is no scan yet", () => {
    expect(computeConnectivity([note("A")], null)).toEqual({ hubs: [], orphans: [] });
  });

  it("ranks hubs by incoming backlink count, descending", () => {
    const tree: TreeEntry[] = [note("Popular"), note("A"), note("B"), note("C")];
    const scan = emptyScan();
    scan.backlinks.set("popular", [
      { name: "A", path: "A.md" },
      { name: "B", path: "B.md" },
      { name: "C", path: "C.md" },
    ]);
    const { hubs } = computeConnectivity(tree, scan);
    expect(hubs[0]).toEqual({ name: "Popular", path: "Popular.md", count: 3 });
  });

  it("excludes notes with zero incoming links from hubs", () => {
    const tree: TreeEntry[] = [note("Lonely")];
    const { hubs } = computeConnectivity(tree, emptyScan());
    expect(hubs).toHaveLength(0);
  });

  it("flags a note as an orphan only when it has neither incoming nor outgoing links", () => {
    const tree: TreeEntry[] = [note("Orphan"), note("LinksOut"), note("LinkedTo"), note("Target")];
    const scan = emptyScan();
    scan.contents.set("Orphan.md", "just some text, no links");
    scan.contents.set("LinksOut.md", "see [[Target]] for more");
    scan.contents.set("LinkedTo.md", "nothing here either");
    scan.contents.set("Target.md", "the destination");
    scan.backlinks.set("target", [{ name: "LinksOut", path: "LinksOut.md" }]);
    scan.backlinks.set("linkedto", [{ name: "SomeoneElse", path: "SomeoneElse.md" }]);

    const { orphans } = computeConnectivity(tree, scan);
    const orphanPaths = orphans.map((o) => o.path);
    expect(orphanPaths).toContain("Orphan.md");
    expect(orphanPaths).not.toContain("LinksOut.md"); // has an outgoing link
    expect(orphanPaths).not.toContain("LinkedTo.md"); // has an incoming link
    expect(orphanPaths).not.toContain("Target.md"); // has an incoming link
  });
});

describe("computeTagCounts", () => {
  it("returns an empty list when there is no scan yet", () => {
    expect(computeTagCounts(null)).toEqual([]);
  });

  it("counts tag usage across notes and sorts descending", () => {
    const scan = emptyScan();
    scan.metaByPath.set("A.md", meta({ tags: ["ml", "rust"] }));
    scan.metaByPath.set("B.md", meta({ tags: ["ml"] }));
    scan.metaByPath.set("C.md", meta({ tags: ["rust"] }));
    const counts = computeTagCounts(scan);
    expect(counts[0]).toEqual({ tag: "ml", count: 2 });
    expect(counts[1]).toEqual({ tag: "rust", count: 2 });
  });

  it("breaks ties alphabetically", () => {
    const scan = emptyScan();
    scan.metaByPath.set("A.md", meta({ tags: ["zebra"] }));
    scan.metaByPath.set("B.md", meta({ tags: ["apple"] }));
    const counts = computeTagCounts(scan);
    expect(counts.map((c) => c.tag)).toEqual(["apple", "zebra"]);
  });
});

describe("computeRecap", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns an all-empty recap for a fresh, empty vault", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const recap = computeRecap([], null);
    expect(recap).toEqual({
      topTag: null,
      notesThisWeek: 0,
      mostActiveDay: null,
      currentStreak: 0,
      standoutNote: null,
    });
  });

  it("composes a sensible recap from tags, activity, and connectivity", () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    const tree: TreeEntry[] = [note("Hub"), note("A"), note("B")];
    const scan = emptyScan();
    scan.metaByPath.set("Hub.md", meta({ tags: ["ml"], updatedAt: "2024-06-14T09:00:00.000Z" }));
    scan.metaByPath.set("A.md", meta({ tags: ["ml"], updatedAt: "2024-06-15T09:00:00.000Z" }));
    scan.metaByPath.set("B.md", meta({ tags: [], updatedAt: "2024-06-15T10:00:00.000Z" }));
    scan.backlinks.set("hub", [
      { name: "A", path: "A.md" },
      { name: "B", path: "B.md" },
    ]);

    const recap = computeRecap(tree, scan);
    expect(recap.topTag).toBe("ml");
    expect(recap.notesThisWeek).toBe(3);
    expect(recap.mostActiveDay).toEqual({ date: "2024-06-15", count: 2 });
    expect(recap.standoutNote).toEqual({ name: "Hub", path: "Hub.md", linkCount: 2 });
  });
});
