import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateBlockNote,
  useComponentsContext,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from "@blocknote/react";
import { BlockNoteView, lightDefaultTheme, darkDefaultTheme } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { BlockNoteEditor, filterSuggestionItems } from "@blocknote/core";
import { useAppStore } from "../state/store";
import { createUploadFileHandler } from "../lib/attachments";
import { researchTerm } from "../lib/ai";
import { toPersistableBlocks, fromPersistedBlocks, type AnyBlock } from "../lib/mathBlocks";
import { mathSchema, getMathSlashMenuItems, type MathPartialBlock } from "./mathBlocks";
import {
  encodeBlockMarker,
  splitMarkedMarkdown,
  diffBlocks,
  appendSnapshot,
  emptyHistory,
  formatRelativeTime,
  readNoteHistory,
  writeNoteHistory,
  type NoteHistory,
} from "../lib/blockHistory";
import { getAuthorId } from "../lib/vault";
import { extractPasteSourceUrl } from "../lib/pasteSource";
import { TagChips } from "./TagChips";
import { BacklinksPanel } from "./BacklinksPanel";

const SAVE_DEBOUNCE_MS = 600;
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;
const GO_DEEPER_TEXT = "🔍 Go deeper";

/**
 * Parses markdown back into blocks, reattaching each top-level block's
 * stable id from its `<!--kb:ID-->` marker (see `blockHistory.ts`) so
 * created/modified history survives across app restarts. Content with no
 * marker (legacy notes, or ones edited outside the app) still parses fine,
 * it just starts fresh history from its next save.
 */
function parseMarkdownToBlocks(markdown: string): MathPartialBlock[] {
  const parser = BlockNoteEditor.create({ schema: mathSchema });
  const chunks = splitMarkedMarkdown(markdown);
  const allBlocks: MathPartialBlock[] = [];

  for (const { id, chunk } of chunks) {
    const parsedChunkBlocks = parser.tryParseMarkdownToBlocks(chunk) as unknown as AnyBlock[];
    const withMath = fromPersistedBlocks(parsedChunkBlocks) as unknown as MathPartialBlock[];

    if (withMath.length === 0) {
      if (id) allBlocks.push({ type: "paragraph", id });
      continue;
    }
    if (id) {
      // A chunk parsing into multiple blocks is rare (top-level chunking is
      // usually 1:1), but if it happens, the stable id goes to the first
      // resulting block; the rest just start fresh history.
      const [first, ...rest] = withMath;
      allBlocks.push({ ...first, id }, ...rest);
    } else {
      allBlocks.push(...withMath);
    }
  }

  return allBlocks.length > 0 ? allBlocks : [{ type: "paragraph" }];
}

/**
 * Converts the editor's current document into markdown for saving: each
 * top-level block is transformed (math blocks -> code blocks) and rendered
 * to markdown individually, wrapped in a `<!--kb:ID-->` marker so its stable
 * id round-trips through the plain-text file. Also returns each block's
 * rendered content alongside its id, for `diffBlocks` to compare against the
 * previous save.
 */
function buildMarkdownWithHistory(editor: {
  document: unknown;
  blocksToMarkdownLossy: (blocks?: MathPartialBlock[]) => string;
}): { markdown: string; entries: { id: string; content: string }[] } {
  const topBlocks = editor.document as MathPartialBlock[];
  const entries: { id: string; content: string }[] = [];
  const chunks: string[] = [];

  for (const block of topBlocks) {
    if (!block.id) continue;
    const [persistable] = toPersistableBlocks([block as unknown as AnyBlock]) as unknown as MathPartialBlock[];
    const content = editor.blocksToMarkdownLossy([persistable]).trim();
    entries.push({ id: block.id, content });
    chunks.push(`${encodeBlockMarker(block.id)}\n${content}`);
  }

  return { markdown: chunks.join("\n\n"), entries };
}

/** Provides the "research selected term" trigger down to the custom formatting toolbar button. */
const ResearchTriggerContext = createContext<(() => void) | null>(null);

function CustomFormattingToolbar() {
  const triggerResearch = useContext(ResearchTriggerContext);
  const components = useComponentsContext();
  const ToolbarButton = components?.FormattingToolbar.Button;
  return (
    <FormattingToolbar>
      {getFormattingToolbarItems()}
      {ToolbarButton && (
        <ToolbarButton mainTooltip="Research this term with AI" onClick={() => triggerResearch?.()}>
          ✨ Research
        </ToolbarButton>
      )}
    </FormattingToolbar>
  );
}

export function Editor() {
  const currentNote = useAppStore((s) => s.currentNote);
  const vaultPath = useAppStore((s) => s.vaultPath);

  if (!currentNote || !vaultPath) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
        Select or create a note to get started.
      </div>
    );
  }

  return (
    <BoundEditor key={currentNote.path} path={currentNote.path} vaultPath={vaultPath} initialBody={currentNote.body} />
  );
}

function BoundEditor({ path, vaultPath, initialBody }: { path: string; vaultPath: string; initialBody: string }) {
  const currentNote = useAppStore((s) => s.currentNote);
  const persistNoteBody = useAppStore((s) => s.persistNoteBody);
  const renameCurrentNote = useAppStore((s) => s.renameCurrentNote);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const navigateToNoteTitle = useAppStore((s) => s.navigateToNoteTitle);
  const beginResearch = useAppStore((s) => s.beginResearch);
  const endResearch = useAppStore((s) => s.endResearch);
  const showBlockHistory = useAppStore((s) => s.showBlockHistory);
  const restoreRequest = useAppStore((s) => s.restoreRequest);
  const clearRestoreRequest = useAppStore((s) => s.clearRestoreRequest);

  const [titleDraft, setTitleDraft] = useState(currentNote?.title ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [gutterEntries, setGutterEntries] = useState<{ id: string; top: number; short: string; full: string }[]>([]);
  const gutterWrapRef = useRef<HTMLDivElement | null>(null);
  const initialBlocks = useMemo(() => parseMarkdownToBlocks(initialBody), [path]);
  const uploadFile = useMemo(() => createUploadFileHandler(vaultPath), [vaultPath]);

  const editor = useCreateBlockNote({ schema: mathSchema, initialContent: initialBlocks, uploadFile });

  // Block-level edit history (git-blame-ish): loaded once per note, updated
  // in-memory on every save, and written to a JSON sidecar under
  // `_history/` so it survives restarts without touching the note's own
  // plain markdown file. Read via ref (not state) since the hover tooltip
  // only needs it at hover time, not as a rendered/reactive value.
  const historyRef = useRef<NoteHistory>(emptyHistory());
  const authorIdRef = useRef<string>("local");

  // Recomputes the gutter's per-block labels from the live DOM (each block's
  // rendered position) and `historyRef` (its metadata). Called after content
  // changes, history updates, the toggle flips, or the window resizes (since
  // line-wrapping shifts block heights/positions).
  const recomputeGutter = () => {
    if (!showBlockHistory || !gutterWrapRef.current) {
      setGutterEntries((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const containerRect = gutterWrapRef.current.getBoundingClientRect();
    const blockEls = gutterWrapRef.current.querySelectorAll<HTMLElement>("[data-id]");
    const seen = new Set<string>();
    const entries: { id: string; top: number; short: string; full: string }[] = [];
    blockEls.forEach((el) => {
      const id = el.getAttribute("data-id");
      if (!id || seen.has(id)) return;
      const meta = historyRef.current.blocks[id];
      if (!meta) return;
      seen.add(id);
      const rect = el.getBoundingClientRect();
      entries.push({
        id,
        top: rect.top - containerRect.top,
        short: formatRelativeTime(meta.lastModifiedAt),
        full: `Added ${formatRelativeTime(meta.createdAt)} · Modified ${formatRelativeTime(meta.lastModifiedAt)}`,
      });
    });
    setGutterEntries(entries);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [history, authorId] = await Promise.all([readNoteHistory(vaultPath, path), getAuthorId()]);
      if (!cancelled) {
        historyRef.current = history;
        authorIdRef.current = authorId;
        requestAnimationFrame(recomputeGutter);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, path]);

  // Re-measure whenever the toggle flips or the window resizes (text
  // reflow shifts every block below it).
  useEffect(() => {
    requestAnimationFrame(recomputeGutter);
    window.addEventListener("resize", recomputeGutter);
    return () => window.removeEventListener("resize", recomputeGutter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBlockHistory]);

  const timerRef = useRef<number | null>(null);
  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSaveStatus("saving");
    const { markdown, entries } = buildMarkdownWithHistory(editor);
    void persistNoteBody(path, markdown).then(() => setSaveStatus("saved"));

    const now = new Date().toISOString();
    const nextBlocks = diffBlocks(historyRef.current.blocks, entries, authorIdRef.current, now);
    const nextHistory = appendSnapshot(
      { ...historyRef.current, blocks: nextBlocks },
      { timestamp: now, authorId: authorIdRef.current, markdown }
    );
    historyRef.current = nextHistory;
    void writeNoteHistory(vaultPath, path, nextHistory);
    requestAnimationFrame(recomputeGutter);
  };

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
      // Block heights can shift immediately as you type (line wrapping),
      // independent of the debounced autosave — keep the gutter positions
      // in step with that, even though the metadata itself only updates on save.
      requestAnimationFrame(recomputeGutter);
    });
    // Flush immediately if the app is closing/reloading so nothing typed in
    // the last debounce window gets lost.
    window.addEventListener("beforeunload", flush);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Applies a history-panel "restore this version" request: reparse the
  // snapshot's markdown (reattaching stable block ids the same way a normal
  // note load does) and swap it in as the live document, then flush so the
  // restore itself is persisted as a new history entry rather than erasing
  // what came before it.
  useEffect(() => {
    if (!restoreRequest || restoreRequest.path !== path) return;
    const newBlocks = parseMarkdownToBlocks(restoreRequest.markdown);
    editor.replaceBlocks(editor.document, newBlocks);
    clearRestoreRequest();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flush() persists the just-applied restore immediately rather than waiting for the debounce, so it isn't lost if the user navigates away right after restoring.
    flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreRequest, path]);

  // Maps a "Go deeper" trigger block's id to what it should research.
  // Scoped to this BoundEditor instance (remounted per note, since it's
  // keyed by `path` in the parent), so it never leaks across notes.
  const goDeeperRegistry = useRef(new Map<string, { term: string; context: string; explanationBlockIds: string[] }>()).current;

  const runDeepResearch = async (goDeeperBlockId: string) => {
    const entry = goDeeperRegistry.get(goDeeperBlockId);
    if (!entry) return;
    goDeeperRegistry.delete(goDeeperBlockId);
    editor.updateBlock(goDeeperBlockId, {
      type: "paragraph",
      content: [{ type: "text", text: "Going deeper…", styles: { italic: true } }],
    });
    beginResearch();
    try {
      const markdown = await researchTerm(entry.term, entry.context, "deep");
      const deepBlocks = parseMarkdownToBlocks(markdown);
      editor.replaceBlocks([...entry.explanationBlockIds, goDeeperBlockId], deepBlocks);
    } catch {
      editor.updateBlock(goDeeperBlockId, {
        type: "paragraph",
        content: [{ type: "text", text: "Deeper research failed.", styles: { italic: true } }],
      });
    } finally {
      endResearch();
    }
  };

  const triggerResearch = async () => {
    const term = editor.getSelectedText().trim();
    if (!term) return;
    const referenceBlock = editor.getTextCursorPosition().block;
    const context = editor.blocksToMarkdownLossy([referenceBlock]);

    const inserted = editor.insertBlocks(
      [
        { type: "heading", props: { level: 3 }, content: [{ type: "text", text: term, styles: {} }] },
        { type: "paragraph", content: [{ type: "text", text: "Researching…", styles: { italic: true } }] },
      ],
      referenceBlock.id,
      "after"
    );
    const loadingBlockId = inserted[1].id;

    beginResearch();
    try {
      const markdown = await researchTerm(term, context, "concise");
      const explanationBlocks = parseMarkdownToBlocks(markdown);
      const goDeeperBlock: MathPartialBlock = {
        type: "paragraph",
        content: [{ type: "text", text: GO_DEEPER_TEXT, styles: { bold: true, underline: true, textColor: "blue" } }],
      };
      const { insertedBlocks } = editor.replaceBlocks([loadingBlockId], [...explanationBlocks, goDeeperBlock]);
      const goDeeperInserted = insertedBlocks[insertedBlocks.length - 1];
      const explanationBlockIds = insertedBlocks.slice(0, -1).map((b) => b.id);
      goDeeperRegistry.set(goDeeperInserted.id, { term, context, explanationBlockIds });
    } catch {
      editor.updateBlock(loadingBlockId, {
        type: "paragraph",
        content: [{ type: "text", text: "Research failed.", styles: { italic: true } }],
      });
    } finally {
      endResearch();
    }
  };

  // When pasted content carries a source URL — the "CF_HTML" clipboard format
  // some browsers (notably on Windows) attach a `SourceURL:` header to when
  // you copy from a web page — drop a small citation line after it, similar
  // to OneNote. This is inherently best-effort: not every OS/browser/source
  // populates this header, so most pastes just proceed normally with nothing
  // added.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData?.getData("text/html");
    if (!html) return;
    const sourceUrl = extractPasteSourceUrl(html);
    if (!sourceUrl) return;
    // Let the paste land first (BlockNote/ProseMirror handles the actual
    // insertion from the same clipboard event), then append the citation
    // after wherever the cursor ends up.
    setTimeout(() => {
      const cursorBlock = editor.getTextCursorPosition().block;
      editor.insertBlocks(
        [
          {
            type: "paragraph",
            content: [{ type: "text", text: `Source: ${sourceUrl}`, styles: { italic: true, textColor: "gray" } }],
          },
        ],
        cursorBlock.id,
        "after"
      );
    }, 0);
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const blockEl = (e.target as HTMLElement).closest?.("[data-id]") as HTMLElement | null;
    const blockId = blockEl?.getAttribute("data-id");
    if (blockId && goDeeperRegistry.has(blockId)) {
      e.preventDefault();
      void runDeepResearch(blockId);
      return;
    }

    const caretPos = (document as unknown as {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }).caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!caretPos || caretPos.startContainer.nodeType !== Node.TEXT_NODE) return;

    const text = caretPos.startContainer.textContent ?? "";
    const offset = caretPos.startOffset;
    for (const match of text.matchAll(WIKI_LINK_RE)) {
      const start = match.index ?? -1;
      const end = start + match[0].length;
      if (offset >= start && offset <= end) {
        e.preventDefault();
        void navigateToNoteTitle(match[1].trim());
        return;
      }
    }
  };

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== currentNote?.title) void renameCurrentNote(trimmed);
    else setTitleDraft(currentNote?.title ?? "");
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 pt-10">
        <div className="mb-2 flex items-start justify-between gap-4">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-full bg-transparent text-3xl font-bold outline-none"
            style={{ color: "var(--text)" }}
          />
          <div className="mt-2 flex shrink-0 items-center gap-3">
            {saveStatus !== "idle" && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {saveStatus === "saving" ? "Saving…" : "Saved"}
              </span>
            )}
            <button
              onClick={() => {
                if (window.confirm(`Delete "${currentNote?.title}"?`)) void deleteNote(path);
              }}
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="mb-6">
          <TagChips />
        </div>

        <div ref={gutterWrapRef} className="relative" onClick={handleContainerClick} onPaste={handlePaste}>
          {gutterEntries.map((g) => (
            <div
              key={g.id}
              className="block-history-gutter-entry"
              style={{ top: g.top, color: "var(--text-muted)" }}
              title={g.full}
            >
              {g.short}
            </div>
          ))}
          <ResearchTriggerContext.Provider value={triggerResearch}>
            <BlockNoteView
              editor={editor}
              theme={{ light: lightDefaultTheme, dark: darkDefaultTheme }}
              formattingToolbar={false}
              slashMenu={false}
            >
              <FormattingToolbarController formattingToolbar={CustomFormattingToolbar} />
              <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (query) =>
                  filterSuggestionItems(getMathSlashMenuItems(editor, getDefaultReactSlashMenuItems(editor)), query)
                }
              />
            </BlockNoteView>
          </ResearchTriggerContext.Provider>
        </div>

        <BacklinksPanel />
      </div>
    </div>
  );
}
