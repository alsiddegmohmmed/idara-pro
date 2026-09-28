export type DetectedFileType = "pdf" | "jpg" | "png";

export const ALLOWED_UPLOAD_MIME: Record<DetectedFileType, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
};

/** Max size of any uploaded document (HR or self-service). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const startsWith = (buffer: Buffer, bytes: readonly number[]): boolean =>
  buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

/**
 * Sniffs the real type from magic bytes — the client-declared MIME type and file
 * extension are attacker-controlled and never trusted. Only PDF/JPG/PNG are allowed.
 */
export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  return null;
}
