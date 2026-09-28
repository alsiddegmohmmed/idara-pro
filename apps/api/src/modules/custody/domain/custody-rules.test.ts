import { describe, expect, it } from "vitest";
import { canTransition, settlementError } from "./custody-rules";

describe("custody rules", () => {
  it("follows requested → approved → paid → settled", () => {
    expect(canTransition("requested", "approved")).toBe(true);
    expect(canTransition("approved", "paid")).toBe(true);
    expect(canTransition("paid", "settled")).toBe(true);
  });
  it("refuses skipping steps and moving out of a final state", () => {
    expect(canTransition("requested", "paid")).toBe(false);
    expect(canTransition("approved", "settled")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("settled", "paid")).toBe(false);
  });
  it("only a pending request can be cancelled", () => {
    expect(canTransition("requested", "cancelled")).toBe(true);
    expect(canTransition("approved", "cancelled")).toBe(false);
  });
  it("allows settling less than paid but never more", () => {
    expect(settlementError(500_000n, 420_050n)).toBeNull();
    expect(settlementError(500_000n, 500_000n)).toBeNull();
    expect(settlementError(500_000n, 500_001n)).toBe("exceeds_paid");
  });
});
