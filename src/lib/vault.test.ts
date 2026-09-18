import { describe, it, expect } from "vitest";
import { joinRelative, findNoteByTitle, flattenPages, DAILY_DIR, ATTACHMENTS_DIR } from "./vault";
import type { TreeEntry } from "./types";

describe("joinRelative", () => {
  it("joins non-empty parts with a single slash", () => {
    expect(joinRelative("Folder", "note.md")).toBe("Folder/note.md");
  });

  it("skips empty/falsy parts", () => {
    expect(joinRelative("", "note.md")).toBe("note.md");
    expect(joinRelative("Folder", "")).toBe("Folder");
  });

  it("collapses accidental duplicate slashes", () => {
    expect(joinRelative("Folder/", "/note.md")).toBe("Folder/note.md");
  });

  it("returns an empty string when every part is empty", () => {
    expect(joinRelative("", "")).toBe("");
  });

  it("handles a single part", () => {
    expect(joinRelative("note.md")).toBe("note.md");
  });
});

describe("findNoteByTitle", () => {
  const tree: TreeEntry[] = [
    { kind: "note", name: "Top Level", path: "Top Level.md" },
    {
      kind: "folder",
      name: "Sub",
      path: "Sub",
      children: [
        { kind: "note", name: "Nested", path: "Sub/Nested.md" },
        { kind: "folder", name: "Deep", path: "Sub/Deep", children: [{ kind: "note", name: "Deeper", path: "Sub/Deep/Deeper.md" }] },
      ],
    },
  ];

  it("finds a top-level note by exact title", () => {
    expect(findNoteByTitle(tree, "Top Level")).toEqual({ kind: "note", name: "Top Level", path: "Top Level.md" });
  });

  it("finds a note nested inside folders", () => {
    expect(findNoteByTitle(tree, "Nested")?.path).toBe("Sub/Nested.md");
  });

  it("finds a note nested multiple folders deep", () => {
    expect(findNoteByTitle(tree, "Deeper")?.path).toBe("Sub/Deep/Deeper.md");
  });

  it("is case-insensitive", () => {
    expect(findNoteByTitle(tree, "top level")).not.toBeNull();
    expect(findNoteByTitle(tree, "TOP LEVEL")).not.toBeNull();
  });

  it("trims whitespace before matching", () => {
    expect(findNoteByTitle(tree, "  Top Level  ")).not.toBeNull();
  });

  it("returns null when no note matches", () => {
    expect(findNoteByTitle(tree, "Does Not Exist")).toBeNull();
  });

  it("returns null for an empty tree", () => {
    expect(findNoteByTitle([], "Anything")).toBeNull();
  });
});

describe("flattenPages", () => {
  it("returns an empty array for an empty tree", () => {
    expect(flattenPages([])).toEqual([]);
  });

  it("flattens notes at the top level", () => {
    const tree: TreeEntry[] = [
      { kind: "note", name: "A", path: "A.md" },
      { kind: "note", name: "B", path: "B.md" },
    ];
    expect(flattenPages(tree)).toHaveLength(2);
  });

  it("flattens notes nested inside folders and excludes the folders themselves", () => {
    const tree: TreeEntry[] = [
      { kind: "folder", name: "Sub", path: "Sub", children: [{ kind: "note", name: "Nested", path: "Sub/Nested.md" }] },
    ];
    const pages = flattenPages(tree);
    expect(pages).toEqual([{ name: "Nested", path: "Sub/Nested.md", kind: "note" }]);
  });

  it("handles an empty folder without error", () => {
    const tree: TreeEntry[] = [{ kind: "folder", name: "Empty", path: "Empty", children: [] }];
    expect(flattenPages(tree)).toEqual([]);
  });
});

describe("well-known directory constants", () => {
  it("are distinct and non-empty", () => {
    expect(DAILY_DIR).toBeTruthy();
    expect(ATTACHMENTS_DIR).toBeTruthy();
    expect(DAILY_DIR).not.toBe(ATTACHMENTS_DIR);
  });
});
