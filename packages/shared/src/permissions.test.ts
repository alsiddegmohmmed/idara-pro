import { describe, expect, it } from "vitest";
import { PERMISSIONS, isPermissionCode } from "./permissions.js";

describe("permission codes", () => {
  it("are all in resource:action form", () => {
    for (const code of Object.values(PERMISSIONS)) {
      expect(code).toMatch(/^[a-z]+:[a-z]+$/);
    }
  });

  it("recognizes a known code and rejects an unknown one", () => {
    expect(isPermissionCode(PERMISSIONS.LEAVE_APPROVE)).toBe(true);
    expect(isPermissionCode("invoices:create")).toBe(false);
  });
});
