import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "@idara-pro/shared";
import { EMPLOYEE_ROLE_ID, OWNER_ROLE_ID } from "../src/shared/auth/default-roles";
import { hashPassword } from "../src/shared/auth/password";

// Runs as the migration/owner role (DATABASE_URL), not idara_app — seeding the
// global permission catalog, default company, and dev admin user is a
// migration-time concern, not app runtime.
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set to seed the dev admin user — see apps/api/.env.example.",
    );
  }

  for (const code of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { code },
      create: { code },
      update: {},
    });
  }

  const company = await prisma.company.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      nameAr: "الشركة",
      nameEn: "Default Company",
    },
    update: {},
  });

  const ownerRole = await prisma.role.upsert({
    where: { id: OWNER_ROLE_ID },
    create: { id: OWNER_ROLE_ID, name: "Owner", isSystem: true },
    update: {},
  });

  const permissions = await prisma.permission.findMany();
  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: ownerRole.id,
      permissionId: permission.id,
      scope: "company",
    })),
    skipDuplicates: true,
  });

  // Default role for every invited employee (docs/adr/0008-email-and-self-service.md):
  // exactly the self-service baseline, nothing more.
  const employeeRole = await prisma.role.upsert({
    where: { id: EMPLOYEE_ROLE_ID },
    create: { id: EMPLOYEE_ROLE_ID, name: "Employee", isSystem: true },
    update: {},
  });
  const employeePermissions = permissions.filter(
    (permission) =>
      permission.code === PERMISSIONS.EMPLOYEES_SELF_SERVICE || permission.code === PERMISSIONS.NOTIFICATIONS_READ,
  );
  await prisma.rolePermission.createMany({
    data: employeePermissions.map((permission) => ({
      roleId: employeeRole.id,
      permissionId: permission.id,
      scope: "own",
    })),
    skipDuplicates: true,
  });

  // Argon2id, same as the auth module (apps/api/src/shared/auth/password.ts) —
  // never a different hashing scheme for a "dev-only" user.
  const passwordHash = await hashPassword(adminPassword);
  const adminUser = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: adminEmail } },
    create: {
      companyId: company.id,
      email: adminEmail,
      passwordHash,
      status: "active",
    },
    update: { passwordHash, status: "active" },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: ownerRole.id } },
    create: { userId: adminUser.id, roleId: ownerRole.id },
    update: {},
  });

  console.log(
    `Seeded ${permissions.length} permissions, company "${company.nameEn}", role "${ownerRole.name}", admin user "${adminUser.email}".`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
