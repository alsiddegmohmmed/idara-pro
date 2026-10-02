import { Injectable } from "@nestjs/common";
import {
  COUNTRY_CODES,
  PERMISSIONS,
  type ImportReport,
  type ImportRowError,
  type ImportRowResult,
} from "@idara-pro/shared";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { SYSTEM_JOB_SCOPE } from "../../../shared/access/prisma-scope";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BranchesService, WorkSchedulesService } from "../../company";
import { foldName, orderByManager, parseImportRow, usesPersonal, usesSalary, type ImportLookups, type ParsedImportRow } from "../domain/employee-import";
import { DepartmentsService } from "./departments.service";
import { buildImportTemplate, readImportFile } from "./employee-import-workbook";
import { EmployeeScopeService } from "./employee-scope.service";
import { EmployeesService } from "./employees.service";
import { PositionsService } from "./positions.service";
import { SalaryComponentsService } from "./salary-components.service";

/** A whole branch in one go: give the database time (each row is several writes, all in one transaction). */
const IMPORT_TIMEOUT_MS = 180_000;

/**
 * Excel import of employees (roadmap Phase 5). A dry run checks every row — formats, references by name,
 * duplicates in the file and in the company, permissions (branch reach, personal data, IBAN, salary) —
 * and saves nothing. A real run does the same checks and then creates every employee in one transaction,
 * or nothing at all if any row has an error. Each employee goes through EmployeesService.create (same
 * audit, career history and access refresh as one added by hand); salaries start on the hire date.
 */
@Injectable()
export class ImportEmployeesUseCase {
  constructor(
    private readonly employees: EmployeesService,
    private readonly salaries: SalaryComponentsService,
    private readonly scope: EmployeeScopeService,
    private readonly departments: DepartmentsService,
    private readonly branches: BranchesService,
    private readonly schedules: WorkSchedulesService,
    private readonly positions: PositionsService,
    private readonly db: TenantDatabase,
  ) {}

  async template(companyId: string): Promise<Buffer> {
    const [branches, departments, schedules, positions] = await Promise.all([
      this.branches.list(companyId),
      this.departments.list(companyId),
      this.schedules.list(companyId),
      this.positions.list(companyId),
    ]);
    return buildImportTemplate({
      branches: branches.map((b) => b.name),
      departments: departments.map((d) => d.name),
      schedules: schedules.map((s) => s.name),
      positions: positions.map((p) => p.nameAr),
    });
  }

  async run(user: AuthenticatedUser, file: Buffer, dryRun: boolean, ip: string | null): Promise<ImportReport> {
    const { companyId } = user;
    const sheetRows = await readImportFile(file);
    const lookups = await this.lookups(companyId);
    // Uniqueness is company-wide (sign-in names, employee numbers), so compare against everyone.
    const existing = await this.employees.list(companyId, SYSTEM_JOB_SCOPE);
    const takenIds = new Set(existing.map((e) => e.nationalId));
    const existingNo = new Map(existing.map((e) => [foldName(e.employeeNo), e.id]));

    const parsed: ParsedImportRow[] = sheetRows.map((r) => parseImportRow(r.cells, lookups));
    // Job titles come from the managed list (ux-redesign-v2 §5). A new title is added on import by someone
    // who manages company setup; for anyone else it must already exist.
    const titles = new Map((await this.positions.list(companyId)).map((p) => [foldName(p.nameAr), p.id]));
    const canAddTitles = this.scope.covers(user, PERMISSIONS.ORG_MANAGE, { employeeId: "new", branchId: null });
    const seenIds = new Map<string, number>();
    const seenNos = new Map<string, number>();
    parsed.forEach((p, i) => {
      const cells = sheetRows[i]?.cells ?? {};
      const fail = (column: ImportRowError["column"], code: string): void => {
        if (!p.errors.some((e) => e.column === column)) p.errors.push({ column, code });
      };
      const title = cells.jobTitle?.trim();
      if (title && !titles.has(foldName(title)) && !canAddTitles) fail("jobTitle", "unknown_title");
      const branchId = p.input?.branchId ?? null;
      if (p.input && !this.scope.covers(user, PERMISSIONS.EMPLOYEES_CREATE, { employeeId: "new", branchId })) fail("branch", "out_of_scope");
      const target = { employeeId: "new", branchId };
      if (usesPersonal(cells) && !this.scope.covers(user, PERMISSIONS.EMPLOYEES_READ_SENSITIVE, target)) fail("row", "personal_permission");
      if (cells.iban && !this.scope.covers(user, PERMISSIONS.EMPLOYEES_REVIEW, target)) fail("iban", "permission");
      if (usesSalary(cells) && !this.scope.covers(user, PERMISSIONS.SALARY_MANAGE, target)) fail("basicSalary", "permission");

      const nationalId = p.input?.nationalId;
      if (nationalId) {
        if (takenIds.has(nationalId)) fail("nationalId", "exists");
        else if (seenIds.has(nationalId)) fail("nationalId", "duplicate");
        seenIds.set(nationalId, i);
      }
      const no = p.input?.employeeNo ? foldName(p.input.employeeNo) : null;
      if (no) {
        if (existingNo.has(no)) fail("employeeNo", "exists");
        else if (seenNos.has(no)) fail("employeeNo", "duplicate");
        seenNos.set(no, i);
      }
    });
    // Managers: someone already in the system, or a row of this file (created first). Rows are matched by the
    // employee number as typed, so a manager whose own row has a mistake isn't also reported as "unknown".
    const fileNo = (i: number): string | null => {
      const raw = sheetRows[i]?.cells.employeeNo;
      return raw ? foldName(raw) : null;
    };
    const fileNos = new Set(parsed.map((_, i) => fileNo(i)).filter((x): x is string => x !== null));
    parsed.forEach((p, i) => {
      if (!p.managerNo) return;
      const m = foldName(p.managerNo);
      if (m === fileNo(i)) p.errors.push({ column: "managerNo", code: "self" });
      else if (!existingNo.has(m) && !fileNos.has(m)) p.errors.push({ column: "managerNo", code: "unknown" });
    });
    const { order, cycle } = orderByManager(parsed.map((p, i) => ({ employeeNo: fileNo(i), managerNo: p.managerNo ? foldName(p.managerNo) : null })));
    for (const i of cycle) parsed[i]?.errors.push({ column: "managerNo", code: "cycle" });

    const rows: ImportRowResult[] = parsed.map((p, i) => ({
      row: sheetRows[i]?.row ?? 0,
      status: p.errors.length === 0 ? "ready" : "error",
      name: (sheetRows[i]?.cells.fullNameAr ?? "") || null,
      employeeNo: p.input?.employeeNo ?? null,
      errors: p.errors,
    }));
    const report: ImportReport = {
      dryRun,
      total: rows.length,
      ready: rows.filter((r) => r.status === "ready").length,
      withErrors: rows.filter((r) => r.status === "error").length,
      created: 0,
      rows,
    };
    if (dryRun || report.withErrors > 0) return report;

    report.created = await this.db.transaction(
      companyId,
      async () => {
        const createdNo = new Map<string, string>();
        let created = 0;
        for (const i of order) {
          const p = parsed[i];
          if (!p?.input) continue;
          const m = p.managerNo ? foldName(p.managerNo) : null;
          const managerId = m ? (createdNo.get(m) ?? existingNo.get(m) ?? null) : null;
          const title = p.input.jobTitle?.trim();
          let positionId: string | null = null;
          if (title) {
            positionId = titles.get(foldName(title)) ?? (await this.positions.findOrCreate(companyId, user.userId, title, ip)).id;
            titles.set(foldName(title), positionId);
          }
          const employee = await this.employees.create(companyId, user.userId, { ...p.input, managerId, positionId }, ip);
          createdNo.set(foldName(employee.employeeNo), employee.id);
          for (const [type, amountHalalas] of Object.entries(p.salary) as Array<["basic" | "housing" | "transport", string]>) {
            await this.salaries.create(companyId, user.userId, employee.id, { type, amountHalalas, effectiveFrom: p.input.hireDate, effectiveTo: null }, ip);
          }
          created += 1;
        }
        return created;
      },
      IMPORT_TIMEOUT_MS,
    );
    return report;
  }

  private async lookups(companyId: string): Promise<ImportLookups> {
    const [branches, departments, schedules] = await Promise.all([
      this.branches.list(companyId),
      this.departments.list(companyId),
      this.schedules.list(companyId),
    ]);
    const byName = (rows: Array<{ id: string; name: string }>): Map<string, string> => new Map(rows.map((r) => [foldName(r.name), r.id]));
    const countries = new Map<string, string>();
    const ar = new Intl.DisplayNames(["ar"], { type: "region" });
    const en = new Intl.DisplayNames(["en"], { type: "region" });
    for (const code of COUNTRY_CODES) {
      countries.set(foldName(code), code);
      for (const name of [ar.of(code), en.of(code)]) if (name) countries.set(foldName(name), code);
    }
    // Common ways people write a few nationalities.
    for (const [alias, code] of [["سعودي", "SA"], ["سعودية", "SA"], ["السعودية", "SA"], ["المملكة العربية السعودية", "SA"], ["مصري", "EG"], ["هندي", "IN"], ["باكستاني", "PK"], ["فلبيني", "PH"], ["سوداني", "SD"], ["يمني", "YE"], ["أردني", "JO"], ["سوري", "SY"], ["بنغلاديشي", "BD"]] as const) {
      countries.set(foldName(alias), code);
    }
    return {
      branches: byName(branches),
      departments: byName(departments),
      schedules: byName(schedules),
      countries,
      onlyBranchId: branches.length === 1 ? (branches[0]?.id ?? null) : null,
    };
  }
}

