import { useAppStore } from "../state/store";
import { formatRelativeTime } from "../lib/blockHistory";

export function TrashView() {
  const entries = useAppStore((s) => s.trashEntries);
  const restoreTrashEntry = useAppStore((s) => s.restoreTrashEntry);
  const permanentlyDeleteTrashEntry = useAppStore((s) => s.permanentlyDeleteTrashEntry);
  const emptyTrash = useAppStore((s) => s.emptyTrash);

  if (!entries) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  const handleEmpty = () => {
    if (entries.length === 0) return;
    if (window.confirm(`Permanently delete all ${entries.length} note(s) in the trash? This can't be undone.`)) {
      void emptyTrash();
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 pt-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
            Trash
          </h1>
          {entries.length > 0 && (
            <button onClick={handleEmpty} className="text-sm" style={{ color: "var(--text-muted)" }}>
              Empty trash
            </button>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing in the trash. Deleted notes show up here and can be restored — or you can press Ctrl/Cmd+Z
            right after deleting one to undo it immediately.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium" style={{ color: "var(--text)" }}>
                    {entry.title}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Deleted {formatRelativeTime(entry.deletedAt)} · {entry.originalPath}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button onClick={() => void restoreTrashEntry(entry.id)} style={{ color: "var(--accent)" }}>
                    Restore
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Permanently delete "${entry.title}"? This can't be undone.`)) {
                        void permanentlyDeleteTrashEntry(entry.id);
                      }
                    }}
                    style={{ color: "var(--text-muted)" }}
                  >
                    Delete forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
