import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { EmployeeDocument } from "@prisma/client";
import type { Readable } from "node:stream";
import type { CreateEmployeeDocument, UpdateEmployeeDocument } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { NotFoundError } from "../../../shared/errors/errors";
import { FILE_STORAGE, type FileStorage } from "../../../shared/storage/file-storage";
import { generateFileKey } from "../../../shared/storage/generate-file-key";
import { assertValidDocumentDates } from "../domain/employee-rules";
import { EmployeesService } from "./employees.service";
import {
  EMPLOYEE_DOCUMENTS_REPOSITORY,
  type EmployeeDocumentsRepositoryPort,
} from "./ports/employee-documents-repository.port";

export interface UploadedFile {
  buffer: Buffer;
  contentType: string;
  originalFilename: string;
}

@Injectable()
export class EmployeeDocumentsService {
  constructor(
    @Inject(EMPLOYEE_DOCUMENTS_REPOSITORY) private readonly repository: EmployeeDocumentsRepositoryPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly employees: EmployeesService,
    private readonly audit: AuditService,
  ) {}

  async listByEmployee(companyId: string, employeeId: string): Promise<EmployeeDocument[]> {
    await this.employees.findById(companyId, employeeId);
    return this.repository.listByEmployee(companyId, employeeId);
  }

  // employeeId is part of the URL for every nested route (see the
  // controller); it must match the document's actual owner so a valid
  // document id can't be fetched/mutated through another employee's path
  // segment within the same company (would become a real IDOR once
  // team/manager-scoped permissions narrow access below "whole company").
  async findByIdForEmployee(companyId: string, employeeId: string, id: string): Promise<EmployeeDocument> {
    const document = await this.repository.findById(companyId, id);
    if (!document || document.employeeId !== employeeId) {
      throw new NotFoundError("Document not found", "employees.document.not_found");
    }
    return document;
  }

  async upload(
    companyId: string,
    actorId: string,
    employeeId: string,
    metadata: CreateEmployeeDocument,
    file: UploadedFile,
    ip: string | null,
  ): Promise<EmployeeDocument> {
    await this.employees.findById(companyId, employeeId);

    const issueDate = metadata.issueDate ? new Date(metadata.issueDate) : null;
    const expiryDate = metadata.expiryDate ? new Date(metadata.expiryDate) : null;
    assertValidDocumentDates(issueDate, expiryDate);

    const fileKey = generateFileKey(companyId, "employee-documents");
    await this.storage.put(fileKey, file.buffer, file.contentType);

    const document = await this.repository.create(companyId, {
      employeeId,
      type: metadata.type,
      number: metadata.number,
      issueDate,
      expiryDate,
      fileKey,
      contentType: file.contentType,
      originalFilename: file.originalFilename,
      sizeBytes: file.buffer.length,
      checksumSha256: createHash("sha256").update(file.buffer).digest("hex"),
      createdBy: actorId,
    });
    await this.audit.record(companyId, {
      actorId,
      action: "create",
      entity: "employee_documents",
      entityId: document.id,
      after: toAuditSnapshot(document),
      ip,
    });
    return document;
  }

  async update(
    companyId: string,
    actorId: string,
    employeeId: string,
    id: string,
    input: UpdateEmployeeDocument,
    ip: string | null,
  ): Promise<EmployeeDocument> {
    const before = await this.findByIdForEmployee(companyId, employeeId, id);
    const issueDate =
      input.issueDate !== undefined ? (input.issueDate ? new Date(input.issueDate) : null) : before.issueDate;
    const expiryDate =
      input.expiryDate !== undefined ? (input.expiryDate ? new Date(input.expiryDate) : null) : before.expiryDate;
    assertValidDocumentDates(issueDate, expiryDate);

    const after = await this.repository.update(companyId, id, {
      type: input.type,
      number: input.number,
      issueDate: input.issueDate !== undefined ? issueDate : undefined,
      expiryDate: input.expiryDate !== undefined ? expiryDate : undefined,
    });
    if (!after) throw new NotFoundError("Document not found", "employees.document.not_found");
    await this.audit.record(companyId, {
      actorId,
      action: "update",
      entity: "employee_documents",
      entityId: id,
      before: toAuditSnapshot(before),
      after: toAuditSnapshot(after),
      ip,
    });
    return after;
  }

  async remove(
    companyId: string,
    actorId: string,
    employeeId: string,
    id: string,
    ip: string | null,
  ): Promise<void> {
    const before = await this.findByIdForEmployee(companyId, employeeId, id);
    const deleted = await this.repository.delete(companyId, id);
    if (!deleted) throw new NotFoundError("Document not found", "employees.document.not_found");
    // Best-effort: the DB row is already gone either way (same v1 tradeoff
    // noted in ADR-0005 for a failed write leaving an orphaned file).
    await this.storage.delete(before.fileKey).catch(() => undefined);
    await this.audit.record(companyId, {
      actorId,
      action: "delete",
      entity: "employee_documents",
      entityId: id,
      before: toAuditSnapshot(before),
      ip,
    });
  }

  /** ADR-0005: downloads always go through the API with a permission check
   * (enforced by the controller's guards) and an audit entry — not covered by
   * AGENTS.md §3 rule 6's list, but the ADR requires it explicitly. */
  async download(
    companyId: string,
    actorId: string,
    employeeId: string,
    id: string,
    ip: string | null,
  ): Promise<{ stream: Readable; document: EmployeeDocument }> {
    const document = await this.findByIdForEmployee(companyId, employeeId, id);
    const stream = await this.storage.get(document.fileKey);
    await this.audit.record(companyId, {
      actorId,
      action: "download",
      entity: "employee_documents",
      entityId: id,
      ip,
    });
    return { stream, document };
  }
}
