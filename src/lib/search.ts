/** Simple subsequence-based fuzzy match. Returns a score (higher is better) or null if no match. */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;

  let score = 0;
  let ti = 0;
  let consecutive = 0;

  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return null;
    consecutive = idx === ti ? consecutive + 1 : 0;
    score += 10 - Math.min(idx - ti, 9) + consecutive * 2;
    ti = idx + 1;
  }

  if (t.startsWith(q)) score += 25;
  return score;
}

export function fuzzySearch<T>(query: string, items: T[], getText: (item: T) => string): T[] {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(query, getText(item)) }))
    .filter((r): r is { item: T; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}

export interface SearchableNote {
  path: string;
  name: string;
  body: string;
}

export interface SearchResult {
  path: string;
  name: string;
  /** Set when the match came from (or is also present in) the body — a snippet of surrounding text for display. */
  snippet: string | null;
  snippetHighlightStart: number;
  snippetHighlightEnd: number;
}

const SNIPPET_RADIUS = 60;
// A title match ranks above a same-strength content-only match — you're
// usually looking for the note, not just any note that mentions the term.
const TITLE_MATCH_BONUS = 1000;

function buildSnippet(body: string, matchIndex: number, matchLength: number): { snippet: string; highlightStart: number; highlightEnd: number } {
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(body.length, matchIndex + matchLength + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  const trimmedLead = body.slice(start, matchIndex).replace(/^\s+/, "");
  const leadTrimmed = matchIndex - start - trimmedLead.length;
  const snippet = prefix + trimmedLead + body.slice(matchIndex, end).replace(/\s+$/, "") + suffix;
  const highlightStart = prefix.length + (matchIndex - start - leadTrimmed);
  return { snippet, highlightStart, highlightEnd: highlightStart + matchLength };
}

/**
 * Searches note titles (fuzzy) and body content (plain substring, case-insensitive)
 * for references to `query`, ranking title matches above content-only matches.
 * Body text should already be cleaned of markdown noise (see `stripMarkdownNoise`).
 */
export function searchNotes(query: string, notes: SearchableNote[]): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const lowerQ = q.toLowerCase();

  const scored: { result: SearchResult; score: number }[] = [];

  for (const note of notes) {
    const titleScore = fuzzyScore(q, note.name);
    const bodyIndex = note.body.toLowerCase().indexOf(lowerQ);
    if (titleScore === null && bodyIndex === -1) continue;

    let snippet: string | null = null;
    let snippetHighlightStart = 0;
    let snippetHighlightEnd = 0;
    if (bodyIndex !== -1) {
      const built = buildSnippet(note.body, bodyIndex, q.length);
      snippet = built.snippet;
      snippetHighlightStart = built.highlightStart;
      snippetHighlightEnd = built.highlightEnd;
    }

    const score = (titleScore ?? 0) + (titleScore !== null ? TITLE_MATCH_BONUS : 0) + (bodyIndex !== -1 ? 1 : 0);
    scored.push({
      result: { path: note.path, name: note.name, snippet, snippetHighlightStart, snippetHighlightEnd },
      score,
    });
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.result);
}
