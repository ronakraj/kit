import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../state/store";
import {
  computeActivityCalendar,
  computeConnectivity,
  computeDaySummary,
  computeTagCounts,
  computeWordTrend,
} from "../lib/insights";

const ACTIVITY_DAYS = 182;
const WORD_TREND_DAYS = 30;

function activityOpacity(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 0.35;
  if (count <= 3) return 0.65;
  return 1;
}

export function InsightsPanel() {
  const open = useAppStore((s) => s.insightsPanelOpen);
  const setOpen = useAppStore((s) => s.setInsightsPanelOpen);
  const tree = useAppStore((s) => s.tree);
  const scan = useAppStore((s) => s.scan);
  const openPath = useAppStore((s) => s.openPath);
  const requestRecap = useAppStore((s) => s.requestRecap);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  const activity = useMemo(() => computeActivityCalendar(tree, scan, ACTIVITY_DAYS), [tree, scan]);
  const daySummary = useMemo(
    () => (selectedDay ? computeDaySummary(tree, scan, selectedDay) : null),
    [selectedDay, tree, scan]
  );
  const wordTrend = useMemo(() => computeWordTrend(tree, scan, WORD_TREND_DAYS), [tree, scan]);
  const tagCounts = useMemo(() => computeTagCounts(scan), [scan]);
  const connectivity = useMemo(() => computeConnectivity(tree, scan), [tree, scan]);

  if (!open) return null;

  const hasAnyActivity = activity.some((d) => d.count > 0);
  const maxWords = Math.max(1, ...wordTrend.map((d) => d.words));
  const maxTagCount = Math.max(1, ...tagCounts.map((t) => t.count));

  // Pad the front of the calendar so columns line up on week boundaries (Sunday-start), GitHub-style.
  const startDow = activity.length > 0 ? new Date(`${activity[0].date}T00:00:00`).getDay() : 0;
  const paddedActivity: ({ date: string; count: number } | null)[] = [
    ...Array(startDow).fill(null),
    ...activity,
  ];

  const handleOpenPage = (path: string) => {
    void openPath(path);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-8"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-lg border shadow-xl"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Insights
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => requestRecap()} className="text-xs" style={{ color: "var(--accent)" }}>
              Show recap
            </button>
            <button onClick={() => setOpen(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>
              Close
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 px-5 py-4">
          <section>
            <div className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              Activity (last {ACTIVITY_DAYS} days)
            </div>
            {hasAnyActivity ? (
              <div
                className="grid gap-[3px] overflow-x-auto pb-1"
                style={{ gridTemplateRows: "repeat(7, 10px)", gridAutoFlow: "column" }}
              >
                {paddedActivity.map((d, i) =>
                  d ? (
                    <button
                      key={d.date}
                      onClick={() => setSelectedDay((cur) => (cur === d.date ? null : d.date))}
                      title={`${d.date}: ${d.count} note${d.count === 1 ? "" : "s"}`}
                      className="h-[10px] w-[10px] rounded-sm"
                      style={{
                        background: d.count === 0 ? "var(--bg-hover)" : "var(--accent)",
                        opacity: d.count === 0 ? 1 : activityOpacity(d.count),
                        outline: selectedDay === d.date ? "1.5px solid var(--text)" : "none",
                        outlineOffset: 1,
                      }}
                    />
                  ) : (
                    <div key={`pad-${i}`} className="h-[10px] w-[10px]" />
                  )
                )}
              </div>
            ) : (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                Not enough data yet — write a few notes to see your activity here.
              </div>
            )}

            {daySummary && (
              <div className="mt-2 rounded border p-2" style={{ borderColor: "var(--border)" }}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium" style={{ color: "var(--text)" }}>
                    {daySummary.date}
                  </span>
                  <button onClick={() => setSelectedDay(null)} style={{ color: "var(--text-muted)" }}>
                    Close
                  </button>
                </div>
                {daySummary.notes.length === 0 ? (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    No notes written this day.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {daySummary.notes.map((n) => (
                      <button
                        key={n.path}
                        onClick={() => handleOpenPage(n.path)}
                        className="flex items-center justify-between gap-2 truncate rounded px-1 py-0.5 text-left text-xs hover:underline"
                        style={{ color: "var(--text)" }}
                      >
                        <span className="truncate">
                          {n.name}
                          {n.created && (
                            <span className="ml-1 italic" style={{ color: "var(--text-muted)" }}>
                              new
                            </span>
                          )}
                        </span>
                        {n.tags.length > 0 && (
                          <span className="shrink-0 truncate" style={{ color: "var(--text-muted)" }}>
                            {n.tags.map((t) => `#${t}`).join(" ")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              Words written (last {WORD_TREND_DAYS} days)
            </div>
            {wordTrend.some((d) => d.words > 0) ? (
              <div className="flex h-16 items-end gap-[2px]">
                {wordTrend.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.words} words`}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${Math.max(2, (d.words / maxWords) * 100)}%`,
                      background: "var(--accent)",
                      opacity: d.words === 0 ? 0.15 : 1,
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                Not enough data yet.
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              Top tags
            </div>
            {tagCounts.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {tagCounts.slice(0, 8).map((t) => (
                  <div key={t.tag} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 truncate" style={{ color: "var(--text)" }}>
                      #{t.tag}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-hover)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(t.count / maxTagCount) * 100}%`, background: "var(--accent)" }}
                      />
                    </div>
                    <span className="w-5 shrink-0 text-right" style={{ color: "var(--text-muted)" }}>
                      {t.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                No tags yet.
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <section>
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                Most connected
              </div>
              {connectivity.hubs.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {connectivity.hubs.map((h) => (
                    <button
                      key={h.path}
                      onClick={() => handleOpenPage(h.path)}
                      className="flex items-center justify-between truncate rounded px-1 py-0.5 text-left text-xs hover:underline"
                      style={{ color: "var(--text)" }}
                    >
                      <span className="truncate">{h.name}</span>
                      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                        {h.count}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No linked notes yet.
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                Orphan notes
              </div>
              {connectivity.orphans.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {connectivity.orphans.slice(0, 8).map((o) => (
                    <button
                      key={o.path}
                      onClick={() => handleOpenPage(o.path)}
                      className="truncate rounded px-1 py-0.5 text-left text-xs hover:underline"
                      style={{ color: "var(--text)" }}
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Every note is connected — nice.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
