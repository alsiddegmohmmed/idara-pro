import { Prisma } from "@prisma/client";
import { BusinessRuleError } from "../errors/errors";

/** Runs a delete; a row still referenced elsewhere (Postgres FK, Prisma P2003) becomes a typed business error. */
export async function deleteOrInUse<T>(run: () => Promise<T>, code: string, message: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new BusinessRuleError(code, message);
    throw error;
  }
}
