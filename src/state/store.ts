import { create } from "zustand";
import * as vault from "../lib/vault";
import { scanVault, type VaultScanResult } from "../lib/vaultScan";
import { getBacklinksFor } from "../lib/backlinks";
import type { NoteRecord, TreeEntry } from "../lib/types";

const EMPTY_BACKLINKS: { name: string; path: string }[] = [];

let promptResolver: ((value: string | null) => void) | null = null;

interface AppState {
  vaultPath: string | null;
  vaultLoading: boolean;
  tree: TreeEntry[];
  scan: VaultScanResult | null;
  currentNote: NoteRecord | null;
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
}

export const useAppStore = create<AppState>((set, get) => ({
  vaultPath: null,
  vaultLoading: true,
  tree: [],
  scan: null,
  currentNote: null,
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
      set({ vaultPath: picked, currentNote: null });
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
    set({ tree, scan });
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
      set({ currentNote: note });
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
    set({ currentNote: note });
  },

  createNote: async (folderPath: string, title: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    const note = await vault.createNote(vaultPath, folderPath, title);
    await get().refresh();
    set({ currentNote: note });
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

  deleteNote: async (path: string) => {
    const { vaultPath, currentNote } = get();
    if (!vaultPath) return;
    await vault.deleteNote(vaultPath, path);
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
}));

export function useBacklinksForCurrentNote() {
  return useAppStore((s) => {
    if (!s.scan || !s.currentNote) return EMPTY_BACKLINKS;
    return getBacklinksFor(s.scan.backlinks, s.currentNote.title);
  });
}
