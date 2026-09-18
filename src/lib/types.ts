export interface NoteMeta {
  id: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** A note as stored on disk. `path` is POSIX-style (forward slashes) and relative to the vault root. */
export interface NoteRecord {
  path: string;
  title: string;
  meta: NoteMeta;
  body: string;
}

export type TreeEntry =
  | { kind: "folder"; name: string; path: string; children: TreeEntry[] }
  | { kind: "note"; name: string; path: string };
