import { describe, it, expect } from "vitest";
import { parseNoteFile, serializeNoteFile, emptyMeta } from "./frontmatter";
import type { NoteMeta } from "./types";

describe("emptyMeta", () => {
  it("generates a unique id and matching created/updated timestamps", () => {
    const a = emptyMeta();
    const b = emptyMeta();
    expect(a.id).not.toBe(b.id);
    expect(a.tags).toEqual([]);
    expect(a.createdAt).toBe(a.updatedAt);
  });
});

describe("serializeNoteFile / parseNoteFile round-trip", () => {
  it("round-trips meta and body exactly", () => {
    const meta: NoteMeta = {
      id: "abc-123",
      tags: ["tech", "reading"],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };
    const body = "# Hello\n\nSome **content** with a [[wiki link]].";

    const raw = serializeNoteFile(meta, body);
    const { meta: parsedMeta, body: parsedBody } = parseNoteFile(raw);

    expect(parsedMeta).toEqual(meta);
    expect(parsedBody).toBe(body);
  });

  it("round-trips an empty body", () => {
    const meta = emptyMeta();
    const raw = serializeNoteFile(meta, "");
    const { body } = parseNoteFile(raw);
    expect(body).toBe("");
  });

  it("round-trips an empty tags array", () => {
    const meta = emptyMeta();
    const raw = serializeNoteFile(meta, "body");
    const { meta: parsed } = parseNoteFile(raw);
    expect(parsed.tags).toEqual([]);
  });

  it("preserves multiple tags in order", () => {
    const meta: NoteMeta = { id: "x", tags: ["a", "b", "c"], createdAt: "t1", updatedAt: "t2" };
    const raw = serializeNoteFile(meta, "body");
    const { meta: parsed } = parseNoteFile(raw);
    expect(parsed.tags).toEqual(["a", "b", "c"]);
  });
});

describe("parseNoteFile on non-round-tripped input", () => {
  it("treats a file with no frontmatter block as pure body, with generated fallback meta", () => {
    const raw = "Just plain text, no frontmatter at all.";
    const { meta, body } = parseNoteFile(raw);
    expect(body).toBe(raw);
    expect(meta.tags).toEqual([]);
    expect(typeof meta.id).toBe("string");
    expect(meta.id.length).toBeGreaterThan(0);
  });

  it("falls back to empty meta when the frontmatter block contains invalid YAML", () => {
    const raw = "---\nid: [unterminated\n---\nBody text";
    const { meta, body } = parseNoteFile(raw);
    expect(meta.tags).toEqual([]);
    expect(body).toBe("Body text");
  });

  it("handles a frontmatter block with no body after it", () => {
    const raw = "---\nid: abc\ntags: []\ncreatedAt: t1\nupdatedAt: t2\n---\n";
    const { meta, body } = parseNoteFile(raw);
    expect(meta.id).toBe("abc");
    expect(body).toBe("");
  });

  it("filters non-string entries out of a malformed tags array", () => {
    const raw = "---\nid: abc\ntags: [ok, 42, true]\ncreatedAt: t1\nupdatedAt: t2\n---\nbody";
    const { meta } = parseNoteFile(raw);
    expect(meta.tags).toEqual(["ok"]);
  });

  it("falls back to an empty array when tags is missing entirely", () => {
    const raw = "---\nid: abc\ncreatedAt: t1\nupdatedAt: t2\n---\nbody";
    const { meta } = parseNoteFile(raw);
    expect(meta.tags).toEqual([]);
  });

  it("generates a fresh id when the frontmatter id field is missing or non-string", () => {
    const raw = "---\ntags: []\ncreatedAt: t1\nupdatedAt: t2\n---\nbody";
    const { meta } = parseNoteFile(raw);
    expect(typeof meta.id).toBe("string");
    expect(meta.id.length).toBeGreaterThan(0);
  });

  it("supports CRLF line endings in the frontmatter delimiters", () => {
    const raw = "---\r\nid: abc\r\ntags: []\r\ncreatedAt: t1\r\nupdatedAt: t2\r\n---\r\nbody text";
    const { meta, body } = parseNoteFile(raw);
    expect(meta.id).toBe("abc");
    expect(body).toBe("body text");
  });
});
