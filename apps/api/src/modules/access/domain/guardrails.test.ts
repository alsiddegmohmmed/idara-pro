import { describe, expect, it } from "vitest";
import { assertGrantable, assertKeepsSuperAdmin, assertNotSelf } from "./guardrails";

const g = (over: Partial<{ company: boolean; branchIds: string[]; team: boolean; own: boolean }>) => ({
  company: false, branchIds: [], team: false, own: false, ...over,
});

describe("access guardrails", () => {
  it("lets a company-wide holder grant any reach", () => {
    expect(() => assertGrantable({ "leave:approve": g({ company: true }) }, [{ code: "leave:approve", scope: "company" }], ["x"])).not.toThrow();
  });

  it("refuses a permission the actor does not hold", () => {
    expect(() => assertGrantable({}, [{ code: "salary:read", scope: "own" }])).toThrow("cannot grant salary:read");
  });

  it("refuses a wider reach than the actor's", () => {
    expect(() => assertGrantable({ "leave:approve": g({ branchIds: ["r"] }) }, [{ code: "leave:approve", scope: "company" }])).toThrow();
  });

  it("lets a branch holder grant branch reach only inside their branches", () => {
    const actor = { "leave:approve": g({ branchIds: ["riyadh"] }) };
    expect(() => assertGrantable(actor, [{ code: "leave:approve", scope: "branch" }], ["riyadh"])).not.toThrow();
    expect(() => assertGrantable(actor, [{ code: "leave:approve", scope: "branch" }], ["jeddah"])).toThrow();
  });

  it("allows team and own below a branch reach", () => {
    const actor = { "attendance:read": g({ branchIds: ["riyadh"] }) };
    expect(() => assertGrantable(actor, [{ code: "attendance:read", scope: "team" }, { code: "attendance:read", scope: "own" }])).not.toThrow();
  });

  it("blocks self-edits and removing the last Super admin", () => {
    expect(() => assertNotSelf("u1", "u1")).toThrow("your own access");
    expect(() => assertKeepsSuperAdmin(0)).toThrow("last Super admin");
    expect(() => assertKeepsSuperAdmin(1)).not.toThrow();
  });
});
