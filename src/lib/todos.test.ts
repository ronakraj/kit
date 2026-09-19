import { describe, it, expect } from "vitest";
import {
  sortActiveTodos,
  isOverdue,
  isDueToday,
  markDone,
  reopenItem,
  createTodoItem,
  summarizeTodos,
  type TodoItem,
} from "./todos";

function item(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: overrides.id ?? "id-" + Math.random(),
    title: "Item",
    status: "todo",
    priority: "medium",
    deadline: null,
    notesMarkdown: "",
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("sortActiveTodos", () => {
  it("sorts by priority high -> medium -> low", () => {
    const items = [item({ id: "low", priority: "low" }), item({ id: "high", priority: "high" }), item({ id: "med", priority: "medium" })];
    expect(sortActiveTodos(items).map((i) => i.id)).toEqual(["high", "med", "low"]);
  });

  it("within a priority tier, sorts by deadline ascending, with no-deadline last", () => {
    const items = [
      item({ id: "none", priority: "high", deadline: null }),
      item({ id: "later", priority: "high", deadline: "2026-02-01" }),
      item({ id: "sooner", priority: "high", deadline: "2026-01-05" }),
    ];
    expect(sortActiveTodos(items).map((i) => i.id)).toEqual(["sooner", "later", "none"]);
  });

  it("falls back to createdAt ascending as a stable tiebreaker", () => {
    const items = [
      item({ id: "second", priority: "high", createdAt: "2026-01-02T00:00:00.000Z" }),
      item({ id: "first", priority: "high", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(sortActiveTodos(items).map((i) => i.id)).toEqual(["first", "second"]);
  });

  it("excludes archived items", () => {
    const items = [item({ id: "active", archived: false }), item({ id: "archived", archived: true })];
    expect(sortActiveTodos(items).map((i) => i.id)).toEqual(["active"]);
  });

  it("does not mutate the input array", () => {
    const items = [item({ id: "b", priority: "low" }), item({ id: "a", priority: "high" })];
    const original = items.slice();
    sortActiveTodos(items);
    expect(items).toEqual(original);
  });
});

describe("isOverdue / isDueToday", () => {
  const today = "2026-06-15";

  it("isOverdue is true only for a past deadline on an active item", () => {
    expect(isOverdue(item({ deadline: "2026-06-14" }), today)).toBe(true);
    expect(isOverdue(item({ deadline: "2026-06-15" }), today)).toBe(false);
    expect(isOverdue(item({ deadline: "2026-06-16" }), today)).toBe(false);
    expect(isOverdue(item({ deadline: null }), today)).toBe(false);
  });

  it("isDueToday is true only when the deadline equals today", () => {
    expect(isDueToday(item({ deadline: "2026-06-15" }), today)).toBe(true);
    expect(isDueToday(item({ deadline: "2026-06-14" }), today)).toBe(false);
    expect(isDueToday(item({ deadline: null }), today)).toBe(false);
  });

  it("both are false for archived or done items regardless of deadline", () => {
    expect(isOverdue(item({ deadline: "2026-06-01", archived: true }), today)).toBe(false);
    expect(isOverdue(item({ deadline: "2026-06-01", status: "done" }), today)).toBe(false);
    expect(isDueToday(item({ deadline: "2026-06-15", status: "done" }), today)).toBe(false);
  });
});

describe("markDone / reopenItem", () => {
  it("markDone sets status done, archives, and stamps completedAt/updatedAt", () => {
    const result = markDone(item({ status: "in-progress" }), "2026-03-01T00:00:00.000Z");
    expect(result.status).toBe("done");
    expect(result.archived).toBe(true);
    expect(result.completedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(result.updatedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("reopenItem reverses markDone", () => {
    const done = markDone(item(), "2026-03-01T00:00:00.000Z");
    const reopened = reopenItem(done, "2026-03-02T00:00:00.000Z");
    expect(reopened.status).toBe("todo");
    expect(reopened.archived).toBe(false);
    expect(reopened.completedAt).toBeNull();
    expect(reopened.updatedAt).toBe("2026-03-02T00:00:00.000Z");
  });

  it("both are pure (don't mutate the input item)", () => {
    const original = item();
    const snapshot = { ...original };
    markDone(original, "2026-03-01T00:00:00.000Z");
    expect(original).toEqual(snapshot);
  });
});

describe("createTodoItem", () => {
  it("creates a well-formed item with sensible defaults", () => {
    const result = createTodoItem("  Follow up on proposal  ", "2026-01-01T00:00:00.000Z");
    expect(result.title).toBe("Follow up on proposal");
    expect(result.status).toBe("todo");
    expect(result.priority).toBe("medium");
    expect(result.deadline).toBeNull();
    expect(result.archived).toBe(false);
    expect(result.id).toBeTruthy();
  });

  it("falls back to a placeholder title when blank", () => {
    expect(createTodoItem("   ", "2026-01-01T00:00:00.000Z").title).toBe("Untitled");
  });
});

describe("summarizeTodos", () => {
  it("counts only active (non-archived) items", () => {
    const items = [item({ archived: false }), item({ archived: true }), item({ archived: false })];
    expect(summarizeTodos(items).totalActive).toBe(2);
  });

  it("buckets active items by status", () => {
    const items = [
      item({ status: "todo" }),
      item({ status: "todo" }),
      item({ status: "in-progress" }),
      item({ status: "blocked" }),
    ];
    const summary = summarizeTodos(items);
    expect(summary.byStatus).toEqual({ todo: 2, "in-progress": 1, blocked: 1, done: 0 });
  });

  it("counts high-priority active items", () => {
    const items = [item({ priority: "high" }), item({ priority: "high" }), item({ priority: "low" })];
    expect(summarizeTodos(items).highPriority).toBe(2);
  });

  it("counts overdue active items relative to the given today", () => {
    const items = [
      item({ deadline: "2026-01-01" }), // overdue
      item({ deadline: "2026-01-10" }), // not yet
      item({ deadline: "2026-01-05", status: "done", archived: true }), // archived, excluded entirely
    ];
    expect(summarizeTodos(items, "2026-01-05").overdue).toBe(1);
  });

  it("returns all zeros for an empty list", () => {
    expect(summarizeTodos([])).toEqual({
      totalActive: 0,
      byStatus: { todo: 0, "in-progress": 0, blocked: 0, done: 0 },
      highPriority: 0,
      overdue: 0,
    });
  });
});
