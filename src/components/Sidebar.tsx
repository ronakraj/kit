import { useMemo } from "react";
import { useAppStore } from "../state/store";
import { flattenPages, type PageRef } from "../lib/vault";
import { TreeList } from "./FolderTree";

export function Sidebar() {
  const tree = useAppStore((s) => s.tree);
  const scan = useAppStore((s) => s.scan);
  const createNote = useAppStore((s) => s.createNote);
  const createFolder = useAppStore((s) => s.createFolder);
  const openPath = useAppStore((s) => s.openPath);
  const currentNote = useAppStore((s) => s.currentNote);
  const todosViewOpen = useAppStore((s) => s.todosViewOpen);
  const openTodos = useAppStore((s) => s.openTodos);
  const trashViewOpen = useAppStore((s) => s.trashViewOpen);
  const openTrash = useAppStore((s) => s.openTrash);
  const openToday = useAppStore((s) => s.openToday);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const selectedTag = useAppStore((s) => s.selectedTag);
  const setSelectedTag = useAppStore((s) => s.setSelectedTag);
  const requestPrompt = useAppStore((s) => s.requestPrompt);
  const currentPath = currentNote?.path;

  const handleNewNote = async (folderPath: string) => {
    const title = await requestPrompt("Note title", "Untitled");
    if (title === null) return;
    void createNote(folderPath, title);
  };

  const handleNewFolder = async (folderPath: string) => {
    const name = await requestPrompt("Folder name", "New Folder");
    if (name === null) return;
    void createFolder(folderPath, name);
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !scan) return null;
    const q = searchQuery.toLowerCase();
    return flattenPages(tree).filter((n) => {
      if (n.name.toLowerCase().includes(q)) return true;
      const body = scan.contents.get(n.path);
      return body ? body.toLowerCase().includes(q) : false;
    });
  }, [searchQuery, scan, tree]);

  const tagResults = useMemo(() => {
    if (!selectedTag || !scan) return null;
    return flattenPages(tree).filter((n) => scan.metaByPath.get(n.path)?.tags.includes(selectedTag));
  }, [selectedTag, scan, tree]);

  const allTags = useMemo(() => (scan ? Array.from(scan.allTags).sort() : []), [scan]);

  return (
    <div className="flex h-full w-64 flex-col border-r" style={{ borderColor: "var(--border)", background: "var(--bg-panel)" }}>
      <div className="flex items-center gap-2 border-b p-2" style={{ borderColor: "var(--border)" }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notes…"
          className="w-full rounded border bg-transparent px-2 py-1 text-sm outline-none"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        />
      </div>

      <div className="flex items-center justify-between border-b px-2 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
        <button onClick={() => void openToday()} className="font-medium" style={{ color: "var(--accent)" }}>
          Today
        </button>
        <div className="flex gap-2">
          <button onClick={() => handleNewNote("")} title="New note">
            + Note
          </button>
          <button onClick={() => handleNewFolder("")} title="New folder">
            + Folder
          </button>
        </div>
      </div>

      <button
        onClick={() => void openTodos()}
        className="border-b px-3 py-2 text-left text-sm font-medium"
        style={{
          borderColor: "var(--border)",
          background: todosViewOpen ? "var(--bg-hover)" : "transparent",
          color: "var(--text)",
        }}
      >
        ✓ Todos
      </button>

      <button
        onClick={() => void openTrash()}
        className="border-b px-3 py-2 text-left text-sm font-medium"
        style={{
          borderColor: "var(--border)",
          background: trashViewOpen ? "var(--bg-hover)" : "transparent",
          color: "var(--text)",
        }}
      >
        🗑 Trash
      </button>

      <div className="flex-1 overflow-y-auto py-1">
        {searchResults ? (
          <ResultList notes={searchResults} currentPath={currentPath} onOpen={openPath} emptyLabel="No matches" />
        ) : tagResults ? (
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <span>#{selectedTag}</span>
              <button onClick={() => setSelectedTag(null)}>Clear</button>
            </div>
            <ResultList notes={tagResults} currentPath={currentPath} onOpen={openPath} emptyLabel="No notes with this tag" />
          </div>
        ) : (
          <TreeList entries={tree} depth={0} onNewNote={handleNewNote} onNewFolder={handleNewFolder} />
        )}
      </div>

      {allTags.length > 0 && !searchResults && (
        <div className="max-h-32 overflow-y-auto border-t p-2" style={{ borderColor: "var(--border)" }}>
          <div className="mb-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Tags
          </div>
          <div className="flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  background: tag === selectedTag ? "var(--accent)" : "var(--bg-hover)",
                  color: tag === selectedTag ? "white" : "var(--text-muted)",
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultList({
  notes,
  currentPath,
  onOpen,
  emptyLabel,
}: {
  notes: PageRef[];
  currentPath?: string;
  onOpen: (path: string) => void;
  emptyLabel: string;
}) {
  if (notes.length === 0) {
    return (
      <div className="px-3 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <div>
      {notes.map((n) => (
        <div
          key={n.path}
          onClick={() => onOpen(n.path)}
          className="cursor-pointer truncate rounded px-3 py-1 text-sm"
          style={{ background: currentPath === n.path ? "var(--bg-hover)" : "transparent", color: "var(--text)" }}
        >
          {n.name}
        </div>
      ))}
    </div>
  );
}
