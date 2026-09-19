import { useEffect } from "react";
import { useAppStore } from "../state/store";

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

/**
 * A global Ctrl/Cmd+Z that restores the most recently deleted note. Only
 * fires when focus isn't in a text field or the note editor — that keeps it
 * out of the way of BlockNote's own text-undo (Ctrl+Z while typing), and
 * means the natural moment to press it (right after clicking Delete, when
 * nothing is focused) just works.
 */
export function GlobalUndo() {
  const undoLastDelete = useAppStore((s) => s.undoLastDelete);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.shiftKey || e.key.toLowerCase() !== "z") return;
      if (isEditableTarget(document.activeElement)) return;
      e.preventDefault();
      void undoLastDelete();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoLastDelete]);

  return null;
}
