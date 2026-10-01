import { Injectable } from "@nestjs/common";
import { Prisma, type Employee } from "@prisma/client";
import type { DataScope } from "../../../shared/access/access-rules";
import { employeeScopeWhere } from "../../../shared/access/prisma-scope";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { BusinessRuleError } from "../../../shared/errors/errors";
import type {
  CreateEmployeeData,
  EmployeesRepositoryPort,
  EmployeeLockMode,
  ProfileFieldsData,
  UpdateEmployeeData,
} from "../application/ports/employees-repository.port";

@Injectable()
export class PrismaEmployeesRepository implements EmployeesRepositoryPort {
  constructor(private readonly db: TenantDatabase) {}

  async list(companyId: string, scope: DataScope): Promise<Employee[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employee.findMany({ where: { companyId, ...employeeScopeWhere(scope) }, orderBy: { employeeNo: "asc" } }),
    );
  }

  async findById(companyId: string, id: string): Promise<Employee | null> {
    return this.db.withTenant(companyId, (tx) => tx.employee.findFirst({ where: { id, companyId } }));
  }

  async findByIds(companyId: string, ids: string[]): Promise<Employee[]> {
    if (ids.length === 0) return [];
    return this.db.withTenant(companyId, (tx) => tx.employee.findMany({ where: { companyId, id: { in: ids } } }));
  }

  async findByUserIds(companyId: string, userIds: string[]): Promise<Employee[]> {
    if (userIds.length === 0) return [];
    return this.db.withTenant(companyId, (tx) => tx.employee.findMany({ where: { companyId, userId: { in: userIds } } }));
  }

  async create(companyId: string, data: CreateEmployeeData): Promise<Employee> {
    return this.db.withTenant(companyId, (tx) => tx.employee.create({ data: { companyId, ...data } }));
  }

  async nextEmployeeNo(companyId: string): Promise<string> {
    this.db.assertInTransaction();
    return this.db.withTenant(companyId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`employee_no:${companyId}`}))`;
      const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
        SELECT MAX(CAST(substring(employee_no from '^E-([0-9]{1,9})$') AS int)) AS max
        FROM employees WHERE company_id = ${companyId}::uuid AND employee_no ~ '^E-[0-9]{1,9}$'`;
      const next = Number(rows[0]?.max ?? 0) + 1;
      return `E-${String(next).padStart(4, "0")}`;
    });
  }

  async update(companyId: string, id: string, data: UpdateEmployeeData): Promise<Employee | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employee.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.employee.findFirst({ where: { id, companyId } });
    });
  }

  async findByIdForUpdate(companyId: string, id: string, mode: EmployeeLockMode = "no_key"): Promise<Employee | null> {
    this.db.assertInTransaction(); // outside one the lock would be released at once
    return this.db.withTenant(companyId, async (tx) => {
      // NO KEY UPDATE serialises writers of the row without conflicting with the KEY SHARE lock every
      // foreign-key insert/change (manager, documents, salary, invitations) takes on it. But an UPDATE that
      // changes a column in a unique index (user_id, employee_no, national_id) needs the full FOR UPDATE:
      // callers about to do that ask for "key" up front, so the lock is never upgraded mid-transaction
      // (an upgrade is the classic deadlock shape).
      const locked =
        mode === "key"
          ? await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM employees WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`
          : await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM employees WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR NO KEY UPDATE`;
      if (locked.length === 0) return null;
      return tx.employee.findFirst({ where: { id, companyId } });
    });
  }

  async delete(companyId: string, id: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      try {
        const { count } = await tx.employee.deleteMany({ where: { id, companyId } });
        return count > 0;
      } catch (error) {
        // P2003 = a record still points at this employee (salary components, documents…): a typed
        // business error instead of a raw database failure.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new BusinessRuleError(
            "employees.employee.has_dependents",
            "This employee still has related records; deactivate them instead of deleting",
          );
        }
        throw error;
      }
    });
  }

  async linkUser(companyId: string, employeeId: string, userId: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      // userId: null in the where clause is the atomic guard against a stale
      // second invitation acceptance overwriting an already-linked employee.
      const { count } = await tx.employee.updateMany({
        where: { id: employeeId, companyId, userId: null },
        data: { userId },
      });
      return count > 0;
    });
  }

  async findByUserId(companyId: string, userId: string): Promise<Employee | null> {
    return this.db.withTenant(companyId, (tx) => tx.employee.findFirst({ where: { companyId, userId } }));
  }

  async patchProfileFields(companyId: string, id: string, data: ProfileFieldsData): Promise<Employee | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employee.updateMany({ where: { id, companyId }, data });
      if (count === 0) return null;
      return tx.employee.findFirst({ where: { id, companyId } });
    });
  }

  async decideIban(
    companyId: string,
    id: string,
    expectedPendingIban: string,
    data: ProfileFieldsData,
  ): Promise<Employee | null> {
    return this.db.withTenant(companyId, async (tx) => {
      const { count } = await tx.employee.updateMany({
        where: { id, companyId, ibanReviewStatus: "pending_review", pendingIban: expectedPendingIban },
        data,
      });
      if (count === 0) return null;
      return tx.employee.findFirst({ where: { id, companyId } });
    });
  }

  async listPendingIban(companyId: string, scope: DataScope): Promise<Employee[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.employee.findMany({
        where: { companyId, ibanReviewStatus: "pending_review", ...employeeScopeWhere(scope) },
        orderBy: { updatedAt: "asc" },
      }),
    );
  }
}
