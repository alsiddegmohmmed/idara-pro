import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "@idara-pro/shared";

// Runs as the migration/owner role (DATABASE_URL), not idara_app — seeding the
// global permission catalog and a default company is a migration-time concern,
// not app runtime. No admin user yet: password hashing lands with Stage 4 auth.
const prisma = new PrismaClient();

async function main(): Promise<void> {
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
    where: { id: "00000000-0000-0000-0000-0000000000f1" },
    create: { id: "00000000-0000-0000-0000-0000000000f1", name: "Owner", isSystem: true },
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

  console.log(`Seeded ${permissions.length} permissions, company "${company.nameEn}", role "${ownerRole.name}".`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
