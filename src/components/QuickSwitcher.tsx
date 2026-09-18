import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../state/store";
import { flattenPages } from "../lib/vault";
import { fuzzySearch } from "../lib/search";

export function QuickSwitcher() {
  const open = useAppStore((s) => s.quickSwitcherOpen);
  const setOpen = useAppStore((s) => s.setQuickSwitcherOpen);
  const tree = useAppStore((s) => s.tree);
  const openPath = useAppStore((s) => s.openPath);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  useEffect(() => {
    // Resets the search field each time the switcher is opened.
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const allPages = useMemo(() => flattenPages(tree), [tree]);
  const results = useMemo(() => fuzzySearch(query, allPages, (n) => n.name).slice(0, 30), [query, allPages]);

  if (!open) return null;

  const choose = (path: string) => {
    void openPath(path);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border shadow-xl"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && results[activeIndex]) {
              choose(results[activeIndex].path);
            }
          }}
          placeholder="Jump to note…"
          className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {results.map((n, i) => (
            <div
              key={n.path}
              onClick={() => choose(n.path)}
              className="cursor-pointer truncate px-4 py-1.5 text-sm"
              style={{ background: i === activeIndex ? "var(--bg-hover)" : "transparent", color: "var(--text)" }}
            >
              {n.name}
            </div>
          ))}
          {query && results.length === 0 && (
            <div className="px-4 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
              No matches
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
