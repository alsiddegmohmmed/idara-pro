import { describe, expect, it } from "vitest";
import { detectFileType } from "./detect-file-type";

describe("detectFileType", () => {
  it("detects a PDF", () => {
    expect(detectFileType(Buffer.from("%PDF-1.7\n...", "latin1"))).toBe("pdf");
  });

  it("detects a JPEG", () => {
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe("jpg");
  });

  it("detects a PNG", () => {
    expect(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe("png");
  });

  it("rejects an executable renamed to .pdf", () => {
    expect(detectFileType(Buffer.from("MZ\x90\x00 this is not a pdf"))).toBeNull();
  });

  it("rejects HTML and empty input", () => {
    expect(detectFileType(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});
