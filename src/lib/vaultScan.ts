import { readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { parseNoteFile } from "./frontmatter";
import { flattenPages } from "./vault";
import { extractWikiLinks, type BacklinksIndex } from "./backlinks";
import type { NoteMeta, TreeEntry } from "./types";

export interface VaultScanResult {
  backlinks: BacklinksIndex;
  /** relative note path -> note body (markdown, no frontmatter) */
  contents: Map<string, string>;
  /** relative note path -> parsed frontmatter */
  metaByPath: Map<string, NoteMeta>;
  /** every tag in use across the vault */
  allTags: Set<string>;
}

/** Reads every note once to build the backlinks index and a body-content cache for search. */
export async function scanVault(vaultPath: string, tree: TreeEntry[]): Promise<VaultScanResult> {
  const backlinks: BacklinksIndex = new Map();
  const contents = new Map<string, string>();
  const metaByPath = new Map<string, NoteMeta>();
  const allTags = new Set<string>();
  const notes = flattenPages(tree).filter((p) => p.kind === "note");

  for (const note of notes) {
    let raw: string;
    try {
      raw = await readTextFile(await join(vaultPath, note.path));
    } catch {
      continue;
    }
    const { meta, body } = parseNoteFile(raw);
    contents.set(note.path, body);
    metaByPath.set(note.path, meta);
    for (const tag of meta.tags) allTags.add(tag);

    for (const linkedTitle of extractWikiLinks(body)) {
      const key = linkedTitle.toLowerCase();
      const existing = backlinks.get(key) ?? [];
      if (!existing.some((n) => n.path === note.path)) {
        existing.push({ name: note.name, path: note.path });
      }
      backlinks.set(key, existing);
    }
  }

  return { backlinks, contents, metaByPath, allTags };
}
