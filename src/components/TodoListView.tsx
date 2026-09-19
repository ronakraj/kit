import { useState } from "react";
import { useAppStore } from "../state/store";
import { sortActiveTodos, isOverdue, isDueToday, type TodoItem, type TodoPriority, type TodoStatus } from "../lib/todos";

const PRIORITY_LABEL: Record<TodoPriority, string> = { high: "High", medium: "Medium", low: "Low" };
const PRIORITY_COLOR: Record<TodoPriority, string> = { high: "#e0575f", medium: "#d99a3d", low: "var(--text-muted)" };
const STATUS_LABEL: Record<TodoStatus, string> = { todo: "To do", "in-progress": "In progress", blocked: "Blocked", done: "Done" };

export function TodoListView() {
  const todos = useAppStore((s) => s.todos);
  const requestPrompt = useAppStore((s) => s.requestPrompt);
  const addTodoItem = useAppStore((s) => s.addTodoItem);
  const updateTodoItem = useAppStore((s) => s.updateTodoItem);
  const markTodoItemDone = useAppStore((s) => s.markTodoItemDone);
  const reopenTodoItem = useAppStore((s) => s.reopenTodoItem);
  const deleteTodoItem = useAppStore((s) => s.deleteTodoItem);
  const openTodoDetail = useAppStore((s) => s.openTodoDetail);
  const [showArchive, setShowArchive] = useState(false);

  if (!todos) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  const active = sortActiveTodos(todos);
  const archived = todos.filter((t) => t.archived).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  const handleAdd = async () => {
    const title = await requestPrompt("New todo", "");
    if (title === null || !title.trim()) return;
    void addTodoItem(title);
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 pt-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
            Todos
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <button onClick={() => setShowArchive((v) => !v)} style={{ color: "var(--text-muted)" }}>
              {showArchive ? "Hide archive" : `Archive (${archived.length})`}
            </button>
            <button onClick={() => void handleAdd()} style={{ color: "var(--accent)" }} className="font-medium">
              + Add item
            </button>
          </div>
        </div>

        {showArchive ? (
          <ArchiveList items={archived} onReopen={(id) => void reopenTodoItem(id)} onDelete={(id) => void deleteTodoItem(id)} />
        ) : active.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing on your list. Click "+ Add item" to add something you want to come back to.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {active.map((item) => (
              <TodoRow
                key={item.id}
                item={item}
                onOpen={() => openTodoDetail(item.id)}
                onStatusChange={(status) => void updateTodoItem(item.id, { status })}
                onMarkDone={() => void markTodoItemDone(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TodoRow({
  item,
  onOpen,
  onStatusChange,
  onMarkDone,
}: {
  item: TodoItem;
  onOpen: () => void;
  onStatusChange: (status: TodoStatus) => void;
  onMarkDone: () => void;
}) {
  const overdue = isOverdue(item);
  const dueToday = isDueToday(item);

  return (
    <div
      className="flex items-center gap-3 rounded border px-3 py-2 text-sm"
      style={{ borderColor: "var(--border)", background: "var(--bg-panel)" }}
    >
      <input type="checkbox" checked={false} onChange={onMarkDone} title="Mark done" className="shrink-0" />
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ color: PRIORITY_COLOR[item.priority], background: "var(--bg-hover)" }}
      >
        {PRIORITY_LABEL[item.priority]}
      </span>
      <button onClick={onOpen} className="flex-1 truncate text-left" style={{ color: "var(--text)" }}>
        {item.title}
      </button>
      <select
        value={item.status}
        onChange={(e) => onStatusChange(e.target.value as TodoStatus)}
        className="shrink-0 rounded border bg-transparent px-1 py-0.5 text-xs"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        {(Object.keys(STATUS_LABEL) as TodoStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {item.deadline && (
        <span
          className="shrink-0 text-xs"
          style={{ color: overdue ? "#e0575f" : dueToday ? "#d99a3d" : "var(--text-muted)" }}
        >
          {overdue ? "Overdue " : dueToday ? "Due today " : ""}
          {item.deadline}
        </span>
      )}
    </div>
  );
}

function ArchiveList({
  items,
  onReopen,
  onDelete,
}: {
  items: TodoItem[];
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        Nothing completed yet.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-panel)" }}
        >
          <span className="flex-1 truncate" style={{ color: "var(--text-muted)", textDecoration: "line-through" }}>
            {item.title}
          </span>
          <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
            {item.completedAt?.slice(0, 10)}
          </span>
          <button onClick={() => onReopen(item.id)} className="shrink-0 text-xs" style={{ color: "var(--accent)" }}>
            Reopen
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Permanently delete "${item.title}"?`)) onDelete(item.id);
            }}
            className="shrink-0 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
