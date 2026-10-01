import type { PrismaClient } from "@prisma/client";

/** What a test user signs in with: the national ID of their employee record, or their email if they have none. */
export async function signInId(db: PrismaClient, email: string): Promise<string> {
  const user = await db.user.findFirst({ where: { email }, include: { employee: true } });
  return user?.employee?.nationalId ?? email;
}

/** Wrong-password counters live in Redis for 15 minutes and are shared across test runs: start each run clean. */
export async function clearLoginCounters(redis: { keys(pattern: string): Promise<string[]>; del(...keys: string[]): Promise<number> }): Promise<void> {
  const stale = await redis.keys("login:*");
  if (stale.length > 0) await redis.del(...stale);
}
