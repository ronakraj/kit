import { describe, it, expect } from "vitest";
import {
  encodeBlockMarker,
  splitMarkedMarkdown,
  diffBlocks,
  appendSnapshot,
  emptyHistory,
  formatRelativeTime,
  type BlockMetaMap,
} from "./blockHistory";

describe("encodeBlockMarker / splitMarkedMarkdown", () => {
  it("round-trips a single marked block", () => {
    const md = `${encodeBlockMarker("abc123")}\nHello world`;
    const chunks = splitMarkedMarkdown(md);
    expect(chunks).toEqual([{ id: "abc123", chunk: "Hello world" }]);
  });

  it("round-trips multiple marked blocks joined by blank lines", () => {
    const md = [`${encodeBlockMarker("a")}`, "First", "", `${encodeBlockMarker("b")}`, "Second"].join("\n");
    const chunks = splitMarkedMarkdown(md);
    expect(chunks).toEqual([
      { id: "a", chunk: "First" },
      { id: "b", chunk: "Second" },
    ]);
  });

  it("treats content before the first marker as id: null", () => {
    const md = `Some legacy content\n${encodeBlockMarker("a")}\nNew content`;
    const chunks = splitMarkedMarkdown(md);
    expect(chunks).toEqual([
      { id: null, chunk: "Some legacy content" },
      { id: "a", chunk: "New content" },
    ]);
  });

  it("handles markdown with no markers at all (pre-feature or externally-edited notes)", () => {
    const md = "# Title\n\nJust plain markdown, no markers anywhere.";
    const chunks = splitMarkedMarkdown(md);
    expect(chunks).toEqual([{ id: null, chunk: md.trim() }]);
  });

  it("handles empty markdown", () => {
    expect(splitMarkedMarkdown("")).toEqual([]);
  });

  it("preserves a marker whose chunk is empty (e.g. a blank paragraph block)", () => {
    const md = `${encodeBlockMarker("a")}\n\n${encodeBlockMarker("b")}\nContent`;
    const chunks = splitMarkedMarkdown(md);
    expect(chunks).toEqual([
      { id: "a", chunk: "" },
      { id: "b", chunk: "Content" },
    ]);
  });
});

describe("diffBlocks", () => {
  const AUTHOR = "author-1";

  it("creates fresh metadata for brand-new blocks", () => {
    const next = diffBlocks({}, [{ id: "a", content: "hello" }], AUTHOR, "2024-01-01T00:00:00.000Z");
    expect(next.a).toMatchObject({
      createdAt: "2024-01-01T00:00:00.000Z",
      createdBy: AUTHOR,
      lastModifiedAt: "2024-01-01T00:00:00.000Z",
      lastModifiedBy: AUTHOR,
    });
  });

  it("leaves lastModified* untouched when content is unchanged", () => {
    const first = diffBlocks({}, [{ id: "a", content: "hello" }], AUTHOR, "2024-01-01T00:00:00.000Z");
    const second = diffBlocks(first, [{ id: "a", content: "hello" }], AUTHOR, "2024-01-02T00:00:00.000Z");
    expect(second.a).toEqual(first.a);
  });

  it("bumps lastModified* (but not createdAt) when content changes", () => {
    const first = diffBlocks({}, [{ id: "a", content: "hello" }], AUTHOR, "2024-01-01T00:00:00.000Z");
    const second = diffBlocks(first, [{ id: "a", content: "hello world" }], "author-2", "2024-01-02T00:00:00.000Z");
    expect(second.a.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(second.a.createdBy).toBe(AUTHOR);
    expect(second.a.lastModifiedAt).toBe("2024-01-02T00:00:00.000Z");
    expect(second.a.lastModifiedBy).toBe("author-2");
  });

  it("drops blocks no longer present in the current document", () => {
    const first = diffBlocks(
      {},
      [
        { id: "a", content: "one" },
        { id: "b", content: "two" },
      ],
      AUTHOR,
      "2024-01-01T00:00:00.000Z"
    );
    const second = diffBlocks(first, [{ id: "a", content: "one" }], AUTHOR, "2024-01-02T00:00:00.000Z");
    expect(Object.keys(second)).toEqual(["a"]);
  });

  it("handles an empty current list", () => {
    const previous: BlockMetaMap = { a: { createdAt: "x", createdBy: "y", lastModifiedAt: "x", lastModifiedBy: "y", contentHash: "h" } };
    expect(diffBlocks(previous, [], AUTHOR, "2024-01-01T00:00:00.000Z")).toEqual({});
  });
});

describe("appendSnapshot", () => {
  const snap = (i: number) => ({ timestamp: `t${i}`, authorId: "a", markdown: `md${i}` });

  it("appends to an empty history", () => {
    const history = appendSnapshot(emptyHistory(), snap(1));
    expect(history.snapshots).toEqual([snap(1)]);
  });

  it("does not prune when under capacity", () => {
    let history = emptyHistory();
    for (let i = 0; i < 5; i++) history = appendSnapshot(history, snap(i), 10);
    expect(history.snapshots).toHaveLength(5);
    expect(history.snapshots[0]).toEqual(snap(0));
  });

  it("prunes the oldest snapshots once over capacity, keeping the newest", () => {
    let history = emptyHistory();
    for (let i = 0; i < 5; i++) history = appendSnapshot(history, snap(i), 3);
    expect(history.snapshots).toEqual([snap(2), snap(3), snap(4)]);
  });

  it("handles the exact capacity boundary without pruning", () => {
    let history = emptyHistory();
    for (let i = 0; i < 3; i++) history = appendSnapshot(history, snap(i), 3);
    expect(history.snapshots).toHaveLength(3);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  it("formats seconds", () => {
    expect(formatRelativeTime("2024-06-15T11:59:50.000Z", now)).toBe("10s ago");
  });

  it("formats just now for sub-5-second gaps", () => {
    expect(formatRelativeTime("2024-06-15T11:59:58.000Z", now)).toBe("just now");
  });

  it("formats minutes", () => {
    expect(formatRelativeTime("2024-06-15T11:30:00.000Z", now)).toBe("30m ago");
  });

  it("formats hours", () => {
    expect(formatRelativeTime("2024-06-15T06:00:00.000Z", now)).toBe("6h ago");
  });

  it("formats days", () => {
    expect(formatRelativeTime("2024-06-10T12:00:00.000Z", now)).toBe("5d ago");
  });

  it("formats months", () => {
    expect(formatRelativeTime("2024-03-15T12:00:00.000Z", now)).toBe("3mo ago");
  });

  it("formats years", () => {
    expect(formatRelativeTime("2022-06-15T12:00:00.000Z", now)).toBe("2y ago");
  });

  it("handles an invalid timestamp gracefully", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("unknown");
  });
});
