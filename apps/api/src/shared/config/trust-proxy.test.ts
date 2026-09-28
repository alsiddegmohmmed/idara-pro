import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "./trust-proxy";

describe("parseTrustProxy", () => {
  it("trusts nobody when unset or blank", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("  ")).toBe(false);
  });

  it("splits a comma-separated list and trims entries", () => {
    expect(parseTrustProxy("10.0.0.0/8, 172.16.0.0/12 ,loopback")).toEqual(["10.0.0.0/8", "172.16.0.0/12", "loopback"]);
  });
});
