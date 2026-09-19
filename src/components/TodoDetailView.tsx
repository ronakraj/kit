import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateBlockNote, getDefaultReactSlashMenuItems, SuggestionMenuController } from "@blocknote/react";
import { BlockNoteView, lightDefaultTheme, darkDefaultTheme } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { filterSuggestionItems } from "@blocknote/core";
import { useAppStore } from "../state/store";
import { toPersistableBlocks, fromPersistedBlocks, type AnyBlock } from "../lib/mathBlocks";
import { getMathSlashMenuItems, type MathEditor } from "./mathBlocks";
import { editorSchema, createHeadlessEditor, type EditorPartialBlock, type EditorType } from "./floatingBlocks";
import { toPersistableFloatingBlocks, fromPersistedFloatingBlocks } from "../lib/floatingBlocks";
import type { TodoItem, TodoPriority, TodoStatus } from "../lib/todos";

const SAVE_DEBOUNCE_MS = 600;

/** A ticket's notes are one self-contained markdown blob — no per-block ids/history, unlike regular notes. */
function parseNotesMarkdown(markdown: string): EditorPartialBlock[] {
  const parser = createHeadlessEditor();
  const parsedBlocks = parser.tryParseMarkdownToBlocks(markdown) as unknown as AnyBlock[];
  const withMath = fromPersistedBlocks(parsedBlocks) as unknown as AnyBlock[];
  const parseInline = (bodyMarkdown: string): unknown => {
    const blocks = parser.tryParseMarkdownToBlocks(bodyMarkdown || " ") as unknown as AnyBlock[];
    return blocks[0]?.content ?? [];
  };
  const withFloating = fromPersistedFloatingBlocks(withMath, parseInline) as unknown as EditorPartialBlock[];
  return withFloating.length > 0 ? withFloating : [{ type: "paragraph" }];
}

function serializeNotesMarkdown(editor: EditorType): string {
  const serializeInline = (block: AnyBlock): string => {
    const asParagraph = { id: block.id, type: "paragraph", content: block.content } as unknown as EditorPartialBlock;
    return editor.blocksToMarkdownLossy([asParagraph]).trim();
  };
  const mathTransformed = toPersistableBlocks(editor.document as unknown as AnyBlock[]) as unknown as AnyBlock[];
  const persistable = toPersistableFloatingBlocks(mathTransformed, serializeInline) as unknown as EditorPartialBlock[];
  return editor.blocksToMarkdownLossy(persistable);
}

const STATUS_OPTIONS: { value: TodoStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in-progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];
const PRIORITY_OPTIONS: { value: TodoPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function TodoDetailView() {
  const todos = useAppStore((s) => s.todos);
  const currentTodoId = useAppStore((s) => s.currentTodoId);
  const item = todos?.find((t) => t.id === currentTodoId);

  if (!item) return null;
  return <BoundTodoDetail key={item.id} item={item} />;
}

function BoundTodoDetail({ item }: { item: TodoItem }) {
  const closeTodoDetail = useAppStore((s) => s.closeTodoDetail);
  const updateTodoItem = useAppStore((s) => s.updateTodoItem);
  const saveTodoNotes = useAppStore((s) => s.saveTodoNotes);
  const markTodoItemDone = useAppStore((s) => s.markTodoItemDone);
  const reopenTodoItem = useAppStore((s) => s.reopenTodoItem);
  const deleteTodoItem = useAppStore((s) => s.deleteTodoItem);

  const [titleDraft, setTitleDraft] = useState(item.title);
  const initialBlocks = useMemo(() => parseNotesMarkdown(item.notesMarkdown), [item.id]);
  const editor = useCreateBlockNote({ schema: editorSchema, initialContent: initialBlocks });

  const timerRef = useRef<number | null>(null);
  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void saveTodoNotes(item.id, serializeNotesMarkdown(editor));
  };

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    });
    window.addEventListener("beforeunload", flush);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== item.title) void updateTodoItem(item.id, { title: trimmed });
    else setTitleDraft(item.title);
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 pt-10">
        <button onClick={closeTodoDetail} className="mb-4 text-sm" style={{ color: "var(--accent)" }}>
          ← Back to list
        </button>

        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="mb-3 w-full bg-transparent text-3xl font-bold outline-none"
          style={{ color: "var(--text)" }}
        />

        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            Status
            <select
              value={item.status}
              onChange={(e) => void updateTodoItem(item.id, { status: e.target.value as TodoStatus })}
              className="rounded border bg-transparent px-1 py-0.5"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            Priority
            <select
              value={item.priority}
              onChange={(e) => void updateTodoItem(item.id, { priority: e.target.value as TodoPriority })}
              className="rounded border bg-transparent px-1 py-0.5"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            Deadline
            <input
              type="date"
              value={item.deadline ?? ""}
              onChange={(e) => void updateTodoItem(item.id, { deadline: e.target.value || null })}
              className="rounded border bg-transparent px-1 py-0.5"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            />
          </label>

          <div className="ml-auto flex items-center gap-3">
            {item.archived ? (
              <button onClick={() => void reopenTodoItem(item.id)} style={{ color: "var(--accent)" }}>
                Reopen
              </button>
            ) : (
              <button onClick={() => void markTodoItemDone(item.id)} style={{ color: "var(--accent)" }}>
                Mark done
              </button>
            )}
            <button
              onClick={() => {
                if (window.confirm(`Permanently delete "${item.title}"?`)) void deleteTodoItem(item.id);
              }}
              style={{ color: "var(--text-muted)" }}
            >
              Delete
            </button>
          </div>
        </div>

        <BlockNoteView editor={editor} theme={{ light: lightDefaultTheme, dark: darkDefaultTheme }} slashMenu={false}>
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                getMathSlashMenuItems(editor as unknown as MathEditor, getDefaultReactSlashMenuItems(editor)),
                query
              )
            }
          />
        </BlockNoteView>
      </div>
    </div>
  );
}
