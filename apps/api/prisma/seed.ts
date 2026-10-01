import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "@idara-pro/shared";
import { SUPER_ADMIN_ROLE_ID, SYSTEM_ROLES } from "../src/shared/access/system-roles";
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

  // System roles (ADR-0011 §7) — the migration creates them too; this keeps a fresh dev DB identical.
  const permissions = await prisma.permission.findMany();
  const permissionId = new Map(permissions.map((p) => [p.code, p.id]));
  for (const role of SYSTEM_ROLES) {
    const data = { key: role.key, name: role.nameEn, nameAr: role.nameAr, description: role.description, isSystem: true, isTemplate: role.template };
    await prisma.role.upsert({ where: { id: role.id }, create: { id: role.id, ...data }, update: data });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: Object.entries(role.grants).map(([code, scope]) => ({ roleId: role.id, permissionId: permissionId.get(code) as string, scope })),
    });
  }

  // Default leave types (ADR-0010) — the migration seeds them for companies that already exist,
  // this covers the dev company the seed itself just created.
  const leaveTypes = [
    { code: "annual", nameAr: "إجازة سنوية", nameEn: "Annual leave", paid: true, deductsBalance: true, defaultDays: 21 },
    {
      code: "sick",
      nameAr: "إجازة مرضية",
      nameEn: "Sick leave",
      paid: true,
      deductsBalance: false,
      defaultDays: null,
      // Labor Law art. 117 default (migration 20261001000000_leave_rules); medical certificate required.
      payTiers: [
        { days: 30, percent: 100 },
        { days: 60, percent: 75 },
        { days: 30, percent: 0 },
      ],
      requiresAttachment: true,
    },
    { code: "emergency", nameAr: "إجازة اضطرارية", nameEn: "Emergency leave", paid: true, deductsBalance: true, defaultDays: 5 },
    { code: "unpaid", nameAr: "إجازة بدون راتب", nameEn: "Unpaid leave", paid: false, deductsBalance: false, defaultDays: null },
  ];
  for (const type of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { companyId_code: { companyId: company.id, code: type.code } },
      create: { companyId: company.id, ...type },
      update: {},
    });
  }

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

  const hasSuperAdmin = await prisma.roleAssignment.findFirst({ where: { userId: adminUser.id, roleId: SUPER_ADMIN_ROLE_ID } });
  if (!hasSuperAdmin) {
    await prisma.roleAssignment.create({ data: { companyId: company.id, userId: adminUser.id, roleId: SUPER_ADMIN_ROLE_ID } });
  }

  console.log(
    `Seeded ${permissions.length} permissions, ${SYSTEM_ROLES.length} system roles, company "${company.nameEn}", super admin "${adminUser.email}".`,
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
