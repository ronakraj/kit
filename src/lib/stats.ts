import { flattenPages, DAILY_DIR } from "./vault";
import type { TreeEntry } from "./types";
import type { VaultScanResult } from "./vaultScan";

export interface BuddyStats {
  noteCount: number;
  wordsToday: number;
  currentStreak: number;
  longestStreak: number;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

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

/** Current streak counts back from today (or yesterday, if today has no entry yet); longest scans all daily notes for the best run. */
function computeStreaks(dates: Set<string>, today: string): { current: number; longest: number } {
  let current = 0;
  let cursor = dates.has(today) ? today : shiftISO(today, -1);
  while (dates.has(cursor)) {
    current++;
    cursor = shiftISO(cursor, -1);
  }

  const sorted = Array.from(dates).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && shiftISO(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

export function computeStats(tree: TreeEntry[], scan: VaultScanResult | null): BuddyStats {
  const notePages = flattenPages(tree).filter((p) => p.kind === "note");
  const noteCount = notePages.length;

  const today = todayISO();
  let wordsToday = 0;
  if (scan) {
    for (const { path } of notePages) {
      if (scan.metaByPath.get(path)?.updatedAt.startsWith(today)) {
        wordsToday += countWords(scan.contents.get(path) ?? "");
      }
    }
  }

  const dailyFolder = tree.find((e) => e.kind === "folder" && e.name === DAILY_DIR);
  const dailyDates = new Set<string>();
  if (dailyFolder?.kind === "folder") {
    for (const child of dailyFolder.children) {
      if (child.kind === "note" && /^\d{4}-\d{2}-\d{2}$/.test(child.name)) dailyDates.add(child.name);
    }
  }

  const { current, longest } = computeStreaks(dailyDates, today);
  return { noteCount, wordsToday, currentStreak: current, longestStreak: longest };
}

const STALE_DAYS = 30;

/** Light housekeeping nudges: untagged notes, notes nothing links to, and notes gone stale. Empty array if the vault looks tidy or hasn't been scanned yet. */
export function computeHealthTips(tree: TreeEntry[], scan: VaultScanResult | null): string[] {
  if (!scan) return [];
  const notePages = flattenPages(tree).filter((p) => p.kind === "note");
  const tips: string[] = [];

  const untagged = notePages.filter((p) => (scan.metaByPath.get(p.path)?.tags.length ?? 0) === 0).length;
  if (untagged > 0) {
    tips.push(`${untagged} note${untagged === 1 ? "" : "s"} ${untagged === 1 ? "has" : "have"} no tags`);
  }

  const unlinked = notePages.filter((p) => {
    const incoming = scan.backlinks.get(p.name.toLowerCase());
    return !incoming || incoming.length === 0;
  }).length;
  if (unlinked > 0) {
    tips.push(
      `${unlinked} note${unlinked === 1 ? "" : "s"} ${unlinked === 1 ? "has" : "have"} nothing linking to ${
        unlinked === 1 ? "it" : "them"
      }`
    );
  }

  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const stale = notePages.filter((p) => {
    const updatedAt = scan.metaByPath.get(p.path)?.updatedAt;
    return updatedAt ? new Date(updatedAt).getTime() < staleCutoff : false;
  }).length;
  if (stale > 0) {
    tips.push(`${stale} note${stale === 1 ? "" : "s"} ${stale === 1 ? "hasn't" : "haven't"} been touched in ${STALE_DAYS}+ days`);
  }

  return tips;
}
