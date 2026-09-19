import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { v4 as uuidv4 } from "uuid";

export type TodoStatus = "todo" | "in-progress" | "blocked" | "done";
export type TodoPriority = "high" | "medium" | "low";

export interface TodoItem {
  id: string;
  title: string;
  status: TodoStatus;
  priority: TodoPriority;
  deadline: string | null; // ISO date (YYYY-MM-DD), no time component
  notesMarkdown: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TodoStore {
  items: TodoItem[];
}

export const TODOS_FILE = "_todos.json";

const PRIORITY_RANK: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };

export function emptyTodoStore(): TodoStore {
  return { items: [] };
}

export function createTodoItem(title: string, now: string): TodoItem {
  return {
    id: uuidv4(),
    title: title.trim() || "Untitled",
    status: "todo",
    priority: "medium",
    deadline: null,
    notesMarkdown: "",
    archived: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

/**
 * Active (non-archived) items sorted by priority (high -> low), then by
 * deadline ascending (items with a deadline sort before items without one;
 * earlier deadlines first), then by createdAt ascending as a stable
 * tiebreaker. Pure — no mutation of the input array.
 */
export function sortActiveTodos(items: TodoItem[]): TodoItem[] {
  return items
    .filter((i) => !i.archived)
    .slice()
    .sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      if (a.deadline !== b.deadline) {
        if (a.deadline === null) return 1;
        if (b.deadline === null) return -1;
        return a.deadline < b.deadline ? -1 : 1;
      }
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isOverdue(item: TodoItem, today: string = todayISO()): boolean {
  if (item.archived || item.status === "done" || !item.deadline) return false;
  return item.deadline < today;
}

export function isDueToday(item: TodoItem, today: string = todayISO()): boolean {
  if (item.archived || item.status === "done" || !item.deadline) return false;
  return item.deadline === today;
}

export function markDone(item: TodoItem, now: string): TodoItem {
  return { ...item, status: "done", archived: true, completedAt: now, updatedAt: now };
}

export function reopenItem(item: TodoItem, now: string): TodoItem {
  return { ...item, status: "todo", archived: false, completedAt: null, updatedAt: now };
}

// ---- I/O: a single JSON file at the vault root ----

function todosPath(vaultPath: string): Promise<string> {
  return join(vaultPath, TODOS_FILE);
}

export async function readTodoStore(vaultPath: string): Promise<TodoStore> {
  const absPath = await todosPath(vaultPath);
  if (!(await exists(absPath))) return emptyTodoStore();
  try {
    const raw = await readTextFile(absPath);
    const parsed = JSON.parse(raw) as Partial<TodoStore>;
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return emptyTodoStore();
  }
}

export async function writeTodoStore(vaultPath: string, store: TodoStore): Promise<void> {
  const absPath = await todosPath(vaultPath);
  await writeTextFile(absPath, JSON.stringify(store, null, 2));
}
