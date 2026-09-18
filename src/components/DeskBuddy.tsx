import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../state/store";
import { computeStats, computeHealthTips } from "../lib/stats";

const IDLE_TIMEOUT_MS = 15000;
const BOUNCE_MS = 700;
const CELEBRATE_MS = 2200;
const BUDDY_WIDTH = 40;
const BUDDY_HEIGHT = 55;
const CORNER_MARGIN = 16;
const STREAK_MILESTONES = [7, 30, 100, 365];
const BLINK_MIN_MS = 2500;
const BLINK_MAX_MS = 6000;
const BLINK_DURATION_MS = 150;

type Expression = "idle" | "sleepy" | "happy" | "thinking" | "oops" | "celebrate";

export function DeskBuddy() {
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);
  const researching = useAppStore((s) => s.researchCount > 0);
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);
  const setQuickSwitcherOpen = useAppStore((s) => s.setQuickSwitcherOpen);
  const tree = useAppStore((s) => s.tree);
  const scan = useAppStore((s) => s.scan);

  const [asleep, setAsleep] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [celebrateMsg, setCelebrateMsg] = useState("");
  const [blinking, setBlinking] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const bounceTimerRef = useRef<number | null>(null);
  const celebrateTimerRef = useRef<number | null>(null);
  const blinkTimerRef = useRef<number | null>(null);
  const prevSavedAtRef = useRef<number | null>(lastSavedAt);
  const celebratedStreaksRef = useRef<Set<number>>(new Set());

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

  const expression: Expression = error
    ? "oops"
    : celebrate
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

  const animClass =
    expression === "thinking"
      ? "buddy-think"
      : expression === "celebrate"
        ? "buddy-celebrate"
        : expression === "oops"
          ? "buddy-oops"
          : bounce
            ? "buddy-bounce"
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
        <BuddySprite expression={expression} blinking={blinking && expression === "idle"} />
      </div>
      {expression === "sleepy" && <div className="buddy-zzz">z z z</div>}
      {expression === "thinking" && <div className="buddy-think-bubble">···</div>}
      {expression === "celebrate" && <div className="buddy-celebrate-bubble">{celebrateMsg}</div>}
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

function BuddySprite({ expression, blinking }: { expression: Expression; blinking: boolean }) {
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

      {/* ears */}
      <rect x="3" y="0" width="1" height="1" fill={fur} />
      <rect x="2" y="1" width="2" height="1" fill={fur} />
      <rect x="12" y="0" width="1" height="1" fill={fur} />
      <rect x="12" y="1" width="2" height="1" fill={fur} />

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

      {/* paws */}
      <rect x="4" y="19" width="3" height="2" fill={fur} />
      <rect x="9" y="19" width="3" height="2" fill={fur} />

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
