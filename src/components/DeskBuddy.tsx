import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../state/store";
import { computeStats, computeHealthTips } from "../lib/stats";
import { computeRecap, type RecapSummary } from "../lib/insights";
import { getLastRecapDate, saveLastRecapDate } from "../lib/vault";
import { getCurrentActivity, type Activity, type Pose } from "../lib/timeOfDay";

const IDLE_TIMEOUT_MS = 15000;
const BOUNCE_MS = 700;
const CELEBRATE_MS = 2200;
const RECAP_MS = 5000;
const AUTO_RECAP_DELAY_MS = 3000;
const BUDDY_WIDTH = 40;
const BUDDY_HEIGHT = 55;
const CORNER_MARGIN = 16;
const STREAK_MILESTONES = [7, 30, 100, 365];
const BLINK_MIN_MS = 2500;
const BLINK_MAX_MS = 6000;
const BLINK_DURATION_MS = 150;

type Quirk = "stretch" | "look" | "hop" | "ear-twitch";
const QUIRKS: Quirk[] = ["stretch", "look", "hop", "ear-twitch"];
const QUIRK_MIN_MS = 8000;
const QUIRK_MAX_MS = 18000;
const QUIRK_DURATION_MS: Record<Quirk, number> = { stretch: 800, look: 1000, hop: 600, "ear-twitch": 500 };

const ACTIVITY_MIN_MS = 90000;
const ACTIVITY_MAX_MS = 180000;
const ACTIVITY_BUBBLE_MS = 4500;
/** Poses shown as a small side prop icon rather than a body-silhouette change (yoga/sleeping get the latter instead). */
const PROP_POSES: Pose[] = ["coffee", "lunch", "working", "friends", "cooking", "reading"];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function recapLines(recap: RecapSummary): string[] {
  const lines: string[] = [];
  if (recap.notesThisWeek > 0) {
    lines.push(`📊 This week: ${recap.notesThisWeek} note${recap.notesThisWeek === 1 ? "" : "s"} written`);
  }
  if (recap.currentStreak > 0) {
    lines.push(`🔥 ${recap.currentStreak}-day streak`);
  }
  if (recap.topTag) {
    lines.push(`🏷️ Top tag: #${recap.topTag}`);
  }
  if (recap.standoutNote) {
    lines.push(`⭐ Most connected: "${recap.standoutNote.name}"`);
  }
  return lines;
}

type Expression = "idle" | "sleepy" | "happy" | "thinking" | "oops" | "celebrate";

export function DeskBuddy() {
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);
  const researching = useAppStore((s) => s.researchCount > 0);
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);
  const setQuickSwitcherOpen = useAppStore((s) => s.setQuickSwitcherOpen);
  const tree = useAppStore((s) => s.tree);
  const scan = useAppStore((s) => s.scan);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const recapRequestCount = useAppStore((s) => s.recapRequestCount);

  const [asleep, setAsleep] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [celebrateMsg, setCelebrateMsg] = useState("");
  const [recapActive, setRecapActive] = useState(false);
  const [recapMsgLines, setRecapMsgLines] = useState<string[]>([]);
  const [blinking, setBlinking] = useState(false);
  const [quirk, setQuirk] = useState<Quirk | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const bounceTimerRef = useRef<number | null>(null);
  const celebrateTimerRef = useRef<number | null>(null);
  const recapTimerRef = useRef<number | null>(null);
  const blinkTimerRef = useRef<number | null>(null);
  const quirkTimerRef = useRef<number | null>(null);
  const quirkEndTimerRef = useRef<number | null>(null);
  const activityTimerRef = useRef<number | null>(null);
  const activityEndTimerRef = useRef<number | null>(null);
  const prevSavedAtRef = useRef<number | null>(lastSavedAt);
  const celebratedStreaksRef = useRef<Set<number>>(new Set());
  const prevRecapRequestRef = useRef(recapRequestCount);
  const autoRecapFiredRef = useRef(false);

  const presentRecap = (recap: RecapSummary, allowEmpty: boolean) => {
    const lines = recapLines(recap);
    if (lines.length === 0) {
      if (!allowEmpty) return;
      lines.push("📝 Not much data yet — keep writing!");
    }
    setRecapMsgLines(lines);
    setRecapActive(true);
    if (recapTimerRef.current !== null) window.clearTimeout(recapTimerRef.current);
    recapTimerRef.current = window.setTimeout(() => setRecapActive(false), RECAP_MS);
  };

  // Automatic recap, at most once per day, fired shortly after the vault's first scan completes.
  useEffect(() => {
    if (!vaultPath || !scan || autoRecapFiredRef.current) return;
    autoRecapFiredRef.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const recap = computeRecap(tree, scan);
        const worthShowing = recap.notesThisWeek > 0 || recap.currentStreak > 0 || recap.standoutNote !== null;
        if (!worthShowing) return;
        const today = todayISO();
        const last = await getLastRecapDate();
        if (last === today) return;
        presentRecap(recap, false);
        await saveLastRecapDate(today);
      })();
    }, AUTO_RECAP_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, scan]);

  // Manual recap, triggered from the insights panel's "Show recap" button.
  useEffect(() => {
    if (recapRequestCount === prevRecapRequestRef.current) return;
    prevRecapRequestRef.current = recapRequestCount;
    presentRecap(computeRecap(tree, scan), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapRequestCount]);

  useEffect(() => {
    return () => {
      if (recapTimerRef.current !== null) window.clearTimeout(recapTimerRef.current);
    };
  }, []);

  // Occasional idle blink, purely cosmetic, scheduled at a random cadence so it doesn't feel mechanical.
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
      blinkTimerRef.current = window.setTimeout(() => {
        setBlinking(true);
        window.setTimeout(() => setBlinking(false), BLINK_DURATION_MS);
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
    return () => {
      if (blinkTimerRef.current !== null) window.clearTimeout(blinkTimerRef.current);
    };
  }, []);

  // Occasional idle "quirk" — a stretch, look-around, hop, or ear twitch —
  // played at a random cadence to break up the constant float/tail-wag.
  // Scheduling runs unconditionally; rendering only applies it while idle
  // (see `animClass`/`earTwitch` below), so it just quietly skips a beat
  // if the buddy happens to be asleep or reacting to something else.
  useEffect(() => {
    const scheduleQuirk = () => {
      const delay = QUIRK_MIN_MS + Math.random() * (QUIRK_MAX_MS - QUIRK_MIN_MS);
      quirkTimerRef.current = window.setTimeout(() => {
        const pick = QUIRKS[Math.floor(Math.random() * QUIRKS.length)];
        setQuirk(pick);
        quirkEndTimerRef.current = window.setTimeout(() => setQuirk(null), QUIRK_DURATION_MS[pick]);
        scheduleQuirk();
      }, delay);
    };
    scheduleQuirk();
    return () => {
      if (quirkTimerRef.current !== null) window.clearTimeout(quirkTimerRef.current);
      if (quirkEndTimerRef.current !== null) window.clearTimeout(quirkEndTimerRef.current);
    };
  }, []);

  // Occasional "what Kit's up to" — a pose/prop matching the real-world time
  // of day, shown briefly on a random cadence. Scheduling runs unconditionally;
  // rendering only applies it while idle (see `idleActivity` below), same
  // gating approach as the quirk system just above.
  useEffect(() => {
    const scheduleActivity = () => {
      const delay = ACTIVITY_MIN_MS + Math.random() * (ACTIVITY_MAX_MS - ACTIVITY_MIN_MS);
      activityTimerRef.current = window.setTimeout(() => {
        setActivity(getCurrentActivity());
        activityEndTimerRef.current = window.setTimeout(() => setActivity(null), ACTIVITY_BUBBLE_MS);
        scheduleActivity();
      }, delay);
    };
    scheduleActivity();
    return () => {
      if (activityTimerRef.current !== null) window.clearTimeout(activityTimerRef.current);
      if (activityEndTimerRef.current !== null) window.clearTimeout(activityEndTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const resetIdle = () => {
      setAsleep(false);
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => setAsleep(true), IDLE_TIMEOUT_MS);
    };

    window.addEventListener("keydown", resetIdle);
    window.addEventListener("mousedown", resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener("keydown", resetIdle);
      window.removeEventListener("mousedown", resetIdle);
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (lastSavedAt !== null && lastSavedAt !== prevSavedAtRef.current) {
      prevSavedAtRef.current = lastSavedAt;
      setBounce(true);
      if (bounceTimerRef.current !== null) window.clearTimeout(bounceTimerRef.current);
      bounceTimerRef.current = window.setTimeout(() => setBounce(false), BOUNCE_MS);
    }
    return () => {
      if (bounceTimerRef.current !== null) window.clearTimeout(bounceTimerRef.current);
    };
  }, [lastSavedAt]);

  const stats = useMemo(() => computeStats(tree, scan), [tree, scan]);
  const healthTips = useMemo(() => computeHealthTips(tree, scan), [tree, scan]);

  useEffect(() => {
    const streak = stats.currentStreak;
    if (STREAK_MILESTONES.includes(streak) && !celebratedStreaksRef.current.has(streak)) {
      celebratedStreaksRef.current.add(streak);
      setCelebrateMsg(`🎉 ${streak}-day streak!`);
      setCelebrate(true);
      if (celebrateTimerRef.current !== null) window.clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = window.setTimeout(() => setCelebrate(false), CELEBRATE_MS);
    }
    return () => {
      if (celebrateTimerRef.current !== null) window.clearTimeout(celebrateTimerRef.current);
    };
  }, [stats.currentStreak]);

  const celebrating = celebrate || recapActive;

  const expression: Expression = error
    ? "oops"
    : celebrating
      ? "celebrate"
      : researching
        ? "thinking"
        : bounce
          ? "happy"
          : asleep
            ? "sleepy"
            : "idle";

  const handleClick = () => {
    if (error) {
      clearError();
      return;
    }
    setQuickSwitcherOpen(true);
  };

  const idleQuirk = expression === "idle" ? quirk : null;
  const idleActivity: Activity | null = expression === "idle" ? activity : null;

  const animClass =
    expression === "thinking"
      ? "buddy-think"
      : expression === "celebrate"
        ? "buddy-celebrate"
        : expression === "oops"
          ? "buddy-oops"
          : bounce
            ? "buddy-bounce"
            : idleQuirk === "stretch"
              ? "buddy-stretch"
              : idleQuirk === "look"
                ? "buddy-look"
                : idleQuirk === "hop"
                  ? "buddy-hop"
                  : "buddy-float";

  const showPopup = error ? true : hovered;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        right: CORNER_MARGIN,
        bottom: CORNER_MARGIN,
        width: BUDDY_WIDTH,
        height: BUDDY_HEIGHT,
        pointerEvents: "none",
        zIndex: 40,
      }}
    >
      {showPopup && (
        <div className="buddy-stats-popup" style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}>
          {error ? (
            <>
              <div className="text-xs font-medium" style={{ color: "var(--text)" }}>
                Something went wrong
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {error}
              </div>
              <div className="text-xs" style={{ color: "var(--accent)" }}>
                Click to dismiss
              </div>
            </>
          ) : (
            <>
              <StatsRow label="Notes" value={stats.noteCount} />
              <StatsRow label="Words today" value={stats.wordsToday} />
              <StatsRow label="Current streak" value={`${stats.currentStreak}d`} />
              <StatsRow label="Longest streak" value={`${stats.longestStreak}d`} />
              {healthTips.length > 0 && (
                <div className="mt-1 border-t pt-1" style={{ borderColor: "var(--border)" }}>
                  {healthTips.slice(0, 2).map((tip) => (
                    <div key={tip} className="text-xs" style={{ color: "var(--text-muted)" }}>
                      💡 {tip}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      <div
        className={animClass}
        style={{ pointerEvents: "auto", cursor: "pointer", width: "fit-content" }}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="Click to jump to a note (Ctrl/Cmd+K)"
      >
        <BuddySprite
          expression={expression}
          blinking={blinking && expression === "idle"}
          earTwitch={idleQuirk === "ear-twitch"}
          pose={idleActivity?.pose ?? null}
        />
      </div>
      {idleActivity && PROP_POSES.includes(idleActivity.pose) && (
        <div style={{ position: "absolute", left: -22, bottom: 16, pointerEvents: "none" }}>
          <PoseProp pose={idleActivity.pose} />
        </div>
      )}
      {expression === "sleepy" && <div className="buddy-zzz">z z z</div>}
      {expression === "thinking" && <div className="buddy-think-bubble">···</div>}
      {celebrate && <div className="buddy-celebrate-bubble">{celebrateMsg}</div>}
      {idleActivity && <div className="buddy-activity-bubble">{idleActivity.label}</div>}
      {recapActive && (
        <div className="buddy-recap-bubble">
          {recapMsgLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}

function BuddySprite({
  expression,
  blinking,
  earTwitch,
  pose,
}: {
  expression: Expression;
  blinking: boolean;
  earTwitch: boolean;
  pose: Pose | null;
}) {
  const fur = "#eda354";
  const muzzle = "#fdf1de";
  const ink = "#3b2a1a";
  const sparkle = "#6d5efc";

  return (
    <svg viewBox="0 0 16 22" width={BUDDY_WIDTH} height={BUDDY_HEIGHT} shapeRendering="crispEdges">
      {expression === "celebrate" && (
        <>
          <rect x="0" y="0" width="1" height="1" fill={sparkle} />
          <rect x="15" y="1" width="1" height="1" fill={sparkle} />
          <rect x="1" y="7" width="1" height="1" fill={sparkle} />
        </>
      )}

      {/* tail (subtly wags on its own, independent of expression) */}
      <g className="buddy-tail-wag" style={{ transformBox: "fill-box", transformOrigin: "bottom left" }}>
        <rect x="13" y="16" width="2" height="2" fill={fur} />
        <rect x="14" y="14" width="2" height="2" fill={fur} />
        <rect x="14" y="12" width="1" height="2" fill={muzzle} />
      </g>

      {/* ears (twitch briefly as an idle quirk) */}
      <g
        className={earTwitch ? "buddy-ear-twitch" : undefined}
        style={{ transformBox: "fill-box", transformOrigin: "bottom center" }}
      >
        <rect x="3" y="0" width="1" height="1" fill={fur} />
        <rect x="2" y="1" width="2" height="1" fill={fur} />
        <rect x="12" y="0" width="1" height="1" fill={fur} />
        <rect x="12" y="1" width="2" height="1" fill={fur} />
      </g>

      {/* head */}
      <rect x="4" y="2" width="8" height="1" fill={fur} />
      <rect x="3" y="3" width="1" height="1" fill={fur} />
      <rect x="12" y="3" width="1" height="1" fill={fur} />
      <rect x="2" y="3" width="12" height="8" fill={fur} />
      <rect x="3" y="11" width="1" height="1" fill={fur} />
      <rect x="12" y="11" width="1" height="1" fill={fur} />
      <rect x="4" y="12" width="8" height="1" fill={fur} />

      {/* muzzle patch */}
      <rect x="5" y="8" width="6" height="4" fill={muzzle} />

      {/* body */}
      <rect x="4" y="13" width="8" height="1" fill={fur} />
      <rect x="3" y="14" width="1" height="1" fill={fur} />
      <rect x="12" y="14" width="1" height="1" fill={fur} />
      <rect x="2" y="14" width="12" height="4" fill={fur} />
      <rect x="6" y="15" width="4" height="3" fill={muzzle} />
      <rect x="3" y="18" width="1" height="1" fill={fur} />
      <rect x="12" y="18" width="1" height="1" fill={fur} />
      <rect x="4" y="18" width="8" height="1" fill={fur} />

      {/* paws — folded into a seated cross-legged shape for yoga, otherwise the normal two-block stance */}
      {pose === "yoga" ? (
        <>
          <rect x="4" y="19" width="8" height="1" fill={fur} />
          <rect x="3" y="21" width="10" height="1" fill={muzzle} /> {/* meditation cushion */}
        </>
      ) : (
        <>
          <rect x="4" y="19" width="3" height="2" fill={fur} />
          <rect x="9" y="19" width="3" height="2" fill={fur} />
        </>
      )}

      {/* blanket, drawn over the lower body/paws for the late-night sleeping pose */}
      {pose === "sleeping" && (
        <>
          <rect x="3" y="18" width="10" height="3" fill={muzzle} />
          <rect x="5" y="19" width="1" height="1" fill={ink} />
          <rect x="10" y="19" width="1" height="1" fill={ink} />
        </>
      )}

      {/* eyebrows (oops only) */}
      {expression === "oops" && (
        <>
          <rect x="4" y="4" width="1" height="1" fill={ink} />
          <rect x="11" y="4" width="1" height="1" fill={ink} />
        </>
      )}

      {/* eyes */}
      {expression === "sleepy" ? (
        <>
          <rect x="4" y="5" width="2" height="1" fill={ink} />
          <rect x="10" y="5" width="2" height="1" fill={ink} />
        </>
      ) : expression === "happy" || expression === "celebrate" ? (
        <>
          <rect x="4" y="5" width="2" height="1" fill={ink} />
          <rect x="4" y="6" width="1" height="1" fill={ink} />
          <rect x="10" y="5" width="2" height="1" fill={ink} />
          <rect x="11" y="6" width="1" height="1" fill={ink} />
        </>
      ) : expression === "thinking" ? (
        <>
          <rect x="5" y="4" width="1" height="2" fill={ink} />
          <rect x="11" y="4" width="1" height="2" fill={ink} />
        </>
      ) : expression === "oops" ? (
        <>
          <rect x="5" y="6" width="1" height="1" fill={ink} />
          <rect x="10" y="6" width="1" height="1" fill={ink} />
        </>
      ) : blinking ? (
        <>
          <rect x="4" y="6" width="2" height="1" fill={ink} />
          <rect x="10" y="6" width="2" height="1" fill={ink} />
        </>
      ) : (
        <>
          <rect x="4" y="5" width="2" height="2" fill={ink} />
          <rect x="10" y="5" width="2" height="2" fill={ink} />
        </>
      )}

      {/* nose */}
      <rect x="7" y="8" width="2" height="1" fill={ink} />

      {/* mouth */}
      {expression === "happy" || expression === "celebrate" ? (
        <>
          <rect x="6" y="10" width="1" height="1" fill={ink} />
          <rect x="7" y="11" width="2" height="1" fill={ink} />
          <rect x="9" y="10" width="1" height="1" fill={ink} />
        </>
      ) : expression === "sleepy" ? (
        <rect x="7" y="10" width="2" height="1" fill={ink} />
      ) : expression === "thinking" ? (
        <rect x="8" y="10" width="1" height="1" fill={ink} />
      ) : expression === "oops" ? (
        <>
          <rect x="6" y="10" width="1" height="1" fill={ink} />
          <rect x="7" y="9" width="2" height="1" fill={ink} />
          <rect x="9" y="10" width="1" height="1" fill={ink} />
        </>
      ) : (
        <rect x="7" y="9" width="2" height="1" fill={ink} />
      )}
    </svg>
  );
}

const PROP_SIZE = 20;

/** Small side-icon props for the six "prop" poses (yoga/sleeping instead change the buddy's own body — see BuddySprite). */
function PoseProp({ pose }: { pose: Pose }) {
  const fur = "#eda354";
  const muzzle = "#fdf1de";
  const ink = "#3b2a1a";

  return (
    <svg viewBox="0 0 8 8" width={PROP_SIZE} height={PROP_SIZE} shapeRendering="crispEdges">
      {pose === "coffee" && (
        <>
          <rect x="2" y="3" width="4" height="4" fill={muzzle} />
          <rect x="6" y="4" width="1" height="2" fill={muzzle} />
          <rect x="2" y="7" width="4" height="1" fill={ink} />
          <rect x="3" y="1" width="1" height="1" fill={ink} />
          <rect x="4" y="0" width="1" height="1" fill={ink} />
        </>
      )}
      {pose === "lunch" && (
        <>
          <rect x="1" y="4" width="6" height="2" fill={muzzle} />
          <rect x="1" y="6" width="6" height="1" fill={ink} />
          <rect x="3" y="3" width="2" height="1" fill={ink} />
        </>
      )}
      {pose === "working" && (
        <>
          <rect x="1" y="4" width="6" height="3" fill={fur} />
          <rect x="1" y="1" width="6" height="3" fill={muzzle} />
          <rect x="2" y="2" width="4" height="1" fill={ink} />
        </>
      )}
      {pose === "friends" && (
        <>
          <rect x="1" y="1" width="6" height="4" fill={muzzle} />
          <rect x="1" y="5" width="1" height="1" fill={muzzle} />
          <rect x="2" y="2" width="1" height="1" fill={ink} />
          <rect x="4" y="2" width="1" height="1" fill={ink} />
          <rect x="6" y="2" width="1" height="1" fill={ink} />
        </>
      )}
      {pose === "cooking" && (
        <>
          <rect x="1" y="3" width="6" height="3" fill={fur} />
          <rect x="0" y="4" width="1" height="1" fill={fur} />
          <rect x="7" y="4" width="1" height="1" fill={fur} />
          <rect x="3" y="1" width="1" height="1" fill={ink} />
          <rect x="4" y="0" width="1" height="1" fill={ink} />
        </>
      )}
      {pose === "reading" && (
        <>
          <rect x="1" y="2" width="2" height="4" fill={muzzle} />
          <rect x="3" y="2" width="1" height="4" fill={ink} />
          <rect x="4" y="2" width="3" height="4" fill={muzzle} />
          <rect x="2" y="3" width="1" height="1" fill={ink} />
          <rect x="5" y="3" width="1" height="1" fill={ink} />
        </>
      )}
    </svg>
  );
}
