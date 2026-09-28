import type { Readable } from "node:stream";
import type { EmployeeDocument } from "@prisma/client";
import type { FastifyReply } from "fastify";

/** Streams a stored document as a download. The content type is the sniffed one stored at upload. */
export async function sendDocumentFile(
  reply: FastifyReply,
  stream: Readable,
  document: Pick<EmployeeDocument, "contentType" | "originalFilename">,
): Promise<void> {
  reply.header("Content-Type", document.contentType);
  reply.header("X-Content-Type-Options", "nosniff");
  // ASCII fallback (quotes/control chars stripped so a crafted upload name can't break out of
  // the quoted value) plus a UTF-8 filename* — uploaded documents are Arabic-first.
  const asciiFallback = document.originalFilename.replace(/[^\x20-\x7E]|["\\]/g, "_");
  reply.header(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`,
  );
  await reply.send(stream);
}
