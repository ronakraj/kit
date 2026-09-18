import { useAppStore, useBacklinksForCurrentNote } from "../state/store";

export function BacklinksPanel() {
  const backlinks = useBacklinksForCurrentNote();
  const openNote = useAppStore((s) => s.openNote);

  if (backlinks.length === 0) return null;

  return (
    <div className="mt-10 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Linked from
      </div>
      <div className="flex flex-col gap-1">
        {backlinks.map((b) => (
          <button
            key={b.path}
            onClick={() => void openNote(b.path)}
            className="w-fit text-left text-sm hover:underline"
            style={{ color: "var(--accent)" }}
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );
}
