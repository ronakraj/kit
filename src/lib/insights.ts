import { flattenPages } from "./vault";
import { extractWikiLinks } from "./backlinks";
import { computeStats } from "./stats";
import type { TreeEntry } from "./types";
import type { VaultScanResult } from "./vaultScan";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function trailingDates(days: number): string[] {
  const today = todayISO();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(shiftISO(today, -i));
  return dates;
}

export interface ActivityDay {
  date: string;
  count: number;
}

/**
 * Day-by-day note activity, oldest to newest. A note only has a single
 * `updatedAt` (its most recent save), so this counts each note once, on the
 * day it was last saved — it approximates activity, it does not reflect a
 * full edit history (which the app doesn't keep).
 */
export function computeActivityCalendar(tree: TreeEntry[], scan: VaultScanResult | null, days = 182): ActivityDay[] {
  const dates = trailingDates(days);
  const counts = new Map<string, number>();

  if (scan) {
    const notePages = flattenPages(tree).filter((p) => p.kind === "note");
    for (const { path } of notePages) {
      const updatedAt = scan.metaByPath.get(path)?.updatedAt;
      if (!updatedAt) continue;
      const day = updatedAt.slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }

  return dates.map((date) => ({ date, count: counts.get(date) ?? 0 }));
}

export interface WordTrendDay {
  date: string;
  words: number;
}

/** Same last-save-only caveat as computeActivityCalendar: a note's word count lands entirely on the day it was last saved. */
export function computeWordTrend(tree: TreeEntry[], scan: VaultScanResult | null, days = 30): WordTrendDay[] {
  const dates = trailingDates(days);
  const wordsByDay = new Map<string, number>();

  if (scan) {
    const notePages = flattenPages(tree).filter((p) => p.kind === "note");
    for (const { path } of notePages) {
      const updatedAt = scan.metaByPath.get(path)?.updatedAt;
      if (!updatedAt) continue;
      const day = updatedAt.slice(0, 10);
      const words = countWords(scan.contents.get(path) ?? "");
      wordsByDay.set(day, (wordsByDay.get(day) ?? 0) + words);
    }
  }

  return dates.map((date) => ({ date, words: wordsByDay.get(date) ?? 0 }));
}

export interface ConnectivityHub {
  name: string;
  path: string;
  count: number;
}

export interface ConnectivityResult {
  hubs: ConnectivityHub[];
  orphans: { name: string; path: string }[];
}

const HUB_LIMIT = 10;

/** Hubs = most-linked-to notes. Orphans = notes with no incoming backlinks AND no outgoing wiki-links. */
export function computeConnectivity(tree: TreeEntry[], scan: VaultScanResult | null): ConnectivityResult {
  if (!scan) return { hubs: [], orphans: [] };
  const notePages = flattenPages(tree).filter((p) => p.kind === "note");

  const hubs = notePages
    .map((p) => ({ name: p.name, path: p.path, count: (scan.backlinks.get(p.name.toLowerCase()) ?? []).length }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, HUB_LIMIT);

  const orphans = notePages
    .filter((p) => {
      const incoming = scan.backlinks.get(p.name.toLowerCase());
      const hasIncoming = !!incoming && incoming.length > 0;
      const hasOutgoing = extractWikiLinks(scan.contents.get(p.path) ?? "").length > 0;
      return !hasIncoming && !hasOutgoing;
    })
    .map((p) => ({ name: p.name, path: p.path }));

  return { hubs, orphans };
}

export interface TagCount {
  tag: string;
  count: number;
}

export function computeTagCounts(scan: VaultScanResult | null): TagCount[] {
  if (!scan) return [];
  const counts = new Map<string, number>();
  for (const meta of scan.metaByPath.values()) {
    for (const tag of meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export interface RecapSummary {
  topTag: string | null;
  notesThisWeek: number;
  mostActiveDay: { date: string; count: number } | null;
  currentStreak: number;
  standoutNote: { name: string; path: string; linkCount: number } | null;
}

/** A small "what's been happening" summary, built from the other insight functions rather than re-deriving anything. */
export function computeRecap(tree: TreeEntry[], scan: VaultScanResult | null): RecapSummary {
  const stats = computeStats(tree, scan);
  const tagCounts = computeTagCounts(scan);
  const { hubs } = computeConnectivity(tree, scan);
  const weekActivity = computeActivityCalendar(tree, scan, 7);

  const notesThisWeek = weekActivity.reduce((sum, d) => sum + d.count, 0);
  const mostActiveDay = weekActivity.reduce<{ date: string; count: number } | null>((best, d) => {
    if (d.count === 0) return best;
    if (!best || d.count > best.count) return { date: d.date, count: d.count };
    return best;
  }, null);
  const topHub = hubs[0] ?? null;

  return {
    topTag: tagCounts[0]?.tag ?? null,
    notesThisWeek,
    mostActiveDay,
    currentStreak: stats.currentStreak,
    standoutNote: topHub ? { name: topHub.name, path: topHub.path, linkCount: topHub.count } : null,
  };
}
