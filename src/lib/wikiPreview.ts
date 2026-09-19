import { findNoteByTitle, readNote } from "./vault";
import { stripBlockMarkers } from "./blockHistory";
import type { TreeEntry } from "./types";

const PREVIEW_LENGTH = 220;

export interface NotePreview {
  title: string;
  snippet: string;
}

/** Strips markdown noise (block markers, fenced blocks, heading/emphasis marks) down to plain text, truncated to a short snippet. */
export function cleanPreviewText(rawBody: string): string {
  const cleaned = stripBlockMarkers(rawBody)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "(empty note)";
  return cleaned.length > PREVIEW_LENGTH ? `${cleaned.slice(0, PREVIEW_LENGTH).trim()}…` : cleaned;
}

/** Loads a short plain-text preview of the note a `[[wiki-link]]` points to, or null if no such note exists yet. */
export async function loadNotePreview(
  vaultPath: string,
  tree: TreeEntry[],
  term: string
): Promise<NotePreview | null> {
  const entry = findNoteByTitle(tree, term);
  if (!entry) return null;
  const note = await readNote(vaultPath, entry.path);
  return { title: note.title, snippet: cleanPreviewText(note.body) };
}
