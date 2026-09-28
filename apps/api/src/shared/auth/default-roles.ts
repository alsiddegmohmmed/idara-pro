/**
 * Fixed IDs for the seeded system roles (global, companyId null — same as the
 * Owner role in prisma/seed.ts). Every user created by accepting an invitation
 * gets EMPLOYEE_ROLE_ID (docs/adr/0008-email-and-self-service.md) — without it
 * a new hire's account has zero permissions and cannot even see its own profile.
 */
export const OWNER_ROLE_ID = "00000000-0000-0000-0000-0000000000f1";
export const EMPLOYEE_ROLE_ID = "00000000-0000-0000-0000-0000000000f2";
