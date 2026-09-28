import { describe, expect, it } from "vitest";
import { summarizeDay, lateMinutes } from "./day-summary";
import { distanceMeters } from "./geo";
import { evaluatePunchLocation, punchSequenceError } from "./punch-rules";
import { dayKind, eachDate, localTimeToInstant, workDateOf } from "../../../shared/calendar/work-calendar";

const TZ = "Asia/Riyadh";
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const schedule = { startTime: "08:00", endTime: "16:00", lateGraceMin: 10, workDays: [0, 1, 2, 3, 4] };
// Riyadh is UTC+3: 08:00 local = 05:00Z.
const at = (isoUtc: string): Date => new Date(isoUtc);

describe("distance and punch location", () => {
  const branch = { lat: 24.7136, lng: 46.6753, radiusM: 150 };

  it("measures about 111 m for 0.001° of latitude", () => {
    expect(distanceMeters({ lat: 24.7136, lng: 46.6753 }, { lat: 24.7146, lng: 46.6753 })).toBeCloseTo(111.2, 0);
  });

  it("accepts a punch inside the branch radius with good accuracy", () => {
    const r = evaluatePunchLocation({ lat: 24.7141, lng: 46.6753, accuracyM: 20 }, branch, 100);
    expect(r).toMatchObject({ accepted: true, rejectReason: null });
    expect(r.distanceM).toBeCloseTo(55.6, 0);
  });

  it("rejects check-in when distance exceeds branch radius", () => {
    const r = evaluatePunchLocation({ lat: 24.7156, lng: 46.6753, accuracyM: 20 }, branch, 100);
    expect(r).toMatchObject({ accepted: false, rejectReason: "outside_branch_radius" });
  });

  it("accepts a punch exactly on the radius edge", () => {
    const edge = { ...branch, radiusM: Math.ceil(distanceMeters(branch, { lat: 24.7146, lng: 46.6753 })) };
    expect(evaluatePunchLocation({ lat: 24.7146, lng: 46.6753, accuracyM: 5 }, edge, 100).accepted).toBe(true);
  });

  it("rejects poor GPS accuracy before looking at distance", () => {
    const r = evaluatePunchLocation({ lat: 24.7136, lng: 46.6753, accuracyM: 101 }, branch, 100);
    expect(r).toMatchObject({ accepted: false, rejectReason: "gps_accuracy_too_low" });
  });
});

describe("punch sequence", () => {
  it("allows in → out → in", () => {
    expect(punchSequenceError(null, "in")).toBeNull();
    expect(punchSequenceError("in", "out")).toBeNull();
    expect(punchSequenceError("out", "in")).toBeNull();
  });
  it("refuses a second check-in and a check-out without check-in", () => {
    expect(punchSequenceError("in", "in")).toBe("already_checked_in");
    expect(punchSequenceError(null, "out")).toBe("not_checked_in");
    expect(punchSequenceError("out", "out")).toBe("not_checked_in");
  });
});

describe("work calendar", () => {
  const weekend = [5, 6]; // Friday, Saturday
  it("classifies Friday and Saturday as weekend, Sunday as working", () => {
    expect(dayKind(d("2026-10-02"), weekend, new Set(), null)).toBe("weekend"); // Friday
    expect(dayKind(d("2026-10-03"), weekend, new Set(), null)).toBe("weekend"); // Saturday
    expect(dayKind(d("2026-10-04"), weekend, new Set(), null)).toBe("working"); // Sunday
  });
  it("a holiday wins over a working day", () => {
    expect(dayKind(d("2026-09-23"), weekend, new Set(["2026-09-23"]), schedule)).toBe("holiday");
  });
  it("a day outside the schedule's work days is not a working day", () => {
    const sundayToWednesday = { workDays: [0, 1, 2, 3] };
    expect(dayKind(d("2026-10-01"), weekend, new Set(), sundayToWednesday)).toBe("weekend"); // Thursday
  });
  it("uses the Riyadh date, not UTC, around midnight", () => {
    expect(workDateOf(at("2026-09-30T21:30:00Z"), TZ).toISOString()).toBe("2026-10-01T00:00:00.000Z"); // 00:30 local
    expect(workDateOf(at("2026-09-30T20:59:00Z"), TZ).toISOString()).toBe("2026-09-30T00:00:00.000Z"); // 23:59 local
  });
  it("converts a local schedule time to an instant", () => {
    expect(localTimeToInstant(d("2026-10-04"), "08:00", TZ).toISOString()).toBe("2026-10-04T05:00:00.000Z");
  });
  it("lists dates across a month boundary", () => {
    expect(eachDate(d("2026-09-29"), d("2026-10-02")).map((x) => x.toISOString().slice(0, 10))).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });
});

describe("late minutes and day summary", () => {
  const workDate = d("2026-10-04"); // Sunday
  it("is not late within the grace period", () => {
    expect(lateMinutes(at("2026-10-04T05:10:00Z"), workDate, schedule, TZ)).toBe(0); // 08:10
  });
  it("counts minutes after start + grace", () => {
    expect(lateMinutes(at("2026-10-04T05:35:30Z"), workDate, schedule, TZ)).toBe(25); // 08:35:30
  });
  it("is never late without a schedule", () => {
    expect(lateMinutes(at("2026-10-04T09:00:00Z"), workDate, null, TZ)).toBe(0);
  });

  const base = { workDate, kind: "working" as const, schedule, timeZone: TZ };

  it("marks a late check-in as late and sums worked minutes of in/out pairs", () => {
    const s = summarizeDay({
      ...base,
      closed: false,
      punches: [
        { kind: "in", at: at("2026-10-04T05:30:00Z") },
        { kind: "out", at: at("2026-10-04T09:00:00Z") },
        { kind: "in", at: at("2026-10-04T10:00:00Z") },
        { kind: "out", at: at("2026-10-04T13:15:00Z") },
      ],
    });
    expect(s).toMatchObject({ status: "late", lateMin: 20, workedMin: 405, missingCheckout: false });
  });
  it("leaves an unpunched working day open until the day is closed, then absent", () => {
    expect(summarizeDay({ ...base, closed: false, punches: [] }).status).toBeNull();
    expect(summarizeDay({ ...base, closed: true, punches: [] }).status).toBe("absent");
  });
  it("flags a missing check-out only once the day is closed", () => {
    const punches = [{ kind: "in" as const, at: at("2026-10-04T05:00:00Z") }];
    expect(summarizeDay({ ...base, closed: false, punches }).missingCheckout).toBe(false);
    expect(summarizeDay({ ...base, closed: true, punches })).toMatchObject({ status: "present", missingCheckout: true, workedMin: 0 });
  });
  it("shows no check-out while checked in again after a break, but keeps the worked minutes", () => {
    const s = summarizeDay({
      ...base,
      closed: false,
      punches: [
        { kind: "in", at: at("2026-10-04T05:00:00Z") },
        { kind: "out", at: at("2026-10-04T09:00:00Z") },
        { kind: "in", at: at("2026-10-04T10:00:00Z") },
      ],
    });
    expect(s).toMatchObject({ lastOutAt: null, workedMin: 240 });
  });
  it("keeps weekend and holiday status even when someone punched", () => {
    const punches = [
      { kind: "in" as const, at: at("2026-10-02T06:00:00Z") },
      { kind: "out" as const, at: at("2026-10-02T08:00:00Z") },
    ];
    expect(summarizeDay({ ...base, workDate: d("2026-10-02"), kind: "weekend", closed: true, punches })).toMatchObject({
      status: "weekend",
      workedMin: 120,
    });
  });
});
