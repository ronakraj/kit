import { useAppStore } from "../state/store";

export function BlockHistoryToggle() {
  const showBlockHistory = useAppStore((s) => s.showBlockHistory);
  const toggleBlockHistory = useAppStore((s) => s.toggleBlockHistory);

  return (
    <button
      onClick={toggleBlockHistory}
      title={showBlockHistory ? "Hide edit history" : "Show edit history on hover"}
      className="fixed right-[4.75rem] top-3 z-30 flex h-7 w-7 items-center justify-center rounded text-sm"
      style={{ color: showBlockHistory ? "var(--accent)" : "var(--text-muted)" }}
    >
      🕐
    </button>
  );
}
