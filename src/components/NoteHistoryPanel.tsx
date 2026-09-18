import { useEffect, useState } from "react";
import { useAppStore } from "../state/store";
import { readNoteHistory, stripBlockMarkers, formatRelativeTime, type HistorySnapshot } from "../lib/blockHistory";

export function NoteHistoryPanel() {
  const open = useAppStore((s) => s.noteHistoryPanelOpen);
  const setOpen = useAppStore((s) => s.setNoteHistoryPanelOpen);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const currentNote = useAppStore((s) => s.currentNote);
  const requestRestore = useAppStore((s) => s.requestRestore);

  const [snapshots, setSnapshots] = useState<HistorySnapshot[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !vaultPath || !currentNote) return;
    // Resets the list whenever the panel opens or the open note changes; the
    // panel is shown/hidden by the same `open` prop, so there's no
    // key-based remount point to hang this off of instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapshots(null);
    setSelectedIndex(null);
    let cancelled = false;
    void (async () => {
      const history = await readNoteHistory(vaultPath, currentNote.path);
      if (!cancelled) setSnapshots([...history.snapshots].reverse());
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vaultPath, currentNote?.path]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  if (!open || !currentNote) return null;

  const selected = selectedIndex !== null ? snapshots?.[selectedIndex] : null;

  const handleRestore = () => {
    if (!selected) return;
    if (!window.confirm(`Restore "${currentNote.title}" to its version from ${formatRelativeTime(selected.timestamp)}? Your current content will be kept as a new history entry.`)) {
      return;
    }
    requestRestore(currentNote.path, selected.markdown);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-8"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-lg border shadow-xl"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            History — {currentNote.title}
          </div>
          <button onClick={() => setOpen(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>
            Close
          </button>
        </div>

        {snapshots === null ? (
          <div className="px-5 py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            Loading…
          </div>
        ) : snapshots.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            No history yet — this note hasn't been autosaved. Keep writing, and past versions will show up here.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,160px)_1fr]">
            <div
              className="max-h-96 overflow-y-auto border-b sm:border-b-0 sm:border-r"
              style={{ borderColor: "var(--border)" }}
            >
              {snapshots.map((snap, i) => (
                <button
                  key={`${snap.timestamp}-${i}`}
                  onClick={() => setSelectedIndex(i)}
                  className="block w-full truncate px-3 py-2 text-left text-xs"
                  style={{
                    background: selectedIndex === i ? "var(--bg-hover)" : "transparent",
                    color: "var(--text)",
                  }}
                >
                  <div>{formatRelativeTime(snap.timestamp)}</div>
                  <div className="truncate" style={{ color: "var(--text-muted)" }}>
                    {stripBlockMarkers(snap.markdown).slice(0, 60) || "(empty)"}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex max-h-96 flex-col gap-3 overflow-y-auto p-4">
              {selected ? (
                <>
                  <pre
                    className="flex-1 whitespace-pre-wrap break-words rounded border p-3 text-xs"
                    style={{ borderColor: "var(--border)", color: "var(--text)", fontFamily: "ui-monospace, monospace" }}
                  >
                    {stripBlockMarkers(selected.markdown) || "(empty note)"}
                  </pre>
                  <button
                    onClick={handleRestore}
                    className="self-start rounded border px-3 py-1.5 text-xs font-medium"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    Restore this version
                  </button>
                </>
              ) : (
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Select a version on the left to preview it.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
