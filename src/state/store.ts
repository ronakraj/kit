import { create } from "zustand";
import * as vault from "../lib/vault";
import { scanVault, type VaultScanResult } from "../lib/vaultScan";
import { getBacklinksFor } from "../lib/backlinks";
import * as todosLib from "../lib/todos";
import { markDone as markTodoDone, reopenItem as reopenTodoItem, type TodoItem } from "../lib/todos";
import * as trashLib from "../lib/trash";
import type { TrashEntry } from "../lib/trash";
import { computeActivityCalendar, computeDaySummary, formatDaySummaryMarkdown, DAILY_SUMMARY_HEADING } from "../lib/insights";
import type { NoteRecord, TreeEntry } from "../lib/types";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPTY_BACKLINKS: { name: string; path: string }[] = [];

let promptResolver: ((value: string | null) => void) | null = null;

interface AppState {
  vaultPath: string | null;
  vaultLoading: boolean;
  tree: TreeEntry[];
  scan: VaultScanResult | null;
  currentNote: NoteRecord | null;
  todosViewOpen: boolean;
  todos: TodoItem[] | null;
  currentTodoId: string | null;
  trashViewOpen: boolean;
  trashEntries: TrashEntry[] | null;
  noteLoading: boolean;
  selectedTag: string | null;
  searchQuery: string;
  quickSwitcherOpen: boolean;
  insightsPanelOpen: boolean;
  noteHistoryPanelOpen: boolean;
  sidebarHidden: boolean;
  showBlockHistory: boolean;
  restoreRequest: { path: string; markdown: string } | null;
  error: string | null;
  clearError: () => void;
  promptRequest: { message: string; defaultValue: string } | null;
  lastSavedAt: number | null;
  researchCount: number;
  recapRequestCount: number;

  requestPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  resolvePrompt: (value: string | null) => void;
  beginResearch: () => void;
  endResearch: () => void;
  requestRecap: () => void;
  initVault: () => Promise<void>;
  chooseVault: () => Promise<void>;
  refresh: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  openNote: (path: string) => Promise<void>;
  navigateToNoteTitle: (title: string) => Promise<void>;
  createNote: (folderPath: string, title: string) => Promise<void>;
  createFolder: (parentPath: string, name: string) => Promise<void>;
  persistNoteBody: (path: string, body: string) => Promise<void>;
  renameCurrentNote: (newTitle: string) => Promise<void>;
  deleteNote: (path: string) => Promise<void>;
  openToday: () => Promise<void>;
  openTrash: () => Promise<void>;
  closeTrash: () => void;
  restoreTrashEntry: (id: string) => Promise<void>;
  permanentlyDeleteTrashEntry: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  undoLastDelete: () => Promise<boolean>;
  appendDailySummaryIfNeeded: () => Promise<void>;
  setTagOnCurrentNote: (tag: string, add: boolean) => Promise<void>;
  setSelectedTag: (tag: string | null) => void;
  setSearchQuery: (q: string) => void;
  setQuickSwitcherOpen: (open: boolean) => void;
  setInsightsPanelOpen: (open: boolean) => void;
  setNoteHistoryPanelOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleBlockHistory: () => void;
  requestRestore: (path: string, markdown: string) => void;
  clearRestoreRequest: () => void;

  openTodos: () => Promise<void>;
  closeTodos: () => void;
  openTodoDetail: (id: string) => void;
  closeTodoDetail: () => void;
  addTodoItem: (title: string) => Promise<void>;
  updateTodoItem: (id: string, patch: Partial<Pick<TodoItem, "title" | "status" | "priority" | "deadline">>) => Promise<void>;
  saveTodoNotes: (id: string, notesMarkdown: string) => Promise<void>;
  markTodoItemDone: (id: string) => Promise<void>;
  reopenTodoItem: (id: string) => Promise<void>;
  deleteTodoItem: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  vaultPath: null,
  vaultLoading: true,
  tree: [],
  scan: null,
  currentNote: null,
  todosViewOpen: false,
  todos: null,
  currentTodoId: null,
  trashViewOpen: false,
  trashEntries: null,
  noteLoading: false,
  selectedTag: null,
  searchQuery: "",
  quickSwitcherOpen: false,
  insightsPanelOpen: false,
  noteHistoryPanelOpen: false,
  sidebarHidden: false,
  showBlockHistory: false,
  restoreRequest: null,
  error: null,
  clearError: () => set({ error: null }),
  promptRequest: null,
  lastSavedAt: null,
  researchCount: 0,
  recapRequestCount: 0,

  beginResearch: () => set((s) => ({ researchCount: s.researchCount + 1 })),
  endResearch: () => set((s) => ({ researchCount: Math.max(0, s.researchCount - 1) })),
  requestRecap: () => set((s) => ({ recapRequestCount: s.recapRequestCount + 1 })),

  requestPrompt: (message, defaultValue = "") =>
    new Promise<string | null>((resolve) => {
      promptResolver = resolve;
      set({ promptRequest: { message, defaultValue } });
    }),

  resolvePrompt: (value) => {
    const resolve = promptResolver;
    promptResolver = null;
    set({ promptRequest: null });
    resolve?.(value);
  },

  initVault: async () => {
    set({ vaultLoading: true });
    try {
      const saved = await vault.getSavedVaultPath();
      if (saved) {
        await vault.ensureVaultScaffold(saved);
        set({ vaultPath: saved });
        await get().refresh();
      }
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ vaultLoading: false });
    }
  },

  chooseVault: async () => {
    const picked = await vault.pickVaultFolder();
    if (!picked) return;
    set({ vaultLoading: true });
    try {
      await vault.ensureVaultScaffold(picked);
      await vault.saveVaultPath(picked);
      set({ vaultPath: picked, currentNote: null, todosViewOpen: false, trashViewOpen: false });
      await get().refresh();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ vaultLoading: false });
    }
  },

  refresh: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    const tree = await vault.buildTree(vaultPath);
    const scan = await scanVault(vaultPath, tree);
    // Also kept up to date here (not just in openTodos) so the sidebar's
    // todo summary badge stays live without the Todos view being open.
    const todoStore = await todosLib.readTodoStore(vaultPath);
    set({ tree, scan, todos: todoStore.items });
  },

  /** Opens any page path (currently always a note). */
  openPath: async (path: string) => {
    await get().openNote(path);
  },

  openNote: async (path: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    set({ noteLoading: true });
    try {
      const note = await vault.readNote(vaultPath, path);
      set({ currentNote: note, todosViewOpen: false, trashViewOpen: false });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ noteLoading: false });
    }
  },

  navigateToNoteTitle: async (title: string) => {
    const { vaultPath, tree } = get();
    if (!vaultPath) return;
    const existing = vault.findNoteByTitle(tree, title);
    if (existing) {
      await get().openNote(existing.path);
      return;
    }
    const note = await vault.createNote(vaultPath, "", title);
    await get().refresh();
    set({ currentNote: note, todosViewOpen: false, trashViewOpen: false });
  },

  createNote: async (folderPath: string, title: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    const note = await vault.createNote(vaultPath, folderPath, title);
    await get().refresh();
    set({ currentNote: note, todosViewOpen: false, trashViewOpen: false });
  },

  createFolder: async (parentPath: string, name: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    await vault.createFolder(vaultPath, parentPath, name);
    await get().refresh();
  },

  persistNoteBody: async (path: string, body: string) => {
    const { vaultPath, currentNote } = get();
    if (!vaultPath) return;
    const isCurrent = currentNote?.path === path;
    const base = isCurrent ? currentNote! : await vault.readNote(vaultPath, path);
    const updated: NoteRecord = { ...base, body };
    await vault.writeNote(vaultPath, updated);
    if (isCurrent) set({ currentNote: updated });
    set({ lastSavedAt: Date.now() });
    await get().refresh();
  },

  renameCurrentNote: async (newTitle: string) => {
    const { vaultPath, currentNote } = get();
    if (!vaultPath || !currentNote) return;
    const newPath = await vault.renameNote(vaultPath, currentNote.path, newTitle);
    set({ currentNote: { ...currentNote, path: newPath, title: newTitle.trim() || "Untitled" } });
    await get().refresh();
  },

  // Moves the note to the vault's trash rather than deleting it outright, so
  // it can be recovered later via the trash view or a global Ctrl/Cmd+Z.
  deleteNote: async (path: string) => {
    const { vaultPath, currentNote } = get();
    if (!vaultPath) return;
    const title =
      currentNote?.path === path ? currentNote.title : (path.split("/").pop() ?? path).replace(/\.md$/i, "");
    await trashLib.moveToTrash(vaultPath, path, title);
    if (currentNote?.path === path) set({ currentNote: null });
    await get().refresh();
  },

  openToday: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    const path = await vault.ensureTodayNote(vaultPath);
    await get().refresh();
    await get().openNote(path);
  },

  openTrash: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    set({ currentNote: null, todosViewOpen: false, currentTodoId: null, trashViewOpen: true });
    try {
      const entries = await trashLib.listTrash(vaultPath);
      set({ trashEntries: entries });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  closeTrash: () => set({ trashViewOpen: false }),

  restoreTrashEntry: async (id: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    await trashLib.restoreFromTrash(vaultPath, id);
    await get().refresh();
    await get().openTrash();
  },

  permanentlyDeleteTrashEntry: async (id: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    await trashLib.permanentlyDelete(vaultPath, id);
    await get().openTrash();
  },

  emptyTrash: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    await trashLib.emptyTrash(vaultPath);
    set({ trashEntries: [] });
  },

  // Restores the most recently deleted note. Used by the global Ctrl/Cmd+Z
  // handler (only when focus isn't in an editable field, so it doesn't
  // fight with the editor's own text-undo). Returns whether it restored
  // anything, so the caller can decide whether to also navigate there.
  undoLastDelete: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return false;
    const entries = await trashLib.listTrash(vaultPath);
    const latest = entries[0];
    if (!latest) return false;
    const restoredPath = await trashLib.restoreFromTrash(vaultPath, latest.id);
    await get().refresh();
    await get().openNote(restoredPath);
    return true;
  },

  // Once per day (first time the app is used that day), appends a "topics
  // touched" section to the most recent prior day's Daily note, listing the
  // notes written/edited that day. Silent — no UI of its own, just a vault
  // write, so it's safe to fire from a background effect on app load.
  appendDailySummaryIfNeeded: async () => {
    const { vaultPath, tree, scan } = get();
    if (!vaultPath || !scan) return;
    const today = todayISO();
    const last = await vault.getLastDailySummaryDate();
    if (last === today) return;
    await vault.saveLastDailySummaryDate(today);

    const activity = computeActivityCalendar(tree, scan, 14);
    const candidate = [...activity].reverse().find((d) => d.date < today && d.count > 0);
    if (!candidate) return;

    const notePath = `${vault.DAILY_DIR}/${candidate.date}.md`;
    let note: NoteRecord;
    try {
      note = await vault.readNote(vaultPath, notePath);
    } catch {
      return; // no Daily note for that day — nothing to append to
    }
    if (note.body.includes(DAILY_SUMMARY_HEADING)) return;

    const summary = computeDaySummary(tree, scan, candidate.date);
    // Exclude the Daily note itself — it's the container being appended to, not a "topic".
    const section = formatDaySummaryMarkdown({ ...summary, notes: summary.notes.filter((n) => n.path !== notePath) });
    if (!section) return;

    await vault.writeNote(vaultPath, { ...note, body: `${note.body.trimEnd()}\n\n${section}\n` });
    await get().refresh();
  },

  setTagOnCurrentNote: async (tag: string, add: boolean) => {
    const { vaultPath, currentNote } = get();
    if (!vaultPath || !currentNote) return;
    const trimmed = tag.trim();
    if (!trimmed) return;
    const tags = add
      ? Array.from(new Set([...currentNote.meta.tags, trimmed]))
      : currentNote.meta.tags.filter((t) => t !== trimmed);
    const updated: NoteRecord = { ...currentNote, meta: { ...currentNote.meta, tags } };
    await vault.writeNote(vaultPath, updated);
    set({ currentNote: updated });
    await get().refresh();
  },

  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setQuickSwitcherOpen: (open) => set({ quickSwitcherOpen: open }),
  setInsightsPanelOpen: (open) => set({ insightsPanelOpen: open }),
  setNoteHistoryPanelOpen: (open) => set({ noteHistoryPanelOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarHidden: !s.sidebarHidden })),
  toggleBlockHistory: () => set((s) => ({ showBlockHistory: !s.showBlockHistory })),
  requestRestore: (path, markdown) => set({ restoreRequest: { path, markdown } }),
  clearRestoreRequest: () => set({ restoreRequest: null }),

  openTodos: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    set({ currentNote: null, todosViewOpen: true, currentTodoId: null, trashViewOpen: false });
    try {
      const store = await todosLib.readTodoStore(vaultPath);
      set({ todos: store.items });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  closeTodos: () => set({ todosViewOpen: false, currentTodoId: null }),
  openTodoDetail: (id) => set({ currentTodoId: id }),
  closeTodoDetail: () => set({ currentTodoId: null }),

  addTodoItem: async (title: string) => {
    const { vaultPath, todos } = get();
    if (!vaultPath || !todos) return;
    const item = todosLib.createTodoItem(title, new Date().toISOString());
    const next = [...todos, item];
    set({ todos: next });
    await todosLib.writeTodoStore(vaultPath, { items: next });
  },

  updateTodoItem: async (id, patch) => {
    const { vaultPath, todos } = get();
    if (!vaultPath || !todos) return;
    const now = new Date().toISOString();
    const next = todos.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now } : t));
    set({ todos: next });
    await todosLib.writeTodoStore(vaultPath, { items: next });
  },

  saveTodoNotes: async (id, notesMarkdown) => {
    const { vaultPath, todos } = get();
    if (!vaultPath || !todos) return;
    const now = new Date().toISOString();
    const next = todos.map((t) => (t.id === id ? { ...t, notesMarkdown, updatedAt: now } : t));
    set({ todos: next });
    await todosLib.writeTodoStore(vaultPath, { items: next });
  },

  markTodoItemDone: async (id) => {
    const { vaultPath, todos } = get();
    if (!vaultPath || !todos) return;
    const now = new Date().toISOString();
    const next = todos.map((t) => (t.id === id ? markTodoDone(t, now) : t));
    set({ todos: next, currentTodoId: null });
    await todosLib.writeTodoStore(vaultPath, { items: next });
  },

  reopenTodoItem: async (id) => {
    const { vaultPath, todos } = get();
    if (!vaultPath || !todos) return;
    const now = new Date().toISOString();
    const next = todos.map((t) => (t.id === id ? reopenTodoItem(t, now) : t));
    set({ todos: next });
    await todosLib.writeTodoStore(vaultPath, { items: next });
  },

  deleteTodoItem: async (id) => {
    const { vaultPath, todos } = get();
    if (!vaultPath || !todos) return;
    const next = todos.filter((t) => t.id !== id);
    set({ todos: next, currentTodoId: null });
    await todosLib.writeTodoStore(vaultPath, { items: next });
  },
}));

export function useBacklinksForCurrentNote() {
  return useAppStore((s) => {
    if (!s.scan || !s.currentNote) return EMPTY_BACKLINKS;
    return getBacklinksFor(s.scan.backlinks, s.currentNote.title);
  });
}
