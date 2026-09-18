import { useAppStore } from "../state/store";

export function NoteHistoryToggle() {
  const currentNote = useAppStore((s) => s.currentNote);
  const setOpen = useAppStore((s) => s.setNoteHistoryPanelOpen);
  const disabled = !currentNote;

  return (
    <button
      onClick={() => !disabled && setOpen(true)}
      title={disabled ? "Open a note to see its history" : "Note history"}
      disabled={disabled}
      className="fixed right-[6.75rem] top-3 z-30 flex h-7 w-7 items-center justify-center rounded text-sm"
      style={{ color: "var(--text-muted)", opacity: disabled ? 0.35 : 1, cursor: disabled ? "default" : "pointer" }}
    >
      🗂
    </button>
  );
}
