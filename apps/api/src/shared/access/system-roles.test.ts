import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@idara-pro/shared";
import { SYSTEM_ROLES } from "./system-roles";

const migrationsDir = path.resolve(__dirname, "../../../prisma/migrations");

/** Every (role, code, reach) tuple the migrations grant to system roles, replaying resets in order. */
function migratedGrants(): Set<string> {
  const grants = new Set<string>();
  for (const dir of readdirSync(migrationsDir).filter((d) => d.includes("access")).sort()) {
    const sql = readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8");
    for (const m of sql.matchAll(/\('(0{8}-0{4}-0{4}-0{4}-0{10}f\d)', '([a-z]+:[a-z-]+)', '(own|team|branch|company)'\)/g)) {
      grants.add(`${m[1]} ${m[2]} ${m[3]}`);
    }
  }
  return grants;
}

describe("system roles", () => {
  it("grant only catalog permissions", () => {
    const catalog = new Set<string>(Object.values(PERMISSIONS));
    for (const role of SYSTEM_ROLES) for (const code of Object.keys(role.grants)) expect(catalog.has(code)).toBe(true);
  });

  it("match what the migrations put in the database (regenerate the migration when this fails)", () => {
    const expected = new Set(SYSTEM_ROLES.flatMap((r) => Object.entries(r.grants).map(([code, scope]) => `${r.id} ${code} ${scope}`)));
    expect([...migratedGrants()].sort()).toEqual([...expected].sort());
  });

  it("never give salaries to executives or branch managers (ADR-0011 §7)", () => {
    for (const key of ["executive", "manager", "team_lead"]) {
      const role = SYSTEM_ROLES.find((r) => r.key === key);
      expect(role?.grants[PERMISSIONS.SALARY_READ]).toBeUndefined();
      expect(role?.grants[PERMISSIONS.EMPLOYEES_READ_SENSITIVE]).toBeUndefined();
    }
  });
});
