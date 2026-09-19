import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../state/store";
import { flattenPages, readNote } from "../lib/vault";
import { stripMarkdownNoise } from "../lib/blockHistory";
import { searchNotes, type SearchableNote } from "../lib/search";

export function QuickSwitcher() {
  const open = useAppStore((s) => s.quickSwitcherOpen);
  const setOpen = useAppStore((s) => s.setQuickSwitcherOpen);
  const tree = useAppStore((s) => s.tree);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const openPath = useAppStore((s) => s.openPath);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [bodies, setBodies] = useState<Map<string, string>>(new Map());
  const [contentLoading, setContentLoading] = useState(false);

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

  // Loads every note's body fresh each time the switcher opens, so content
  // search reflects on-disk edits made outside this session too. Title
  // search (via allPages above) works instantly without waiting on this.
  useEffect(() => {
    if (!open || !vaultPath) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the "still searching…" indicator for this fresh load.
    setContentLoading(true);
    void Promise.all(
      allPages.map(async (p) => {
        try {
          const note = await readNote(vaultPath, p.path);
          return [p.path, stripMarkdownNoise(note.body)] as const;
        } catch {
          return [p.path, ""] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setBodies(new Map(entries));
      setContentLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vaultPath]);

  const searchableNotes = useMemo<SearchableNote[]>(
    () => allPages.map((p) => ({ path: p.path, name: p.name, body: bodies.get(p.path) ?? "" })),
    [allPages, bodies]
  );
  const results = useMemo(() => {
    if (!query.trim()) {
      return allPages
        .slice(0, 30)
        .map((p) => ({ path: p.path, name: p.name, snippet: null, snippetHighlightStart: 0, snippetHighlightEnd: 0 }));
    }
    return searchNotes(query, searchableNotes).slice(0, 30);
  }, [query, searchableNotes, allPages]);

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
        className="w-full max-w-xl rounded-lg border shadow-xl"
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
          placeholder="Search notes — titles and content…"
          className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        />
        <div className="max-h-96 overflow-y-auto py-1">
          {results.map((n, i) => (
            <div
              key={n.path}
              onClick={() => choose(n.path)}
              className="cursor-pointer px-4 py-2 text-sm"
              style={{ background: i === activeIndex ? "var(--bg-hover)" : "transparent", color: "var(--text)" }}
            >
              <div className="truncate">{n.name}</div>
              {n.snippet && (
                <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                  {n.snippet.slice(0, n.snippetHighlightStart)}
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                    {n.snippet.slice(n.snippetHighlightStart, n.snippetHighlightEnd)}
                  </span>
                  {n.snippet.slice(n.snippetHighlightEnd)}
                </div>
              )}
            </div>
          ))}
          {query && results.length === 0 && !contentLoading && (
            <div className="px-4 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
              No matches
            </div>
          )}
          {query && contentLoading && (
            <div className="px-4 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Still searching note content…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
