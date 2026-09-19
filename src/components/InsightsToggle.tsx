import { useAppStore } from "../state/store";
import { ChartIcon } from "./icons";

export function InsightsToggle() {
  const setOpen = useAppStore((s) => s.setInsightsPanelOpen);

  return (
    <button
      onClick={() => setOpen(true)}
      title="Insights"
      className="fixed right-11 top-3 z-30 flex h-7 w-7 items-center justify-center rounded"
      style={{ color: "var(--text-muted)" }}
    >
      <ChartIcon />
    </button>
  );
}
