import { BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { BusinessRuleError } from "../../../shared/errors/errors";
import type { UploadedFile } from "../application/employee-documents.service";

/** Parses a multipart body by hand: text fields + exactly one "file" part. */
export async function readUpload(request: FastifyRequest): Promise<{ fields: Record<string, string>; file: UploadedFile }> {
  const fields: Record<string, string> = {};
  let file: UploadedFile | undefined;
  try {
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (file) throw new BadRequestException("Only one file per upload");
        // contentType here is only what the client claimed — the service sniffs the real type.
        file = { buffer: await part.toBuffer(), contentType: part.mimetype, originalFilename: part.filename };
      } else {
        fields[part.fieldname] = part.value as string;
      }
    }
  } catch (error) {
    if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      throw new BusinessRuleError("employees.document.too_large", "File exceeds the 10 MB limit");
    }
    throw error;
  }
  if (!file) throw new BadRequestException("A file is required");
  return { fields, file };
}
