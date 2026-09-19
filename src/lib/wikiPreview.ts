import { findNoteByTitle, readNote } from "./vault";
import { stripMarkdownNoise } from "./blockHistory";
import type { TreeEntry } from "./types";

const PREVIEW_LENGTH = 220;

export interface NotePreview {
  title: string;
  snippet: string;
}

/** Cleans and truncates a note body down to a short preview snippet. */
export function cleanPreviewText(rawBody: string): string {
  const cleaned = stripMarkdownNoise(rawBody);
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
