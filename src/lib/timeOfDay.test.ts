import { describe, it, expect } from "vitest";
import { getDayPeriod, getCurrentActivity, ACTIVITIES, type DayPeriod } from "./timeOfDay";

describe("getDayPeriod", () => {
  it("maps representative hours to the expected period", () => {
    expect(getDayPeriod(5)).toBe("earlyMorning");
    expect(getDayPeriod(7)).toBe("earlyMorning");
    expect(getDayPeriod(8)).toBe("morning");
    expect(getDayPeriod(10)).toBe("morning");
    expect(getDayPeriod(11)).toBe("midday");
    expect(getDayPeriod(13)).toBe("midday");
    expect(getDayPeriod(14)).toBe("afternoon");
    expect(getDayPeriod(16)).toBe("afternoon");
    expect(getDayPeriod(17)).toBe("earlyEvening");
    expect(getDayPeriod(18)).toBe("earlyEvening");
    expect(getDayPeriod(19)).toBe("evening");
    expect(getDayPeriod(20)).toBe("evening");
    expect(getDayPeriod(21)).toBe("night");
    expect(getDayPeriod(22)).toBe("night");
    expect(getDayPeriod(23)).toBe("lateNight");
    expect(getDayPeriod(0)).toBe("lateNight");
    expect(getDayPeriod(4)).toBe("lateNight");
  });

  it("covers every hour of the day with exactly one period, no gaps or overlaps", () => {
    const seen = new Set<DayPeriod>();
    for (let h = 0; h < 24; h++) {
      expect(() => getDayPeriod(h)).not.toThrow();
      seen.add(getDayPeriod(h));
    }
    // every declared period is reachable by at least one hour
    expect(seen.size).toBe(Object.keys(ACTIVITIES).length);
  });

  it("every period has exactly one activity defined", () => {
    const periods = Object.keys(ACTIVITIES) as DayPeriod[];
    expect(periods.length).toBe(8);
    for (const p of periods) {
      expect(ACTIVITIES[p]).toBeDefined();
      expect(ACTIVITIES[p].label.length).toBeGreaterThan(0);
    }
  });
});

describe("getCurrentActivity", () => {
  it("returns the yoga activity for an early-morning hour", () => {
    const activity = getCurrentActivity(new Date(2024, 0, 1, 6, 0));
    expect(activity.pose).toBe("yoga");
    expect(activity.label).toBe("morning yoga");
  });

  it("returns the sleeping activity for a late-night hour", () => {
    const activity = getCurrentActivity(new Date(2024, 0, 1, 2, 0));
    expect(activity.pose).toBe("sleeping");
  });

  it("returns the working activity for a mid-afternoon hour", () => {
    const activity = getCurrentActivity(new Date(2024, 0, 1, 15, 0));
    expect(activity.pose).toBe("working");
  });

  it("defaults to the current time when no date is passed", () => {
    expect(() => getCurrentActivity()).not.toThrow();
  });
});
