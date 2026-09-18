export type DayPeriod =
  | "earlyMorning"
  | "morning"
  | "midday"
  | "afternoon"
  | "earlyEvening"
  | "evening"
  | "night"
  | "lateNight";

export type Pose = "yoga" | "coffee" | "lunch" | "working" | "friends" | "cooking" | "reading" | "sleeping";

export interface Activity {
  pose: Pose;
  label: string;
}

/** Maps the hour of day (0-23) to a broad period of Kit's "day". Boundaries are inclusive of the start hour. */
export function getDayPeriod(hour: number): DayPeriod {
  if (hour >= 5 && hour < 8) return "earlyMorning";
  if (hour >= 8 && hour < 11) return "morning";
  if (hour >= 11 && hour < 13.5) return "midday";
  if (hour >= 13.5 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 19) return "earlyEvening";
  if (hour >= 19 && hour < 21) return "evening";
  if (hour >= 21 && hour < 23) return "night";
  return "lateNight";
}

/** Exactly one representative activity per period — the most iconic thing Kit could be doing then. */
export const ACTIVITIES: Record<DayPeriod, Activity> = {
  earlyMorning: { pose: "yoga", label: "morning yoga" },
  morning: { pose: "coffee", label: "morning coffee" },
  midday: { pose: "lunch", label: "lunch time" },
  afternoon: { pose: "working", label: "working" },
  earlyEvening: { pose: "friends", label: "meeting friends" },
  evening: { pose: "cooking", label: "making dinner" },
  night: { pose: "reading", label: "reading a book" },
  lateNight: { pose: "sleeping", label: "sleeping" },
};

/** The activity for whatever moment `date` represents (defaults to now); `date` is injectable for testability. */
export function getCurrentActivity(date: Date = new Date()): Activity {
  return ACTIVITIES[getDayPeriod(date.getHours())];
}
