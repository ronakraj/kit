import { join } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, readTextFile, writeTextFile, rename as renameFs, remove as removeFs } from "@tauri-apps/plugin-fs";
import { v4 as uuidv4 } from "uuid";
import { historyRelPath } from "./blockHistory";

export const TRASH_DIR = "_trash";

export interface TrashEntry {
  id: string;
  originalPath: string;
  title: string;
  deletedAt: string;
}

const metaRelPath = (id: string) => `${TRASH_DIR}/${id}.meta.json`;
const noteRelPath = (id: string) => `${TRASH_DIR}/${id}.md`;
const historyBackupRelPath = (id: string) => `${TRASH_DIR}/${id}.history.json`;

async function ensureDir(vaultPath: string, relDir: string): Promise<void> {
  const abs = await join(vaultPath, relDir);
  if (!(await exists(abs))) await mkdir(abs, { recursive: true });
}

/**
 * Moves a note — and its block-edit-history sidecar, if it has one — into
 * the vault's trash folder rather than deleting it outright, recording
 * enough metadata (original path, title, deletion time) to restore it
 * later via `restoreFromTrash`.
 */
export async function moveToTrash(vaultPath: string, relativePath: string, title: string): Promise<TrashEntry> {
  await ensureDir(vaultPath, TRASH_DIR);
  const id = uuidv4();
  const deletedAt = new Date().toISOString();

  await renameFs(await join(vaultPath, relativePath), await join(vaultPath, noteRelPath(id)));

  const historyAbs = await join(vaultPath, historyRelPath(relativePath));
  if (await exists(historyAbs)) {
    await renameFs(historyAbs, await join(vaultPath, historyBackupRelPath(id)));
  }

  const entry: TrashEntry = { id, originalPath: relativePath, title, deletedAt };
  await writeTextFile(await join(vaultPath, metaRelPath(id)), JSON.stringify(entry));
  return entry;
}

/** Lists everything currently in the trash, most recently deleted first. */
export async function listTrash(vaultPath: string): Promise<TrashEntry[]> {
  const dirAbs = await join(vaultPath, TRASH_DIR);
  if (!(await exists(dirAbs))) return [];
  const dirEntries = await readDir(dirAbs);
  const metas: TrashEntry[] = [];
  for (const e of dirEntries) {
    if (!e.isFile || !e.name.endsWith(".meta.json")) continue;
    try {
      const raw = await readTextFile(await join(dirAbs, e.name));
      metas.push(JSON.parse(raw) as TrashEntry);
    } catch {
      // Skip a corrupt/partially-written metadata file rather than failing the whole listing.
    }
  }
  return metas.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * Restores a trashed note back to its original path, along with its
 * history sidecar if one was captured. If something now occupies the
 * original path, restores alongside it with " (restored)" appended instead
 * of overwriting. Returns the path it was restored to.
 */
export async function restoreFromTrash(vaultPath: string, id: string): Promise<string> {
  const metaAbs = await join(vaultPath, metaRelPath(id));
  const raw = await readTextFile(metaAbs);
  const entry = JSON.parse(raw) as TrashEntry;

  let targetPath = entry.originalPath;
  if (await exists(await join(vaultPath, targetPath))) {
    const dot = targetPath.toLowerCase().lastIndexOf(".md");
    const stem = dot !== -1 ? targetPath.slice(0, dot) : targetPath;
    targetPath = `${stem} (restored).md`;
  }

  const folder = targetPath.includes("/") ? targetPath.slice(0, targetPath.lastIndexOf("/")) : "";
  if (folder) await ensureDir(vaultPath, folder);
  await renameFs(await join(vaultPath, noteRelPath(id)), await join(vaultPath, targetPath));

  const historyBackupAbs = await join(vaultPath, historyBackupRelPath(id));
  if (await exists(historyBackupAbs)) {
    const historyTargetRel = historyRelPath(targetPath);
    const historyFolder = historyTargetRel.slice(0, historyTargetRel.lastIndexOf("/"));
    await ensureDir(vaultPath, historyFolder);
    await renameFs(historyBackupAbs, await join(vaultPath, historyTargetRel));
  }

  await removeFs(metaAbs);
  return targetPath;
}

/** Permanently deletes one trashed note: its note file, history backup (if any), and metadata. */
export async function permanentlyDelete(vaultPath: string, id: string): Promise<void> {
  for (const rel of [noteRelPath(id), historyBackupRelPath(id), metaRelPath(id)]) {
    const abs = await join(vaultPath, rel);
    if (await exists(abs)) await removeFs(abs);
  }
}

/** Empties the entire trash, permanently deleting everything in it. */
export async function emptyTrash(vaultPath: string): Promise<void> {
  const entries = await listTrash(vaultPath);
  for (const entry of entries) {
    await permanentlyDelete(vaultPath, entry.id);
  }
}
