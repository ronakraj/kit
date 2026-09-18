import { useState } from "react";
import type { TreeEntry } from "../lib/types";
import { useAppStore } from "../state/store";

function FolderRow({
  entry,
  depth,
  onNewNote,
  onNewFolder,
}: {
  entry: Extract<TreeEntry, { kind: "folder" }>;
  depth: number;
  onNewNote: (folderPath: string) => void;
  onNewFolder: (folderPath: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <div
        className="group flex items-center justify-between rounded px-2 py-1 text-sm hover:cursor-pointer"
        style={{ paddingLeft: depth * 14 + 8, color: "var(--text-muted)" }}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span className="truncate">
          {open ? "▾" : "▸"} {entry.name}
        </span>
        <span className="hidden gap-1 group-hover:flex">
          <button
            title="New note"
            className="px-1"
            onClick={(e) => {
              e.stopPropagation();
              onNewNote(entry.path);
            }}
          >
            +N
          </button>
          <button
            title="New folder"
            className="px-1"
            onClick={(e) => {
              e.stopPropagation();
              onNewFolder(entry.path);
            }}
          >
            +F
          </button>
        </span>
      </div>
      {open && (
        <TreeList entries={entry.children} depth={depth + 1} onNewNote={onNewNote} onNewFolder={onNewFolder} />
      )}
    </div>
  );
}

export function TreeList({
  entries,
  depth,
  onNewNote,
  onNewFolder,
}: {
  entries: TreeEntry[];
  depth: number;
  onNewNote: (folderPath: string) => void;
  onNewFolder: (folderPath: string) => void;
}) {
  const currentNote = useAppStore((s) => s.currentNote);
  const openPath = useAppStore((s) => s.openPath);
  const currentPath = currentNote?.path;

  return (
    <div>
      {entries.map((entry) =>
        entry.kind === "folder" ? (
          <FolderRow key={entry.path} entry={entry} depth={depth} onNewNote={onNewNote} onNewFolder={onNewFolder} />
        ) : (
          <div
            key={entry.path}
            onClick={() => void openPath(entry.path)}
            className="cursor-pointer truncate rounded px-2 py-1 text-sm"
            style={{
              paddingLeft: depth * 14 + 8,
              background: currentPath === entry.path ? "var(--bg-hover)" : "transparent",
              color: "var(--text)",
            }}
          >
            {entry.name}
          </div>
        )
      )}
    </div>
  );
}
