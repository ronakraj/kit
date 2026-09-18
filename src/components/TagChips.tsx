import { useState } from "react";
import { useAppStore } from "../state/store";

export function TagChips() {
  const currentNote = useAppStore((s) => s.currentNote);
  const setTagOnCurrentNote = useAppStore((s) => s.setTagOnCurrentNote);
  const [draft, setDraft] = useState("");

  if (!currentNote) return null;

  const addTag = () => {
    if (draft.trim()) void setTagOnCurrentNote(draft, true);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {currentNote.meta.tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
          style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}
        >
          #{tag}
          <button onClick={() => void setTagOnCurrentNote(tag, false)} aria-label={`Remove tag ${tag}`}>
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") addTag();
        }}
        onBlur={addTag}
        placeholder="+ tag"
        className="w-16 bg-transparent text-xs outline-none"
        style={{ color: "var(--text-muted)" }}
      />
    </div>
  );
}
