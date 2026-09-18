import { useAppStore } from "../state/store";

export function InsightsToggle() {
  const setOpen = useAppStore((s) => s.setInsightsPanelOpen);

  return (
    <button
      onClick={() => setOpen(true)}
      title="Insights"
      className="fixed right-11 top-3 z-30 flex h-7 w-7 items-center justify-center rounded text-sm"
      style={{ color: "var(--text-muted)" }}
    >
      📊
    </button>
  );
}
