import { useEffect, useState } from "react";
import { useAppStore } from "../state/store";
import { loadNotePreview, type NotePreview } from "../lib/wikiPreview";

const POPOVER_WIDTH = 260;

export function WikiLinkPreview({ term, x, y }: { term: string; x: number; y: number }) {
  const vaultPath = useAppStore((s) => s.vaultPath);
  const tree = useAppStore((s) => s.tree);
  const [preview, setPreview] = useState<NotePreview | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    if (!vaultPath) return;
    void loadNotePreview(vaultPath, tree, term).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [term, vaultPath, tree]);

  // No note by that title exists yet — nothing to peek at.
  if (preview === null) return null;

  const left = Math.min(x + 12, window.innerWidth - POPOVER_WIDTH - 12);

  return (
    <div
      className="fixed z-40 rounded border p-3 text-sm shadow-lg"
      style={{
        left,
        top: y + 16,
        width: POPOVER_WIDTH,
        background: "var(--bg-panel)",
        borderColor: "var(--border)",
        color: "var(--text)",
      }}
    >
      {preview === "loading" ? (
        <span style={{ color: "var(--text-muted)" }}>Loading…</span>
      ) : (
        <>
          <div className="mb-1 font-semibold">{preview.title}</div>
          <div style={{ color: "var(--text-muted)" }}>{preview.snippet}</div>
        </>
      )}
    </div>
  );
}
