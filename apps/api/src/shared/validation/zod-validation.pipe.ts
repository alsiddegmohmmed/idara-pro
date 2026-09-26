import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/** AGENTS.md §3 rule 5: every request body validated with a Zod schema from
 * packages/shared; unknown fields rejected (schemas there use .strict()). */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((issue) => issue.message).join("; "));
    }
    return result.data;
  }
}
