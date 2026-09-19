import { useEffect, useRef } from "react";
import { useAppStore } from "../state/store";

const DELAY_MS = 1500;

/**
 * Silently appends a "topics touched" summary to the most recent prior day's
 * Daily note, once per day, shortly after the vault finishes its first scan.
 * No UI of its own — just a background vault write, same one-shot-per-day
 * gating pattern as the desk buddy's auto-recap.
 */
export function DailySummaryAutoAppend() {
  const vaultPath = useAppStore((s) => s.vaultPath);
  const scan = useAppStore((s) => s.scan);
  const appendDailySummaryIfNeeded = useAppStore((s) => s.appendDailySummaryIfNeeded);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!vaultPath || !scan || firedRef.current) return;
    firedRef.current = true;
    const timer = window.setTimeout(() => {
      void appendDailySummaryIfNeeded();
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [vaultPath, scan, appendDailySummaryIfNeeded]);

  return null;
}
