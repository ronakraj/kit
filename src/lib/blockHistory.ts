import { join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";

export const HISTORY_DIR = "_history";
export const SNAPSHOT_CAP = 200;

const BLOCK_MARKER_RE = /^<!--kb:([A-Za-z0-9_-]+)-->$/;

/** A stable, invisible marker embedded before a block's markdown so its id survives the markdown round-trip. */
export function encodeBlockMarker(id: string): string {
  return `<!--kb:${id}-->`;
}

export interface MarkedChunk {
  id: string | null;
  chunk: string;
}

/**
 * Splits markdown produced by the editor's save path back into per-block
 * chunks plus their stable ids. Content before the first marker (or an
 * entire file with no markers at all — e.g. a note that predates this
 * feature, or one edited outside the app) comes back as a single chunk with
 * `id: null`, so nothing is lost, it just won't have history yet.
 */
export function splitMarkedMarkdown(raw: string): MarkedChunk[] {
  const lines = raw.split("\n");
  const chunks: MarkedChunk[] = [];
  let currentId: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const chunk = currentLines.join("\n").trim();
    if (chunk.length > 0 || currentId !== null) {
      chunks.push({ id: currentId, chunk });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const m = line.match(BLOCK_MARKER_RE);
    if (m) {
      flush();
      currentId = m[1];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return chunks;
}

/** Strips `<!--kb:ID-->` marker lines from saved markdown, for display purposes (e.g. a history-snapshot preview). */
export function stripBlockMarkers(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => !BLOCK_MARKER_RE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strips markdown noise (block markers, fenced code/math/plot blocks, heading hashes, emphasis marks) down to flat plain text, for previews and search indexing. Does not truncate. */
export function stripMarkdownNoise(raw: string): string {
  return stripBlockMarkers(raw)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cheap, non-cryptographic string fingerprint (djb2) used only to detect whether a block's content changed between saves. */
function hashContent(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export interface BlockMeta {
  createdAt: string;
  createdBy: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
  /** Internal bookkeeping fingerprint of last-seen content; not meant for display. */
  contentHash: string;
}

export type BlockMetaMap = Record<string, BlockMeta>;

export interface HistorySnapshot {
  timestamp: string;
  authorId: string;
  markdown: string;
}

export interface NoteHistory {
  blocks: BlockMetaMap;
  snapshots: HistorySnapshot[];
}

export function emptyHistory(): NoteHistory {
  return { blocks: {}, snapshots: [] };
}

/**
 * Pure diff: for each block present now, creates fresh metadata if it's new,
 * bumps lastModified* only if its content actually changed since the last
 * save, and carries unchanged entries over untouched. Blocks no longer
 * present in `current` are dropped from the live map (still recoverable via
 * snapshots).
 */
export function diffBlocks(
  previous: BlockMetaMap,
  current: { id: string; content: string }[],
  authorId: string,
  now: string
): BlockMetaMap {
  const next: BlockMetaMap = {};
  for (const { id, content } of current) {
    const hash = hashContent(content);
    const prev = previous[id];
    if (!prev) {
      next[id] = { createdAt: now, createdBy: authorId, lastModifiedAt: now, lastModifiedBy: authorId, contentHash: hash };
    } else if (prev.contentHash !== hash) {
      next[id] = { ...prev, lastModifiedAt: now, lastModifiedBy: authorId, contentHash: hash };
    } else {
      next[id] = prev;
    }
  }
  return next;
}

/** Appends a snapshot and prunes the oldest ones beyond `capacity` (newest last). */
export function appendSnapshot(history: NoteHistory, snapshot: HistorySnapshot, capacity: number = SNAPSHOT_CAP): NoteHistory {
  const snapshots = [...history.snapshots, snapshot];
  const trimmed = snapshots.length > capacity ? snapshots.slice(snapshots.length - capacity) : snapshots;
  return { ...history, snapshots: trimmed };
}

/** Hand-rolled relative time formatting (no new date-formatting dependency needed for a handful of buckets). */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const sec = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

// ---- I/O: JSON sidecar per note under `_history/`, mirroring the vault's `_attachments/` pattern ----

function historyRelPath(notePath: string): string {
  return `${HISTORY_DIR}/${notePath}.json`;
}

export async function readNoteHistory(vaultPath: string, notePath: string): Promise<NoteHistory> {
  const absPath = await join(vaultPath, historyRelPath(notePath));
  if (!(await exists(absPath))) return emptyHistory();
  try {
    const raw = await readTextFile(absPath);
    const parsed = JSON.parse(raw) as Partial<NoteHistory>;
    return { blocks: parsed.blocks ?? {}, snapshots: parsed.snapshots ?? [] };
  } catch {
    return emptyHistory();
  }
}

export async function writeNoteHistory(vaultPath: string, notePath: string, history: NoteHistory): Promise<void> {
  const relPath = historyRelPath(notePath);
  const relDir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : relPath;
  const absDir = await join(vaultPath, relDir);
  if (!(await exists(absDir))) await mkdir(absDir, { recursive: true });
  const absPath = await join(vaultPath, relPath);
  await writeTextFile(absPath, JSON.stringify(history));
}
