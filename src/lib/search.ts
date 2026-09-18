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
