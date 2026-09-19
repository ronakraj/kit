import { useAppStore } from "../state/store";
import { ClockIcon } from "./icons";

export function BlockHistoryToggle() {
  const showBlockHistory = useAppStore((s) => s.showBlockHistory);
  const toggleBlockHistory = useAppStore((s) => s.toggleBlockHistory);

  return (
    <button
      onClick={toggleBlockHistory}
      title={showBlockHistory ? "Hide edit history gutter" : "Show edit history gutter"}
      className="fixed right-[4.75rem] top-3 z-30 flex h-7 w-7 items-center justify-center rounded"
      style={{ color: showBlockHistory ? "var(--accent)" : "var(--text-muted)" }}
    >
      <ClockIcon />
    </button>
  );
}
