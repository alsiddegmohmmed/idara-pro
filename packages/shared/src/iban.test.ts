import { describe, expect, it } from "vitest";
import { hasValidIbanChecksum, isValidSaudiIban, maskIban, normalizeIban } from "./iban.js";

// Widely published example Saudi IBAN (bank code 80).
const VALID = "SA0380000000608010167519";

/** Independent construction of a valid IBAN from a 20-char BBAN, via the standard
 * check-digit formula (98 - mod97 of BBAN + "SA00" with letters as numbers). */
function buildSaudiIban(bban: string): string {
  const numeric = (bban + "SA00").replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  const check = String(98 - remainder).padStart(2, "0");
  return `SA${check}${bban}`;
}

describe("isValidSaudiIban", () => {
  it("accepts a valid IBAN", () => {
    expect(isValidSaudiIban(VALID)).toBe(true);
  });

  it("accepts an independently constructed IBAN with alphanumeric account part", () => {
    expect(isValidSaudiIban(buildSaudiIban("10000000AB1234567890"))).toBe(true);
  });

  it("rejects a bad checksum", () => {
    expect(isValidSaudiIban("SA0480000000608010167519")).toBe(false);
  });

  it("normalizes lowercase and spaces before validating", () => {
    expect(isValidSaudiIban("sa03 8000 0000 6080 1016 7519")).toBe(true);
    expect(normalizeIban(" sa03 8000 ")).toBe("SA038000");
  });

  it("rejects wrong length or wrong country prefix", () => {
    expect(isValidSaudiIban("SA03800000006080101675")).toBe(false);
    expect(isValidSaudiIban("GB29NWBK60161331926819")).toBe(false);
  });
});

describe("hasValidIbanChecksum", () => {
  it("is true only for remainder 1", () => {
    expect(hasValidIbanChecksum(VALID)).toBe(true);
    expect(hasValidIbanChecksum("SA0380000000608010167518")).toBe(false);
  });
});

describe("maskIban", () => {
  it("keeps only the last 4 characters", () => {
    expect(maskIban(VALID)).toBe("SA•• •••• ••••7519");
  });

  it("returns null for empty input", () => {
    expect(maskIban(null)).toBeNull();
  });
});
