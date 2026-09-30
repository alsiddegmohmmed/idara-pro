import { describe, expect, it } from "vitest";
import { buildGrants, isAssignmentActive, reachesAnything, reachableBranches, scopeCovers, scopeFor, widestReach, type AccessSnapshot, type AssignmentRow } from "./access-rules";

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const today = d("2026-10-01");
const assignment = (over: Partial<AssignmentRow>): AssignmentRow => ({
  branchMode: "home",
  selectedBranchIds: [],
  validFrom: null,
  validTo: null,
  grants: [],
  ...over,
});
const snapshot = (grants: AccessSnapshot["grants"], over: Partial<AccessSnapshot> = {}): AccessSnapshot => ({
  userId: "u1",
  companyId: "c1",
  employeeId: "me",
  homeBranchId: "riyadh",
  teamIds: ["r1", "r2"],
  grants,
  ...over,
});

describe("isAssignmentActive", () => {
  it("counts valid_from and valid_to as inclusive days", () => {
    expect(isAssignmentActive({ validFrom: d("2026-10-01"), validTo: d("2026-10-01") }, today)).toBe(true);
  });
  it("ignores an assignment that starts tomorrow or ended yesterday", () => {
    expect(isAssignmentActive({ validFrom: d("2026-10-02"), validTo: null }, today)).toBe(false);
    expect(isAssignmentActive({ validFrom: null, validTo: d("2026-09-30") }, today)).toBe(false);
  });
});

describe("buildGrants", () => {
  it("gives a branch-reach home assignment the holder's own branch", () => {
    const g = buildGrants([assignment({ grants: [{ code: "leave:approve", scope: "branch" }] })], "riyadh", today);
    expect(g["leave:approve"]?.branchIds).toEqual(["riyadh"]);
  });

  it("gives a home assignment no branch when the holder has no employee record", () => {
    const g = buildGrants([assignment({ grants: [{ code: "leave:approve", scope: "branch" }] })], null, today);
    expect(g["leave:approve"]?.branchIds).toEqual([]);
  });

  it("uses the selected branches for a regional manager", () => {
    const g = buildGrants(
      [assignment({ branchMode: "selected", selectedBranchIds: ["jeddah", "dammam"], grants: [{ code: "attendance:read", scope: "branch" }] })],
      "riyadh",
      today,
    );
    expect(g["attendance:read"]?.branchIds).toEqual(["jeddah", "dammam"]);
  });

  it("unions several roles: a branch manager who is also HR for another branch", () => {
    const g = buildGrants(
      [
        assignment({ grants: [{ code: "leave:approve", scope: "branch" }] }),
        assignment({ branchMode: "selected", selectedBranchIds: ["jeddah"], grants: [{ code: "leave:approve", scope: "branch" }, { code: "salary:read", scope: "branch" }] }),
      ],
      "riyadh",
      today,
    );
    expect(g["leave:approve"]?.branchIds.sort()).toEqual(["jeddah", "riyadh"]);
    expect(g["salary:read"]?.branchIds).toEqual(["jeddah"]);
  });

  it("skips expired cover and unknown reaches", () => {
    const g = buildGrants(
      [
        assignment({ validTo: d("2026-09-30"), grants: [{ code: "leave:approve", scope: "company" }] }),
        assignment({ grants: [{ code: "leave:read", scope: "galaxy" }] }),
      ],
      "riyadh",
      today,
    );
    expect(g).toEqual({});
  });
});

describe("scopeFor / scopeCovers", () => {
  const riyadhEmployee = { employeeId: "x", branchId: "riyadh" };
  const jeddahEmployee = { employeeId: "y", branchId: "jeddah" };

  it("returns null for a permission the user does not hold", () => {
    expect(scopeFor(snapshot({}), "salary:read")).toBeNull();
    expect(scopeCovers(null, riyadhEmployee)).toBe(false);
  });

  it("company reach covers every branch", () => {
    const scope = scopeFor(snapshot({ "employees:read": { company: true, branchIds: [], team: false, own: false } }), "employees:read");
    expect(scopeCovers(scope, jeddahEmployee)).toBe(true);
  });

  it("branch reach covers its branch only", () => {
    const scope = scopeFor(snapshot({ "employees:read": { company: false, branchIds: ["riyadh"], team: false, own: false } }), "employees:read");
    expect(scopeCovers(scope, riyadhEmployee)).toBe(true);
    expect(scopeCovers(scope, jeddahEmployee)).toBe(false);
  });

  it("team reach covers reports wherever they sit, but not the user themself", () => {
    const scope = scopeFor(snapshot({ "leave:approve": { company: false, branchIds: [], team: true, own: false } }), "leave:approve");
    expect(scopeCovers(scope, { employeeId: "r2", branchId: "jeddah" })).toBe(true);
    expect(scopeCovers(scope, { employeeId: "me", branchId: "riyadh" })).toBe(false);
  });

  it("own reach covers only the user's own record", () => {
    const scope = scopeFor(snapshot({ "leave:request": { company: false, branchIds: [], team: false, own: true } }), "leave:request");
    expect(scopeCovers(scope, { employeeId: "me", branchId: "riyadh" })).toBe(true);
    expect(scopeCovers(scope, riyadhEmployee)).toBe(false);
  });

  it("judges a time-bound record by its own branch snapshot, not the employee's current branch", () => {
    const scope = scopeFor(snapshot({ "leave:approve": { company: false, branchIds: ["riyadh"], team: false, own: false } }), "leave:approve");
    expect(scopeCovers(scope, { employeeId: "moved", branchId: "riyadh" })).toBe(true);
  });
});

describe("reachesAnything", () => {
  it("is false for branch reach without any branch", () => {
    expect(reachesAnything({ company: false, branchIds: [], team: false, own: false })).toBe(false);
    expect(reachesAnything({ company: false, branchIds: [], team: false, own: true })).toBe(true);
  });
});

describe("widestReach / reachableBranches", () => {
  it("orders company > branch > team > own", () => {
    expect(widestReach({ company: false, branchIds: ["a"], team: true, own: true })).toBe("branch");
    expect(widestReach({ company: false, branchIds: [], team: true, own: true })).toBe("team");
  });

  it("lists the branches reached by any permission", () => {
    const s = snapshot({
      a: { company: false, branchIds: ["riyadh"], team: false, own: false },
      b: { company: false, branchIds: ["jeddah"], team: false, own: false },
    });
    expect(reachableBranches(s)).toEqual({ all: false, branchIds: ["riyadh", "jeddah"] });
    expect(reachableBranches(snapshot({ a: { company: true, branchIds: [], team: false, own: false } }))).toEqual({ all: true });
  });

  it("ignores company-wide grants that are not about employees (branches list, own notifications)", () => {
    const s = snapshot({
      "org:read": { company: true, branchIds: [], team: false, own: false },
      "salary:read": { company: false, branchIds: ["jeddah"], team: false, own: false },
    });
    expect(reachableBranches(s)).toEqual({ all: false, branchIds: ["jeddah"] });
  });
});
