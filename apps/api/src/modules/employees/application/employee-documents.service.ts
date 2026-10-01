import type { DataScope } from "../../../shared/access/access-rules";
import { createHash } from "node:crypto";
import { CLOCK, type Clock } from "../../../shared/clock/clock";
import { companyDateOnly } from "../../../shared/clock/company-date";
import { Inject, Injectable } from "@nestjs/common";
import type { EmployeeDocument } from "@prisma/client";
import type { Readable } from "node:stream";
import type { CreateEmployeeDocument, UpdateEmployeeDocument } from "@idara-pro/shared";
import { AuditService, toAuditSnapshot } from "../../audit";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../../shared/errors/errors";
import { FILE_STORAGE, type FileStorage } from "../../../shared/storage/file-storage";
import { ALLOWED_UPLOAD_MIME, detectFileType, MAX_UPLOAD_BYTES } from "../../../shared/storage/detect-file-type";
import { generateFileKey } from "../../../shared/storage/generate-file-key";
import type { UploadedFile } from "../../../shared/storage/uploaded-file";
import { assertValidDocumentDates } from "../domain/employee-rules";
import { EmployeesService } from "./employees.service";
import {
  EMPLOYEE_DOCUMENTS_REPOSITORY,
  type EmployeeDocumentsRepositoryPort,
} from "./ports/employee-documents-repository.port";

export type { UploadedFile };

/** Four eyes: HR-side document routes are trusted (auto-approved), so they can't touch your own record. */
function assertNotOwnRecord(actorId: string, employeeUserId: string | null): void {
  if (employeeUserId !== null && employeeUserId === actorId) {
    throw new ForbiddenError("Use your own profile for your own documents", "employees.review.own_submission");
  }
}

/** Backstop against one account flooding the HR queue / disk; not a business rule. */
const MAX_PENDING_SELF_UPLOADS = 20;

export interface ExpiringDocumentView {
  id: string;
  type: string;
  expiryDate: string;
  /** Negative = already expired. */
  daysLeft: number;
  employee: { id: string; fullNameAr: string; fullNameEn: string };
}

@Injectable()
export class EmployeeDocumentsService {
  constructor(
    @Inject(EMPLOYEE_DOCUMENTS_REPOSITORY) private readonly repository: EmployeeDocumentsRepositoryPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly employees: EmployeesService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Dashboard: approved documents of active employees that expire within `days` or already expired, soonest first. */
  async listExpiring(companyId: string, days: number, scope: DataScope): Promise<ExpiringDocumentView[]> {
    const today = companyDateOnly(this.clock.now());
    const limit = today.getTime() + days * 86_400_000;
    return (await this.repository.listExpiringCandidates(companyId, scope))
      .filter((d) => d.expiryDate.getTime() <= limit)
      .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())
      .map((d) => ({
        id: d.id,
        type: d.type,
        expiryDate: d.expiryDate.toISOString().slice(0, 10),
        daysLeft: Math.round((d.expiryDate.getTime() - today.getTime()) / 86_400_000),
        employee: { id: d.employee.id, fullNameAr: d.employee.fullNameAr, fullNameEn: d.employee.fullNameEn },
      }));
  }

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
    // HR's own uploads are already vetted; an employee's self-service upload
    // waits for HR (docs/domain/business-rules.md "Employee onboarding").
    source: "hr" | "self" = "hr",
  ): Promise<EmployeeDocument> {
    const owner = await this.employees.findById(companyId, employeeId);
    // HR uploads are auto-approved, so a reviewer must not use them for their own record (use /me).
    if (source === "hr") assertNotOwnRecord(actorId, owner?.userId ?? null);

    if (source === "self") {
      const existing = await this.repository.listByEmployee(companyId, employeeId);
      if (existing.filter((d) => d.reviewStatus === "pending_review").length >= MAX_PENDING_SELF_UPLOADS) {
        throw new BusinessRuleError("employees.document.too_many_pending", "Too many documents are already awaiting review");
      }
    }

    // Never trust the client-declared MIME type or extension — sniff the bytes.
    if (file.buffer.length > MAX_UPLOAD_BYTES) {
      throw new BusinessRuleError("employees.document.too_large", "File exceeds the 10 MB limit");
    }
    const detected = detectFileType(file.buffer);
    if (!detected) {
      throw new BusinessRuleError("employees.document.invalid_file_type", "Only PDF, JPG and PNG files are allowed");
    }

    const issueDate = metadata.issueDate ? new Date(metadata.issueDate) : null;
    const expiryDate = metadata.expiryDate ? new Date(metadata.expiryDate) : null;
    assertValidDocumentDates(issueDate, expiryDate);

    const fileKey = generateFileKey(companyId, "employee-documents");
    const contentType = ALLOWED_UPLOAD_MIME[detected];
    await this.storage.put(fileKey, file.buffer, contentType);

    const document = await this.repository.create(companyId, {
      employeeId,
      type: metadata.type,
      number: metadata.number,
      issueDate,
      expiryDate,
      fileKey,
      contentType,
      originalFilename: file.originalFilename,
      sizeBytes: file.buffer.length,
      checksumSha256: createHash("sha256").update(file.buffer).digest("hex"),
      reviewStatus: source === "hr" ? "approved" : "pending_review",
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
    assertNotOwnRecord(actorId, (await this.employees.findById(companyId, employeeId))?.userId ?? null);
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
