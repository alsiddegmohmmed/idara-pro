import { z, type ZodRawShape } from "zod";

/**
 * Wraps a Zod shape describing required env vars. AGENTS.md §3 rule 8: no secrets
 * in code, env vars validated at startup — callers should invoke `parse()` once,
 * synchronously, before the app accepts traffic, and let it throw on bad config.
 */
export function defineEnvSchema<T extends ZodRawShape>(shape: T) {
  const schema = z.object(shape);

  function parse(source: Record<string, string | undefined> = process.env): z.infer<typeof schema> {
    const result = schema.safeParse(source);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new Error(`Invalid environment configuration: ${details}`);
    }
    return result.data;
  }

  return { schema, parse };
}
