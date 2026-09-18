import YAML from "yaml";
import { v4 as uuidv4 } from "uuid";
import type { NoteMeta } from "./types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseNoteFile(raw: string): { meta: NoteMeta; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { meta: emptyMeta(), body: raw };
  }

  const [, frontmatter, body] = match;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (YAML.parse(frontmatter) as Record<string, unknown>) ?? {};
  } catch {
    parsed = {};
  }

  return {
    meta: {
      id: typeof parsed.id === "string" ? parsed.id : emptyMeta().id,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string") : [],
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    },
    body,
  };
}

export function serializeNoteFile(meta: NoteMeta, body: string): string {
  const frontmatter = YAML.stringify({
    id: meta.id,
    tags: meta.tags,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  }).trimEnd();
  return `---\n${frontmatter}\n---\n${body}`;
}

export function emptyMeta(): NoteMeta {
  const now = new Date().toISOString();
  return { id: uuidv4(), tags: [], createdAt: now, updatedAt: now };
}
