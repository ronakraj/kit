import { useAppStore } from "../state/store";
import { FocusIcon } from "./icons";

export function FocusToggle() {
  const sidebarHidden = useAppStore((s) => s.sidebarHidden);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <button
      onClick={toggleSidebar}
      title={sidebarHidden ? "Show sidebar" : "Hide sidebar (focus mode)"}
      className="fixed right-3 top-3 z-30 flex h-7 w-7 items-center justify-center rounded"
      style={{ color: sidebarHidden ? "var(--accent)" : "var(--text-muted)" }}
    >
      <FocusIcon />
    </button>
  );
}
