import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  readDir,
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
  rename as renameFs,
  remove as removeFs,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { load as loadStore, type Store } from "@tauri-apps/plugin-store";
import { v4 as uuidv4 } from "uuid";
import { parseNoteFile, serializeNoteFile, emptyMeta } from "./frontmatter";
import { HISTORY_DIR } from "./blockHistory";
import type { NoteRecord, TreeEntry } from "./types";

export const DAILY_DIR = "Daily";
export const ATTACHMENTS_DIR = "_attachments";
const SETTINGS_FILE = "settings.json";
const VAULT_PATH_KEY = "vaultPath";
const LAST_RECAP_DATE_KEY = "lastRecapDate";
const AUTHOR_ID_KEY = "authorId";

let settingsStore: Store | null = null;

async function getSettingsStore(): Promise<Store> {
  if (!settingsStore) {
    settingsStore = await loadStore(SETTINGS_FILE);
  }
  return settingsStore;
}

export async function getSavedVaultPath(): Promise<string | undefined> {
  const store = await getSettingsStore();
  return store.get<string>(VAULT_PATH_KEY);
}

export async function saveVaultPath(path: string): Promise<void> {
  const store = await getSettingsStore();
  await store.set(VAULT_PATH_KEY, path);
  await store.save();
}

export async function getLastRecapDate(): Promise<string | undefined> {
  const store = await getSettingsStore();
  return store.get<string>(LAST_RECAP_DATE_KEY);
}

export async function saveLastRecapDate(dateISO: string): Promise<void> {
  const store = await getSettingsStore();
  await store.set(LAST_RECAP_DATE_KEY, dateISO);
  await store.save();
}

/**
 * A stable local identity for attributing block-level edit history. There's
 * no accounts/multi-user infrastructure yet — this is forward-looking
 * scaffolding so a future sync/collaboration feature has an author id to
 * key off of. Generated once and persisted.
 */
export async function getAuthorId(): Promise<string> {
  const store = await getSettingsStore();
  const existing = await store.get<string>(AUTHOR_ID_KEY);
  if (existing) return existing;
  const id = uuidv4();
  await store.set(AUTHOR_ID_KEY, id);
  await store.save();
  return id;
}

/** Opens a native directory picker and returns the chosen path, or null if cancelled. */
export async function pickVaultFolder(): Promise<string | null> {
  const selected = await openDialog({ directory: true, multiple: false });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
}

/** Ensures the vault's well-known subfolders exist. */
export async function ensureVaultScaffold(vaultPath: string): Promise<void> {
  const dailyPath = await join(vaultPath, DAILY_DIR);
  const attachmentsPath = await join(vaultPath, ATTACHMENTS_DIR);
  const historyPath = await join(vaultPath, HISTORY_DIR);
  if (!(await exists(dailyPath))) await mkdir(dailyPath, { recursive: true });
  if (!(await exists(attachmentsPath))) await mkdir(attachmentsPath, { recursive: true });
  if (!(await exists(historyPath))) await mkdir(historyPath, { recursive: true });
}

export function joinRelative(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/");
}

function titleFromFilename(name: string): string {
  return name.replace(/\.md$/i, "");
}

/** Recursively builds the folder/note tree for the vault, skipping the attachments and history folders. */
export async function buildTree(vaultPath: string, relativePath = ""): Promise<TreeEntry[]> {
  const absDir = relativePath ? await join(vaultPath, relativePath) : vaultPath;
  const entries = await readDir(absDir);
  const result: TreeEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const entryRelPath = joinRelative(relativePath, entry.name);
    const lowerName = entry.name.toLowerCase();

    if (entry.isDirectory) {
      if (relativePath === "" && (entry.name === ATTACHMENTS_DIR || entry.name === HISTORY_DIR)) continue;
      const children = await buildTree(vaultPath, entryRelPath);
      result.push({ kind: "folder", name: entry.name, path: entryRelPath, children });
    } else if (entry.isFile && lowerName.endsWith(".md")) {
      result.push({ kind: "note", name: titleFromFilename(entry.name), path: entryRelPath });
    }
  }

  result.sort((a, b) => {
    const rank = (e: TreeEntry) => (e.kind === "folder" ? 0 : 1);
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
  return result;
}

export async function readNote(vaultPath: string, relativePath: string): Promise<NoteRecord> {
  const absPath = await join(vaultPath, relativePath);
  const raw = await readTextFile(absPath);
  const { meta, body } = parseNoteFile(raw);
  const name = relativePath.split("/").pop() ?? relativePath;
  return { path: relativePath, title: titleFromFilename(name), meta, body };
}

export async function writeNote(vaultPath: string, note: NoteRecord): Promise<void> {
  const absPath = await join(vaultPath, note.path);
  const meta = { ...note.meta, updatedAt: new Date().toISOString() };
  await writeTextFile(absPath, serializeNoteFile(meta, note.body));
  note.meta = meta;
}

export async function createNote(
  vaultPath: string,
  folderRelativePath: string,
  title: string
): Promise<NoteRecord> {
  const safeTitle = title.trim() || "Untitled";
  let fileName = `${safeTitle}.md`;
  let relPath = joinRelative(folderRelativePath, fileName);
  let counter = 2;
  while (await exists(await join(vaultPath, relPath))) {
    fileName = `${safeTitle} ${counter}.md`;
    relPath = joinRelative(folderRelativePath, fileName);
    counter++;
  }

  const note: NoteRecord = { path: relPath, title: titleFromFilename(fileName), meta: emptyMeta(), body: "" };
  await writeTextFile(await join(vaultPath, relPath), serializeNoteFile(note.meta, note.body));
  return note;
}

export async function createFolder(vaultPath: string, parentRelativePath: string, name: string): Promise<string> {
  const relPath = joinRelative(parentRelativePath, name.trim() || "New Folder");
  await mkdir(await join(vaultPath, relPath), { recursive: true });
  return relPath;
}

/** Renames a note's underlying file, keeping it in the same folder. Returns the new relative path. */
export async function renameNote(vaultPath: string, oldRelativePath: string, newTitle: string): Promise<string> {
  const safeTitle = newTitle.trim() || "Untitled";
  const folder = oldRelativePath.includes("/") ? oldRelativePath.slice(0, oldRelativePath.lastIndexOf("/")) : "";
  const newRelPath = joinRelative(folder, `${safeTitle}.md`);
  if (newRelPath === oldRelativePath) return oldRelativePath;
  await renameFs(await join(vaultPath, oldRelativePath), await join(vaultPath, newRelPath));
  return newRelPath;
}

export async function deleteNote(vaultPath: string, relativePath: string): Promise<void> {
  await removeFs(await join(vaultPath, relativePath));
}

/** Ensures today's daily note exists and returns its relative path. */
export async function ensureTodayNote(vaultPath: string): Promise<string> {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const relPath = joinRelative(DAILY_DIR, `${iso}.md`);
  const absPath = await join(vaultPath, relPath);
  if (!(await exists(absPath))) {
    const meta = emptyMeta();
    await writeTextFile(absPath, serializeNoteFile(meta, ""));
  }
  return relPath;
}

/** Finds an existing note by title anywhere in the vault, searching the given tree. */
export function findNoteByTitle(tree: TreeEntry[], title: string): TreeEntry | null {
  const lower = title.trim().toLowerCase();
  const stack = [...tree];
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.kind === "note" && entry.name.toLowerCase() === lower) return entry;
    if (entry.kind === "folder") stack.push(...entry.children);
  }
  return null;
}

export interface PageRef {
  name: string;
  path: string;
  kind: "note";
}

/** Flattens the tree into a list of every note, skipping folders. */
export function flattenPages(tree: TreeEntry[]): PageRef[] {
  const result: PageRef[] = [];
  const stack = [...tree];
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.kind === "note") {
      result.push({ name: entry.name, path: entry.path, kind: entry.kind });
    } else {
      stack.push(...entry.children);
    }
  }
  return result;
}
