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
import { TagChips } from "./TagChips";
import { BacklinksPanel } from "./BacklinksPanel";

const SAVE_DEBOUNCE_MS = 600;
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;
const GO_DEEPER_TEXT = "🔍 Go deeper";

function parseMarkdownToBlocks(markdown: string): MathPartialBlock[] {
  const parser = BlockNoteEditor.create({ schema: mathSchema });
  const blocks = parser.tryParseMarkdownToBlocks(markdown);
  const withMath = fromPersistedBlocks(blocks as unknown as AnyBlock[]) as unknown as MathPartialBlock[];
  return withMath.length > 0 ? withMath : [{ type: "paragraph" }];
}

/** Converts custom equation/plot blocks back to plain code blocks before serializing to markdown, so notes stay portable plain-text files. */
function toMarkdown(editor: { document: unknown; blocksToMarkdownLossy: (blocks?: MathPartialBlock[]) => string }): string {
  const persistable = toPersistableBlocks(editor.document as unknown as AnyBlock[]) as unknown as MathPartialBlock[];
  return editor.blocksToMarkdownLossy(persistable);
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

  const [titleDraft, setTitleDraft] = useState(currentNote?.title ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const initialBlocks = useMemo(() => parseMarkdownToBlocks(initialBody), [path]);
  const uploadFile = useMemo(() => createUploadFileHandler(vaultPath), [vaultPath]);

  const editor = useCreateBlockNote({ schema: mathSchema, initialContent: initialBlocks, uploadFile });

  const timerRef = useRef<number | null>(null);
  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSaveStatus("saving");
    const markdown = toMarkdown(editor);
    void persistNoteBody(path, markdown).then(() => setSaveStatus("saved"));
  };

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
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

        <div onClick={handleContainerClick}>
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
